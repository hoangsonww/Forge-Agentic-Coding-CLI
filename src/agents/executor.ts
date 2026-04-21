import { Agent, AgentResult } from './base';
import { ModelMessage, PlanStep, ToolContext, ToolResult } from '../types';
import { callModel } from '../models/router';
import { assembleTaskPrompt } from '../prompts/assembler';
import { allTools, getTool, hasTool } from '../tools/registry';
import { ForgeRuntimeError } from '../types/errors';
import { requestPermission, PermissionFlags } from '../permissions/manager';
import { log } from '../logging/logger';
import { loadGlobalInstructions, loadProjectInstructions } from '../config/loader';
import { newRunId } from '../logging/trace';
import { modePolicy } from '../core/mode-policy';
import { runValidation } from '../core/validation';

/**
 * Executor agent — executes a single plan step via iterative tool use. This is the core of the system's ability to carry out complex, multi-step plans that require reasoning and adaptation. The agent receives a step description and a catalog of tools, and can call tools in a loop until it determines the step is complete. The output includes a summary of what was done, the results of each tool call, and any files changed.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

export interface ExecutorStepOutput {
  step: PlanStep;
  toolResults: Array<{ tool: string; args: unknown; result: ToolResult<unknown> }>;
  summary: string;
  filesChanged: string[];
  /** Number of model turns the executor consumed for this step. */
  turns: number;
  /** True when the model explicitly signalled `done`. */
  completed: boolean;
}

const executorSchemaPrompt = `You are executing a single step of an approved plan via iterative tool use.

Each turn, output STRICT JSON:
{
  "actions": [
    { "tool": string, "args": object, "justification": string }
  ],
  "summary": string,
  "done"?: boolean
}

Protocol:
- Choose tools from the catalog only. Each action's args must match the tool's input schema.
- You will receive the result of every tool call before your next turn. Read errors carefully.
- If a tool fails, either retry with different args, switch tools, or set "done": true with a summary explaining what is blocked and why.
- Set "done": true with an empty actions array once the step is satisfied.
- Never include prose outside JSON. No code fences outside a single JSON object.`;

const TRUNCATE = 2_000;

const truncate = (s: string): string =>
  s.length <= TRUNCATE ? s : s.slice(0, TRUNCATE) + `\n…[truncated ${s.length - TRUNCATE}B]`;

const parseModelOutput = (
  content: string,
): {
  actions: Array<{ tool: string; args: Record<string, unknown> }>;
  summary: string;
  done: boolean;
} => {
  const fence = /```(?:json)?\s*([\s\S]+?)\s*```/i.exec(content);
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(fence ? fence[1] : content);
  } catch {
    obj = null;
  }
  const rawActions = obj && Array.isArray((obj as any).actions) ? (obj as any).actions : [];
  const actions = rawActions
    .filter((a: any) => a && typeof a.tool === 'string')
    .map((a: any) => ({
      tool: String(a.tool),
      args: (a.args && typeof a.args === 'object' ? a.args : {}) as Record<string, unknown>,
    }));
  const summary = typeof (obj as any)?.summary === 'string' ? String((obj as any).summary) : '';
  const done = Boolean((obj as any)?.done);
  return { actions, summary, done };
};

/**
 * Compact, model-facing digest of a tool invocation. We serialise enough
 * for the model to diagnose, but truncate large payloads so we don't
 * burn context on one step.
 */
