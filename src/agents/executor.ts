import { Agent, AgentResult } from './base';
import { PlanStep, ToolContext, ToolResult } from '../types';
import { callModel } from '../models/router';
import { assembleTaskPrompt } from '../prompts/assembler';
import { allTools, getTool, hasTool } from '../tools/registry';
import { ForgeRuntimeError } from '../types/errors';
import { requestPermission, PermissionFlags } from '../permissions/manager';
import { log } from '../logging/logger';
import { loadGlobalInstructions, loadProjectInstructions } from '../config/loader';
import { newRunId } from '../logging/trace';

export interface ExecutorStepOutput {
  step: PlanStep;
  toolResults: Array<{ tool: string; args: unknown; result: ToolResult<unknown> }>;
  summary: string;
  filesChanged: string[];
}

export interface ExecutorRunInput {
  step: PlanStep;
  flags: PermissionFlags;
}

const executorSchemaPrompt = `You are executing a single step of an approved plan.

Output STRICT JSON:
{
  "actions": [
    { "tool": string, "args": object, "justification": string }
  ],
  "summary": string
}

Rules:
- Choose tools from the catalog only.
- Each action must have args matching that tool's input schema.
- Do not include prose outside JSON.
- If the step can be completed without a tool call (e.g. "analyze"), return an empty actions array and a summary only.
- If you need to write a file, use write_file or apply_patch.`;

const parse = (content: string): any | null => {
  const fence = /```(?:json)?\s*([\s\S]+?)\s*```/i.exec(content);
  try {
    return JSON.parse(fence ? fence[1] : content);
  } catch {
    return null;
  }
};

export const runExecutorStep = async (
  input: ExecutorRunInput,
  ctxCommon: {
    projectRoot: string;
    taskId: string;
    projectId: string;
    mode: PlanStep['risk'] extends undefined ? any : any;
  },
  flags: PermissionFlags,
): Promise<ExecutorStepOutput> => {
  // Shim: preserve original signature inside runExecutor below.
  void input;
  void ctxCommon;
  void flags;
  throw new Error('Use executorAgent.run instead.');
};

export const executorAgent: Agent = {
  name: 'executor',
  description: 'Executes a single plan step using the tool catalog.',
  async run(): Promise<AgentResult> {
    // Executor is invoked per-step by the orchestrator via runStep().
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
}

export const runStep = async (params: RunStepParams): Promise<ExecutorStepOutput> => {
  const runId = params.runId ?? newRunId();
  const toolCtx: ToolContext = {
    taskId: params.taskId,
    projectId: params.projectId,
    projectRoot: params.projectRoot,
    traceId: runId,
    runId,
  };

  // Direct-tool step: when the plan nominates a specific tool, prefer calling
  // it via the model so it has a chance to tweak args, unless args are already
  // provided in full.
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
    return {
      step: params.step,
      toolResults: [{ tool: tool.schema.name, args: params.step.args, result }],
      summary: result.success
        ? `ran ${tool.schema.name}`
        : `FAILED ${tool.schema.name}: ${result.error?.message ?? ''}`,
      filesChanged: extractFilesChanged(tool.schema.name, params.step.args, result),
    };
  }

  // Otherwise, ask the model how to execute this step.
  const prompt = assembleTaskPrompt({
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

  let response;
  try {
    const { response: r } = await callModel('executor', params.mode, prompt.messages, {
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 1500,
      timeoutMs: 60_000,
    });
    response = r;
  } catch (err) {
    log.warn('executor: model call failed', { err: String(err), step: params.step.id });
    return {
      step: params.step,
      toolResults: [],
      summary: `model_error: ${String(err)}`,
      filesChanged: [],
    };
  }

  const plan = parse(response.content);
  const actions: Array<{ tool: string; args: Record<string, unknown> }> = Array.isArray(
    plan?.actions,
  )
    ? plan.actions
    : [];

  const results: Array<{ tool: string; args: unknown; result: ToolResult<unknown> }> = [];
  const filesChanged: string[] = [];

  for (const action of actions) {
    if (!hasTool(action.tool)) {
      results.push({
        tool: action.tool,
        args: action.args,
        result: {
          success: false,
          error: { class: 'not_found', message: `Unknown tool ${action.tool}`, retryable: false },
          durationMs: 0,
        },
      });
      continue;
    }
    const tool = getTool(action.tool);
    try {
      await requestPermissionFor(
        tool.schema,
        params.projectId,
        params.taskId,
        params.step,
        params.flags,
      );
    } catch (err) {
      results.push({
        tool: tool.schema.name,
        args: action.args,
        result: {
          success: false,
          error:
            err instanceof ForgeRuntimeError
              ? err.toJSON()
              : { class: 'permission_denied', message: String(err), retryable: false },
          durationMs: 0,
        },
      });
      continue;
    }
    const result = await tool.execute(action.args, toolCtx);
    results.push({ tool: tool.schema.name, args: action.args, result });
    filesChanged.push(...extractFilesChanged(tool.schema.name, action.args, result));
  }

  const summary =
    plan?.summary && typeof plan.summary === 'string'
      ? String(plan.summary)
      : `ran ${results.length} action(s)`;

  return { step: params.step, toolResults: results, summary, filesChanged };
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
  return [];
};
