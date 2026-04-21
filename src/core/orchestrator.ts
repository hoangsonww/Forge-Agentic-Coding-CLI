/**
 * Orchestrator module — the main entry point for executing a user task. It takes the user's input, classifies it to determine the appropriate profile, creates a new Task, and then initiates the agentic loop to plan and execute the task. The orchestrator also handles emitting events for task creation and classification, which can be used for logging, monitoring, and driving UI updates.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Mode, Task } from '../types';
import { newTaskId, newTraceId, newRunId } from '../logging/trace';
import { findProjectRoot, loadGlobalConfig } from '../config/loader';
import { projectId as computeProjectId } from '../config/paths';
import { classify } from '../classifier/classifier';
import { saveTask } from '../persistence/tasks';
import { runAgenticLoop, LoopOptions } from './loop';
import { emit } from '../persistence/events';
import { PermissionFlags } from '../permissions/manager';

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

  const options: LoopOptions = {
    projectRoot: root,
    mode: params.mode,
    flags: params.flags ?? {},
    autoApprove: params.autoApprove,
    planOnly: params.planOnly,
  };

  return runAgenticLoop(task, options);
};