const digestToolResult = (entry: {
  tool: string;
  args: unknown;
  result: ToolResult<unknown>;
}): Record<string, unknown> => {
  const base: Record<string, unknown> = {
    tool: entry.tool,
    success: entry.result.success,
    durationMs: entry.result.durationMs,
  };
  if (entry.result.success) {
    const out = entry.result.output as unknown;
    if (out && typeof out === 'object') {
      const o = out as Record<string, unknown>;
      // run_command / run_tests share this shape. Normalise it.
      if ('stdout' in o || 'stderr' in o || 'exitCode' in o) {
        base.exitCode = o.exitCode ?? null;
        base.stdout = truncate(String(o.stdout ?? ''));
        base.stderr = truncate(String(o.stderr ?? ''));
        if (o.timedOut) base.timedOut = true;
      } else {
        const serialised = JSON.stringify(o);
        base.output = truncate(serialised);
      }
    } else if (typeof out === 'string') {
      base.output = truncate(out);
    }
  } else {
    base.error = {
      class: entry.result.error?.class ?? 'tool_error',
      message: truncate(String(entry.result.error?.message ?? 'unknown error')),
      retryable: entry.result.error?.retryable ?? false,
      recoveryHint: entry.result.error?.recoveryHint,
    };
  }
  return base;
};

export const executorAgent: Agent = {
  name: 'executor',
  description: 'Executes a single plan step via iterative tool use.',
  async run(): Promise<AgentResult> {
    return {
      success: false,
      message: 'executor.run is a delegate; use runStep() directly.',
    };
  },
};

export interface RunStepParams {
  step: PlanStep;
  projectRoot: string;
  taskId: string;
  projectId: string;
  mode: import('../types').Mode;
  flags: PermissionFlags;
  runId?: string;
  /** Optional override for testing. */
  validate?: (projectRoot: string) => Promise<{ ok: boolean; ran: string[]; message?: string }>;
}

