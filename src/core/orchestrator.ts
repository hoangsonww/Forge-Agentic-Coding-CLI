/**
 * Orchestrator module — the main entry point for executing a user task. It takes the user's input, classifies it to determine the appropriate profile, creates a new Task, and then initiates the agentic loop to plan and execute the task. The orchestrator also handles emitting events for task creation and classification, which can be used for logging, monitoring, and driving UI updates.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Mode, Task, TaskResult } from '../types';
import { newTaskId, newTraceId, newRunId } from '../logging/trace';
import { findProjectRoot, loadGlobalConfig } from '../config/loader';
import { projectId as computeProjectId } from '../config/paths';
import { classify } from '../classifier/classifier';
import { saveTask, transitionTask } from '../persistence/tasks';
import { runAgenticLoop, LoopOptions } from './loop';
import { emit } from '../persistence/events';
import { PermissionFlags } from '../permissions/manager';
import { respondConversation } from '../agents/narrator';
import { log } from '../logging/logger';

export interface OrchestratorInput {
  input: string;
  mode: Mode;
  cwd?: string;
  flags?: PermissionFlags;
  autoApprove?: boolean;
  planOnly?: boolean;
  title?: string;
  description?: string;
}

export const orchestrateRun = async (params: OrchestratorInput) => {
  const cwd = params.cwd ?? process.cwd();
  const root = findProjectRoot(cwd) ?? cwd;
  const pid = computeProjectId(root);
  const cfg = loadGlobalConfig();

  const profile = await classify({
    input: params.input,
    mode: params.mode,
  });

  const title = params.title ?? params.input.slice(0, 80);
  const now = new Date().toISOString();
  const task: Task = {
    id: newTaskId(),
    projectId: pid,
    title,
    description: params.description ?? params.input,
    status: 'draft',
    mode: params.mode,
    profile,
    dependencies: [],
    traceId: newTraceId(),
    runId: newRunId(),
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    maxAttempts: cfg.limits.maxRetries,
  };
  saveTask(root, task);
  emit(root, {
    type: 'TASK_CREATED',
    taskId: task.id,
    projectId: pid,
    traceId: task.traceId,
    severity: 'info',
    message: `Task created: ${title}`,
    payload: { profile },
    timestamp: now,
  });
  emit(root, {
    type: 'TASK_CLASSIFIED',
    taskId: task.id,
    projectId: pid,
    traceId: task.traceId,
    severity: 'info',
    message: `Classified as ${profile.intent}/${profile.complexity}/${profile.risk}`,
    payload: { profile },
    timestamp: now,
  });

  // Fast-path: a conversational question doesn't need planning, approval,
  // execution, or review. Just stream an answer and record a terminal task.
  // The progress rail / UI still get TASK_STARTED / TASK_COMPLETED events
  // and per-token deltas via the router, so UX is identical to any other
  // streaming response — minus the ~3 s plan/approval overhead.
  if (profile.intent === 'conversation') {
    const started = Date.now();
    emit(root, {
      type: 'TASK_STARTED',
      taskId: task.id,
      projectId: pid,
      traceId: task.traceId,
      runId: task.runId,
      severity: 'info',
      message: 'conversation · direct answer',
      timestamp: new Date().toISOString(),
    });
    let answer = '';
    try {
      answer = await respondConversation({
        input: params.input,
        // Pass the composed multi-turn context when present (REPL / UI
        // wrap prior turns into `description` via composeDescription).
        // The responder uses it as ground truth for follow-up questions
        // like "what have we talked about?".
        description: params.description,
        mode: params.mode,
        taskId: task.id,
        projectId: pid,
      });
    } catch (err) {
      log.warn('conversation fast-path failed', { err: String(err) });
      const failResult: TaskResult = {
        success: false,
        summary: err instanceof Error ? err.message : String(err),
        filesChanged: [],
        durationMs: Date.now() - started,
      };
      const failed = transitionTask(root, task.id, 'failed', { result: failResult });
      emit(root, {
        type: 'TASK_FAILED',
        taskId: task.id,
        projectId: pid,
        traceId: task.traceId,
        runId: task.runId,
        severity: 'error',
        message: failResult.summary,
        timestamp: new Date().toISOString(),
      });
      return { task: failed, result: failResult };
    }
    const result: TaskResult = {
      success: true,
      summary: answer || '(empty response)',
      filesChanged: [],
      durationMs: Date.now() - started,
    };
    const done = transitionTask(root, task.id, 'completed', { result });
    emit(root, {
      type: 'TASK_COMPLETED',
      taskId: task.id,
      projectId: pid,
      traceId: task.traceId,
      runId: task.runId,
      severity: 'info',
      message: 'conversation answered',
      timestamp: new Date().toISOString(),
    });
    return { task: done, result };
  }

  const options: LoopOptions = {
    projectRoot: root,
    mode: params.mode,
    flags: params.flags ?? {},
    autoApprove: params.autoApprove,
    planOnly: params.planOnly,
  };

  return runAgenticLoop(task, options);
};
