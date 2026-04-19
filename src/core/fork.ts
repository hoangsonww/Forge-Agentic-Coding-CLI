/**
 * Session / task fork — copy an existing task (and session) into a new id so
 * an alternative approach can be explored without losing the original.
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadTask, saveTask } from '../persistence/tasks';
import { projectSubdirs } from '../config/paths';
import { newTaskId, newTraceId, newRunId, newSessionId } from '../logging/trace';
import { ForgeRuntimeError } from '../types/errors';

export interface ForkResult {
  newTaskId: string;
  newSessionId: string | null;
  copiedSessionEntries: number;
}

export const forkTask = (projectRoot: string, taskId: string): ForkResult => {
  const source = loadTask(projectRoot, taskId);
  if (!source) {
    throw new ForgeRuntimeError({
      class: 'not_found',
      message: `Task ${taskId} not found`,
      retryable: false,
    });
  }
  const now = new Date().toISOString();
  const nextId = newTaskId();
  const cloned = {
    ...source,
    id: nextId,
    status: 'draft' as const,
    parentTaskId: source.id,
    traceId: newTraceId(),
    runId: newRunId(),
    createdAt: now,
    updatedAt: now,
    startedAt: undefined,
    completedAt: undefined,
    result: undefined,
    attempts: 0,
  };
  saveTask(projectRoot, cloned);

  // Copy the most recent session JSONL, if one exists.
  const subs = projectSubdirs(projectRoot);
  let newSessId: string | null = null;
  let copied = 0;
  if (fs.existsSync(subs.sessions)) {
    const sessions = fs.readdirSync(subs.sessions).filter((f) => f.endsWith('.jsonl'));
    const mostRecent = sessions
      .map((f) => ({ f, mtime: fs.statSync(path.join(subs.sessions, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0]?.f;
    if (mostRecent) {
      const srcPath = path.join(subs.sessions, mostRecent);
      newSessId = newSessionId();
      const dst = path.join(subs.sessions, `${newSessId}.jsonl`);
      fs.copyFileSync(srcPath, dst);
      copied = fs.readFileSync(dst, 'utf8').split('\n').filter(Boolean).length;
    }
  }

  return { newTaskId: nextId, newSessionId: newSessId, copiedSessionEntries: copied };
};
