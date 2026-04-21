import * as fs from 'fs';
import * as path from 'path';
import { Task, TaskStatus, TERMINAL_STATUSES } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { ensureProjectDir, projectSubdirs, projectId as computeProjectId } from '../config/paths';
import { indexTask, upsertProject, deleteTaskFromIndex } from './index-db';
import * as pathModule from 'path';

/**
 * Task persistence module.
 *
 * This module provides functionality for saving, loading, listing, and transitioning tasks within a project. Each task is stored as a JSON file in a project-specific tasks directory. The `saveTask` function allows creating or updating a task, while the `loadTask` function retrieves a task by its ID. The `listLocalTasks` function returns all tasks for a project, sorted by their last update time. The `transitionTask` function handles state transitions for tasks, ensuring that only legal transitions are allowed based on the defined state machine.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const LEGAL_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ['planned', 'cancelled'],
  planned: ['approved', 'cancelled', 'blocked'],
  approved: ['scheduled', 'cancelled'],
  scheduled: ['running', 'cancelled', 'blocked'],
  running: ['verifying', 'failed', 'blocked', 'cancelled'],
  verifying: ['completed', 'failed', 'running'], // can loop back on retry
  // Terminal states can be reset to `draft` by an operator (`forge resume`)
  // so the agentic loop can re-enter from the top (draft → planned → …).
  // Keeps the state machine re-entrant without a separate "archived" status.
  completed: ['draft'],
  failed: ['draft'],
  blocked: ['draft', 'cancelled'],
  cancelled: ['draft'],
};

export const isLegalTransition = (from: TaskStatus, to: TaskStatus): boolean => {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
};

const taskFilePath = (projectRoot: string, taskId: string): string => {
  const sub = projectSubdirs(projectRoot);
  return path.join(sub.tasks, `${taskId}.json`);
};

export const saveTask = (projectRoot: string, task: Task): void => {
  const sub = ensureProjectDir(projectRoot);
  const now = new Date().toISOString();
  const next: Task = { ...task, updatedAt: now };
  fs.writeFileSync(taskFilePath(projectRoot, task.id), JSON.stringify(next, null, 2));

  // Also write/refresh project metadata + global index.
  const name = pathModule.basename(projectRoot);
  const pid = computeProjectId(projectRoot);
  if (!fs.existsSync(sub.metadata)) {
    fs.writeFileSync(
      sub.metadata,
      JSON.stringify(
        {
          id: pid,
          path: projectRoot,
          name,
          createdAt: now,
          lastOpened: now,
        },
        null,
        2,
      ),
    );
  }
  upsertProject(pid, projectRoot, name);
  indexTask({
    id: next.id,
    project_id: next.projectId,
    title: next.title,
    status: next.status,
    mode: next.mode,
    intent: next.profile?.intent ?? null,
    complexity: next.profile?.complexity ?? null,
    risk: next.profile?.risk ?? null,
    created_at: next.createdAt,
    updated_at: next.updatedAt,
    completed_at: TERMINAL_STATUSES.has(next.status) ? next.updatedAt : null,
    attempts: next.attempts,
  });
};

export const loadTask = (projectRoot: string, taskId: string): Task | null => {
  const fp = taskFilePath(projectRoot, taskId);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8')) as Task;
  } catch {
    return null;
  }
};

export const listLocalTasks = (projectRoot: string): Task[] => {
  const sub = projectSubdirs(projectRoot);
  if (!fs.existsSync(sub.tasks)) return [];
  return fs
    .readdirSync(sub.tasks)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(sub.tasks, f), 'utf8')) as Task;
      } catch {
        return null;
      }
    })
    .filter((t): t is Task => t !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export interface DeleteTaskResult {
  taskFile: boolean;
  indexRows: { task: number; sessions: number };
}

export const deleteTask = (projectRoot: string, taskId: string): DeleteTaskResult => {
  const fp = taskFilePath(projectRoot, taskId);
  let taskFile = false;
  if (fs.existsSync(fp)) {
    fs.rmSync(fp);
    taskFile = true;
  }
  const indexRows = deleteTaskFromIndex(taskId);
  if (!taskFile && indexRows.task === 0) {
    throw new ForgeRuntimeError({
      class: 'not_found',
      message: `Task ${taskId} not found`,
      retryable: false,
    });
  }
  return { taskFile, indexRows };
};

export const transitionTask = (
  projectRoot: string,
  taskId: string,
  nextStatus: TaskStatus,
  patch: Partial<Task> = {},
): Task => {
  const current = loadTask(projectRoot, taskId);
  if (!current) {
    throw new ForgeRuntimeError({
      class: 'not_found',
      message: `Task ${taskId} not found in ${projectRoot}`,
      retryable: false,
    });
  }
  if (!isLegalTransition(current.status, nextStatus)) {
    throw new ForgeRuntimeError({
      class: 'state_invalid',
      message: `Illegal transition ${current.status} → ${nextStatus} for task ${taskId}`,
      retryable: false,
      recoveryHint: `Legal next: ${LEGAL_TRANSITIONS[current.status].join(', ') || '(terminal)'}`,
    });
  }
  const now = new Date().toISOString();
  const next: Task = {
    ...current,
    ...patch,
    status: nextStatus,
    updatedAt: now,
    startedAt: nextStatus === 'running' && !current.startedAt ? now : current.startedAt,
    completedAt: TERMINAL_STATUSES.has(nextStatus) ? now : current.completedAt,
  };
  saveTask(projectRoot, next);
  return next;
};