export const runStep = async (params: RunStepParams): Promise<ExecutorStepOutput> => {
  const runId = params.runId ?? newRunId();
  const policy = modePolicy(params.mode);
  const toolCtx: ToolContext = {
    taskId: params.taskId,
    projectId: params.projectId,
    projectRoot: params.projectRoot,
    traceId: runId,
    runId,
  };

  // ---- Direct-tool shortcut ----
  // If the plan nominates a concrete tool + args, honour them as-is. This
  // preserves the prior fast-path for deterministic steps (e.g. `run_tests`
  // with a specific command) and avoids spending a model turn to echo them.
  if (params.step.tool && hasTool(params.step.tool) && params.step.args) {
    const tool = getTool(params.step.tool);
    await requestPermissionFor(
      tool.schema,
      params.projectId,
      params.taskId,
      params.step,
      params.flags,
    );
    const result = await tool.execute(params.step.args, toolCtx);
    const filesChanged = extractFilesChanged(tool.schema.name, params.step.args, result);
    return {
      step: params.step,
      toolResults: [{ tool: tool.schema.name, args: params.step.args, result }],
      summary: result.success
        ? `ran ${tool.schema.name}`
        : `FAILED ${tool.schema.name}: ${result.error?.message ?? ''}`,
      filesChanged,
      turns: 0,
      completed: result.success,
    };
  }

  // ---- Iterative tool-use loop ----
  const initialPrompt = assembleTaskPrompt({
    mode: params.mode,
    title: `Execute step: ${params.step.description}`,
    description:
      `Step id=${params.step.id}, type=${params.step.type}` +
      (params.step.target ? `, target=${params.step.target}` : ''),
    globalInstructions: loadGlobalInstructions(),
    projectInstructions: loadProjectInstructions(params.projectRoot),
    tools: allTools(),
    additionalUserText: `${executorSchemaPrompt}\n\nSTEP:\n${JSON.stringify(params.step, null, 2)}`,
  });
  const messages: ModelMessage[] = [...initialPrompt.messages];

  const toolResults: Array<{ tool: string; args: unknown; result: ToolResult<unknown> }> = [];
  const filesChanged: string[] = [];
  let summary = '';
  let completed = false;
  let validationRetriesLeft = policy.maxValidationRetries;

  const maxTurns = Math.max(1, policy.maxExecutorTurns);
  let turn = 0;
  while (turn < maxTurns) {
    turn++;
    let response;
    try {
      const { response: r } = await callModel('executor', params.mode, messages, {
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 1500,
        timeoutMs: 60_000,
      });
      response = r;
    } catch (err) {
      log.warn('executor: model call failed', {
        err: String(err),
        step: params.step.id,
        turn,
      });
      return {
        step: params.step,
        toolResults,
        summary: summary || `model_error: ${String(err)}`,
        filesChanged,
        turns: turn,
        completed: false,
      };
    }
    const parsed = parseModelOutput(response.content);
    if (parsed.summary) summary = parsed.summary;

    // No actions requested → the model is either finishing or stuck. Either
    // way we stop here; `done` signals success, absence signals a short-circuit.
    if (!parsed.actions.length) {
      completed = parsed.done;
      break;
    }

    const turnDigests: Array<Record<string, unknown>> = [];
    let anyFailed = false;
    for (const action of parsed.actions) {
      if (!hasTool(action.tool)) {
        const result: ToolResult<unknown> = {
          success: false,
          error: { class: 'not_found', message: `Unknown tool ${action.tool}`, retryable: false },
          durationMs: 0,
        };
        toolResults.push({ tool: action.tool, args: action.args, result });
        turnDigests.push(digestToolResult({ tool: action.tool, args: action.args, result }));
        anyFailed = true;
        continue;
      }
      const tool = getTool(action.tool);
      const readOnlyEffect =
        tool.schema.sideEffect === 'pure' || tool.schema.sideEffect === 'readonly';
      if (!readOnlyEffect && !policy.allowMutations) {
        const result: ToolResult<unknown> = {
          success: false,
          error: {
            class: 'permission_denied',
            message: `Mode ${params.mode} is read-only; tool ${tool.schema.name} is blocked.`,
            retryable: false,
          },
          durationMs: 0,
        };
        toolResults.push({ tool: tool.schema.name, args: action.args, result });
        turnDigests.push(digestToolResult({ tool: tool.schema.name, args: action.args, result }));
        anyFailed = true;
        continue;
      }
      try {
        await requestPermissionFor(
          tool.schema,
          params.projectId,
          params.taskId,
          params.step,
          params.flags,
        );
      } catch (err) {
        const result: ToolResult<unknown> = {
          success: false,
          error:
            err instanceof ForgeRuntimeError
              ? err.toJSON()
              : { class: 'permission_denied', message: String(err), retryable: false },
          durationMs: 0,
        };
        toolResults.push({ tool: tool.schema.name, args: action.args, result });
        turnDigests.push(digestToolResult({ tool: tool.schema.name, args: action.args, result }));
        anyFailed = true;
        continue;
      }
      const result = await tool.execute(action.args, toolCtx);
      toolResults.push({ tool: tool.schema.name, args: action.args, result });
      turnDigests.push(digestToolResult({ tool: tool.schema.name, args: action.args, result }));
      if (result.success) {
        filesChanged.push(...extractFilesChanged(tool.schema.name, action.args, result));
      } else {
        anyFailed = true;
      }
    }

    // All actions succeeded and the model signalled done → exit early.
    if (!anyFailed && parsed.done) {
      completed = true;
      break;
    }

    // Out of turns? Don't bother paying for one more model call.
    if (turn >= maxTurns) break;

    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content:
        `TOOL_RESULTS (turn ${turn}):\n` +
        JSON.stringify(turnDigests, null, 2) +
        `\n\nReview the results above. If the step is satisfied, reply with {"actions":[],"summary":"…","done":true}. ` +
        `If a tool failed, either try a corrective action or set done=true and explain what is blocked.`,
    });
  }

  // ---- Validation gate ----
  // Only engage when the step actually touched files and the mode enables it.
  if (completed && filesChanged.length && policy.maxValidationRetries > 0) {
    const validator = params.validate ?? runValidation;
    while (validationRetriesLeft >= 0) {
      const vres = await validator(params.projectRoot);
      if (vres.ok) break;
      if (validationRetriesLeft === 0 || turn >= maxTurns) {
        // Out of budget — surface as a synthetic tool failure so the loop
        // caller (runAgenticLoop) treats the step as failed and escalates
        // to diagnose() at the retry boundary.
        const result: ToolResult<unknown> = {
          success: false,
          error: {
            class: 'tool_error',
            message: vres.message ?? 'Validation failed.',
            retryable: true,
            recoveryHint: 'Address the validator output before continuing.',
          },
          durationMs: 0,
        };
        toolResults.push({
          tool: 'validation_gate',
          args: { ran: vres.ran },
          result,
        });
        completed = false;
        break;
      }
      validationRetriesLeft--;
      turn++;
      messages.push({
        role: 'user',
        content:
          `VALIDATION_FAILED (ran: ${vres.ran.join(', ') || 'n/a'}):\n` +
          (vres.message ?? '(no message)') +
          `\n\nProduce a corrective action as JSON. Same schema as before. Set done=true once validation would pass.`,
      });
      let response;
      try {
        const { response: r } = await callModel('executor', params.mode, messages, {
          jsonMode: true,
          temperature: 0.2,
          maxTokens: 1500,
          timeoutMs: 60_000,
        });
        response = r;
      } catch (err) {
        log.warn('executor: validation-retry model call failed', {
          err: String(err),
          step: params.step.id,
        });
        break;
      }
      const parsed = parseModelOutput(response.content);
      if (parsed.summary) summary = parsed.summary;
      // Do NOT break here on `done: true` — the authoritative signal is the
      // validator re-running on the next loop iteration. A model that claims
      // done but left the validator failing still costs us a correctness bug.
      const turnDigests: Array<Record<string, unknown>> = [];
      for (const action of parsed.actions) {
        if (!hasTool(action.tool)) continue;
        const tool = getTool(action.tool);
        try {
          await requestPermissionFor(
            tool.schema,
            params.projectId,
            params.taskId,
            params.step,
            params.flags,
          );
        } catch {
          continue;
        }
        const result = await tool.execute(action.args, toolCtx);
        toolResults.push({ tool: tool.schema.name, args: action.args, result });
        turnDigests.push(digestToolResult({ tool: tool.schema.name, args: action.args, result }));
        if (result.success) {
          filesChanged.push(...extractFilesChanged(tool.schema.name, action.args, result));
        }
      }
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: `TOOL_RESULTS:\n${JSON.stringify(turnDigests, null, 2)}`,
      });
    }
  }

  if (!summary) {
    summary = completed
      ? `ran ${toolResults.length} action(s)`
      : `step did not complete after ${turn} turn(s)`;
  }

  return {
    step: params.step,
    toolResults,
    summary,
    filesChanged: Array.from(new Set(filesChanged)),
    turns: turn,
    completed,
  };
};

