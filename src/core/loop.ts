import chalk from 'chalk';
import prompts from 'prompts';
import { Task, TaskResult, Mode, Plan } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { saveTask, transitionTask } from '../persistence/tasks';
import { emit } from '../persistence/events';
import { appendSessionEntry } from '../persistence/sessions';
import { log } from '../logging/logger';
import { newRunId, newSessionId } from '../logging/trace';
import { plannerAgent } from '../agents/planner';
import { runStep } from '../agents/executor';
import { reviewOutcome } from '../agents/reviewer';
import { diagnose } from '../agents/debugger';
import { topoSort, validatePlan } from '../scheduler/dag';
import { concurrency } from '../scheduler/resource-manager';
import { loadGlobalConfig } from '../config/loader';
import { PermissionFlags } from '../permissions/manager';
import { recordSuccess, recordFailure } from '../memory/learning';
import { fixPlan } from './plan-fixer';
import { LoopDetector } from './loop-detection';
import { estimatePlan } from './estimation';
import { installSignalHandlers, shouldAbort, getAbortReason } from './signals';
import { formatTouchedFiles } from '../tools/format';
import { currentHost } from './interactive-host';

/**
 * Loop — the main orchestration function for executing a task. This function implements the core agentic loop, which consists of the following stages:
 * 1. Planning: The planner agent generates a structured plan based on the task description.
 * 2. Approval: The generated plan is presented for approval. The user can approve, cancel, or edit the plan.
 * 3. Execution: If approved, the loop executes each step in the plan sequentially, handling retries and errors according to configured limits.
 * 4. Verification: After execution, the outcome is reviewed (either by an agent or human) to determine success and gather feedback.
 *
 * The loop also handles logging, event emission, session recording, and learning from outcomes. It enforces limits on retries, runtime, and steps to prevent runaway executions. Errors are categorized and can trigger different recovery strategies.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

export interface LoopOptions {
  projectRoot: string;
  mode: Mode;
  flags: PermissionFlags;
  autoApprove?: boolean;
  planOnly?: boolean;
}

const printPlanSummary = (plan: Plan): void => {
  const lines = [chalk.bold.cyan(`\n📋 Plan: ${plan.goal}\n`)];
  for (const s of plan.steps) {
    const risk = s.risk ? chalk.yellow(`[${s.risk}] `) : '';
    lines.push(`  ${chalk.dim(s.id)} ${risk}${s.type}: ${s.description}`);
  }
  process.stdout.write(lines.join('\n') + '\n\n');
};

const confirmPlan = async (
  plan: Plan,
  auto: boolean,
  taskId: string,
): Promise<'approve' | 'cancel' | 'edit'> => {
  if (auto) return 'approve';
  const host = currentHost();
  if (host) return host.confirmPlan(plan, taskId);
  printPlanSummary(plan);
  const resp = await prompts({
    type: 'select',
    name: 'value',
    message: 'Approve plan?',
    choices: [
      { title: chalk.green('Approve'), value: 'approve' },
      { title: 'Cancel', value: 'cancel' },
      { title: 'Edit (opens $EDITOR)', value: 'edit' },
    ],
    initial: 0,
  });
  return (resp?.value as 'approve' | 'cancel' | 'edit') ?? 'cancel';
};

const editPlanInEditor = async (plan: Plan): Promise<Plan> => {
  const { execSync } = await import('child_process');
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const file = path.join(os.tmpdir(), `forge-plan-${plan.id}.json`);
  fs.writeFileSync(file, JSON.stringify(plan, null, 2), 'utf8');
  const editor = process.env.EDITOR || 'vi';
  try {
    execSync(`${editor} "${file}"`, { stdio: 'inherit' });
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Plan;
    fs.unlinkSync(file);
    return parsed;
  } catch (err) {
    log.warn('plan edit failed; keeping original', { err: String(err) });
    return plan;
  }
};

export interface LoopResult {
  task: Task;
  result: TaskResult;
}

export const runAgenticLoop = async (task: Task, options: LoopOptions): Promise<LoopResult> => {
  installSignalHandlers();
  const cfg = loadGlobalConfig();
  const sessionId = newSessionId();
  const runId = newRunId();
  const started = Date.now();

  const maxRetries = cfg.limits.maxRetries;
  const maxRuntimeMs = cfg.limits.maxRuntimeSeconds * 1_000;
  const maxSteps = cfg.limits.maxSteps;
  const loopDetector = new LoopDetector();

  const event = (
    type: Parameters<typeof emit>[1]['type'],
    message: string,
    payload?: Record<string, unknown>,
    severity: 'info' | 'warning' | 'error' | 'critical' = 'info',
  ) => {
    emit(options.projectRoot, {
      type,
      taskId: task.id,
      projectId: task.projectId,
      traceId: task.traceId,
      runId,
      severity,
      message,
      payload,
      timestamp: new Date().toISOString(),
    });
  };

  const session = (entry: Parameters<typeof appendSessionEntry>[2]) =>
    appendSessionEntry(options.projectRoot, sessionId, entry);

  const releaseTask = await concurrency.maxTasks.acquire();
  const startedAt = Date.now();
  event('TASK_STARTED', `Task started (${task.mode})`, { runId, sessionId });
  session({
    type: 'user',
    content: { title: task.title, description: task.description ?? '' },
    timestamp: new Date().toISOString(),
    traceId: runId,
  });

  let current = task;
  const filesChanged = new Set<string>();
  const errors: ForgeRuntimeError[] = [];

  try {
    // ---------- PLAN ----------
    current = transitionTask(options.projectRoot, current.id, 'planned');
    const planOutput = await plannerAgent.run({
      task: current,
      projectRoot: options.projectRoot,
      mode: options.mode,
    });
    if (!planOutput.success || !planOutput.output) {
      throw new ForgeRuntimeError({
        class: 'plan_invalid',
        message: 'Planner produced no plan',
        retryable: false,
      });
    }
    let plan = planOutput.output as Plan;
    const valid = validatePlan(plan);
    if (!valid.ok) {
      log.warn('plan invalid, attempting auto-repair', { issues: valid.issues });
      plan = { ...plan, steps: plan.steps.filter((s) => s.id) };
    }
    const fixerReport = fixPlan(plan, current.profile);
    if (fixerReport.fixed) {
      log.info('plan auto-fixed', { notes: fixerReport.notes });
      plan = fixerReport.plan;
    }
    current.plan = plan;
    saveTask(options.projectRoot, current);
    session({ type: 'plan', content: plan, timestamp: new Date().toISOString() });
    const estimate = estimatePlan(plan);
    event('TASK_PLANNED', `Plan built (${plan.steps.length} steps): ${estimate.summary}`, {
      plan_id: plan.id,
      estimate,
      fixer: fixerReport.notes,
    });

    if (options.planOnly || options.mode === 'plan') {
      printPlanSummary(plan);
      current = transitionTask(options.projectRoot, current.id, 'cancelled', {
        result: {
          success: true,
          summary: 'Plan mode: plan produced; execution skipped.',
          filesChanged: [],
          durationMs: Date.now() - started,
        },
      });
      return { task: current, result: current.result! };
    }

    // ---------- APPROVAL ----------
    let decision = await confirmPlan(plan, options.autoApprove ?? false, current.id);
    while (decision === 'edit') {
      plan = await editPlanInEditor(plan);
      current.plan = plan;
      saveTask(options.projectRoot, current);
      decision = await confirmPlan(plan, false, current.id);
    }
    if (decision !== 'approve') {
      current = transitionTask(options.projectRoot, current.id, 'cancelled');
      event('TASK_CANCELLED', 'User cancelled plan');
      return {
        task: current,
        result: {
          success: false,
          summary: 'Plan not approved.',
          filesChanged: [],
          durationMs: Date.now() - started,
        },
      };
    }
    current = transitionTask(options.projectRoot, current.id, 'approved');
    event('TASK_APPROVED', 'Plan approved');

    current = transitionTask(options.projectRoot, current.id, 'scheduled');
    event('TASK_SCHEDULED', 'Scheduled for execution');
    current = transitionTask(options.projectRoot, current.id, 'running');

    // ---------- EXECUTE ----------
    const ordered = topoSort(plan);
    if (ordered.length > maxSteps) {
      throw new ForgeRuntimeError({
        class: 'resource_exhausted',
        message: `Plan exceeds maxSteps (${ordered.length} > ${maxSteps})`,
        retryable: false,
      });
    }

    for (const step of ordered) {
      if (shouldAbort()) {
        throw new ForgeRuntimeError({
          class: 'user_input',
          message: `Aborted by ${getAbortReason()}`,
          retryable: false,
        });
      }
      if (Date.now() - startedAt > maxRuntimeMs) {
        throw new ForgeRuntimeError({
          class: 'timeout',
          message: `Runtime exceeded ${maxRuntimeMs}ms`,
          retryable: false,
        });
      }
      event('TASK_STEP_STARTED', `→ ${step.id}: ${step.description}`);
      let attempts = 0;
      let stepOk = false;
      while (attempts < maxRetries && !stepOk) {
        attempts++;
        try {
          const out = await runStep({
            step,
            projectRoot: options.projectRoot,
            taskId: current.id,
            projectId: current.projectId,
            mode: options.mode,
            flags: options.flags,
            runId,
          });
          for (const toolRes of out.toolResults) {
            session({
              type: 'tool_call',
              content: { tool: toolRes.tool, args: toolRes.args },
              timestamp: new Date().toISOString(),
            });
            session({
              type: 'tool_result',
              content: toolRes.result,
              timestamp: new Date().toISOString(),
            });
            event(
              toolRes.result.success ? 'TOOL_COMPLETED' : 'TOOL_FAILED',
              `${toolRes.tool} ${toolRes.result.success ? 'ok' : 'failed'}`,
              { step: step.id, result: toolRes.result },
              toolRes.result.success ? 'info' : 'warning',
            );
          }
          for (const f of out.filesChanged) filesChanged.add(f);

          // The executor now self-heals within a step via iterative tool use
          // (see `src/agents/executor.ts`), so a transient tool failure that
          // the model recovered from is no longer a step failure. We trust
          // the executor's `completed` flag, falling back to the legacy
          // "no surviving failures at the tail" check so we still catch the
          // case where no recovery was attempted.
          const tail = out.toolResults[out.toolResults.length - 1];
          const stepFailed = !out.completed || (tail ? !tail.result.success : false);
          if (stepFailed) {
            const lastFailure = [...out.toolResults].reverse().find((r) => !r.result.success);
            loopDetector.record({
              stepId: step.id,
              success: false,
              errorClass: lastFailure?.result.error?.class,
              timestamp: Date.now(),
            });
            throw new ForgeRuntimeError({
              class: 'tool_error',
              message: lastFailure?.result.error?.message ?? `Step ${step.id} did not complete`,
              retryable: true,
              recoveryHint: lastFailure?.result.error?.recoveryHint,
            });
          }
          loopDetector.record({ stepId: step.id, success: true, timestamp: Date.now() });
          stepOk = true;
          event('TASK_STEP_COMPLETED', `✔ ${step.id}`, { summary: out.summary });
        } catch (err) {
          event(
            'RETRY_ATTEMPTED',
            `retry ${attempts}/${maxRetries} on ${step.id}`,
            {
              err: String(err),
            },
            'warning',
          );
          const loopState = loopDetector.isLooping();
          if (loopState.looping) {
            event('ESCALATED', `loop detected: ${loopState.reason}`, {}, 'error');
            throw new ForgeRuntimeError({
              class: 'retry_exhausted',
              message: `Detected retry loop: ${loopState.reason}`,
              retryable: false,
              recoveryHint:
                'The same step is failing identically; change approach or inspect manually.',
            });
          }
          if (attempts >= maxRetries) {
            // Diagnose before escalating.
            const diag = await diagnose(
              {
                failureMessage: String((err as Error).message ?? err),
                failureContext: `step=${step.id} attempts=${attempts}`,
                attemptsSoFar: attempts,
                relevantFiles: step.target ? [step.target] : [],
              },
              options.mode,
            );
            log.error('step failed after max retries', {
              step: step.id,
              diag,
            });
            event('TASK_STEP_FAILED', `step ${step.id} failed`, { diag }, 'error');
            errors.push(
              err instanceof ForgeRuntimeError
                ? err
                : new ForgeRuntimeError({
                    class: 'tool_error',
                    message: String(err),
                    retryable: false,
                  }),
            );
            throw new ForgeRuntimeError({
              class: 'retry_exhausted',
              message: `Step ${step.id} exhausted retries`,
              retryable: false,
              recoveryHint: diag.suggestedFix,
            });
          }
        }
      }
    }

    // ---------- FORMAT ----------
    if (filesChanged.size) {
      try {
        const fmt = await formatTouchedFiles(options.projectRoot, [...filesChanged]);
        if (fmt.formatted > 0) {
          event('TASK_STEP_COMPLETED', `Formatted ${fmt.formatted} file(s)`, { formatter: fmt });
        }
      } catch (err) {
        log.debug('format skip', { err: String(err) });
      }
    }

    // ---------- VERIFY ----------
    current = transitionTask(options.projectRoot, current.id, 'verifying');
    event('TASK_VERIFYING', 'Review pass');
    const verdict = await reviewOutcome(
      {
        taskTitle: current.title,
        changesSummary: `Executed ${ordered.length} steps. Files: ${[...filesChanged].join(', ') || '(none)'}`,
        filesChanged: [...filesChanged],
      },
      options.mode,
    );
    session({ type: 'event', content: { review: verdict }, timestamp: new Date().toISOString() });
    if (!verdict.approved && cfg.completion.requireReview) {
      throw new ForgeRuntimeError({
        class: 'state_invalid',
        message: `Review did not approve: ${verdict.summary}`,
        retryable: false,
      });
    }

    const finalResult: TaskResult = {
      success: true,
      summary: verdict.summary || 'Task completed.',
      filesChanged: [...filesChanged],
      durationMs: Date.now() - started,
    };
    current = transitionTask(options.projectRoot, current.id, 'completed', {
      result: finalResult,
    });
    event('TASK_COMPLETED', finalResult.summary, { files: finalResult.filesChanged });
    session({ type: 'result', content: finalResult, timestamp: new Date().toISOString() });
    // Learning: reinforce the successful pattern (intent + scope).
    if (cfg.memory.learningEnabled && current.profile) {
      recordSuccess(
        `${current.profile.intent}:${current.profile.scope}`,
        current.title.slice(0, 160),
        finalResult.summary.slice(0, 400),
      );
    }
    return { task: current, result: finalResult };
  } catch (err) {
    log.error('agentic loop failed', { err: String(err) });
    const res: TaskResult = {
      success: false,
      summary: err instanceof Error ? err.message : String(err),
      filesChanged: [...filesChanged],
      durationMs: Date.now() - started,
      errors: errors.map((e) => e.toJSON()),
    };
    try {
      current = transitionTask(options.projectRoot, current.id, 'failed', { result: res });
    } catch {
      // If transition illegal (e.g. from cancelled), just save.
      saveTask(options.projectRoot, { ...current, result: res });
    }
    event('TASK_FAILED', res.summary, { errors: res.errors }, 'error');
    if (cfg.memory.learningEnabled && current.profile) {
      recordFailure(
        `${current.profile.intent}:${current.profile.scope}`,
        current.title.slice(0, 160),
        res.summary.slice(0, 400),
      );
    }
    return { task: current, result: res };
  } finally {
    releaseTask();
  }
};