const requestPermissionFor = async (
  schema: import('../types').ToolSchema,
  projectId: string,
  taskId: string,
  step: PlanStep,
  flags: PermissionFlags,
): Promise<void> => {
  const decision = await requestPermission(
    {
      tool: schema.name,
      risk: step.risk ?? schema.risk,
      sideEffect: schema.sideEffect,
      sensitivity: schema.sensitivity,
      action: step.description,
      target: step.target,
      projectId,
      taskId,
    },
    flags,
  );
  if (decision === 'deny' || decision === 'ask') {
    throw new ForgeRuntimeError({
      class: 'permission_denied',
      message: `Denied ${schema.name} for step ${step.id}`,
      retryable: false,
    });
  }
};

const extractFilesChanged = (
  tool: string,
  args: unknown,
  result: ToolResult<unknown>,
): string[] => {
  if (!result.success) return [];
  if (tool === 'write_file' && args && typeof args === 'object' && 'path' in args) {
    return [String((args as { path: string }).path)];
  }
  if (tool === 'apply_patch' && result.output && typeof result.output === 'object') {
    const out = result.output as { filesChanged?: string[] };
    return out.filesChanged ?? [];
  }
  if (tool === 'edit_file' && args && typeof args === 'object' && 'path' in args) {
    return [String((args as { path: string }).path)];
  }
  return [];
};

// Exposed for tests.
export const _parseExecutorOutputForTest = parseModelOutput;
export const _digestToolResultForTest = digestToolResult;
