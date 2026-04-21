/**
 * Cross-session continuity. Used by the `resume` command to pick up any
 * prior task — incomplete or otherwise. The historical helpers
 * findIncompleteTasks/mostRecentIncomplete are kept for callers that
 * specifically want the "still-running" subset (e.g. daemon recovery).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { listLocalTasks } from '../persistence/tasks';
import { Task } from '../types';

export const findIncompleteTasks = (projectRoot: string): Task[] => {
  const tasks = listLocalTasks(projectRoot);
  return tasks.filter(
    (t) => t.status === 'running' || t.status === 'blocked' || t.status === 'verifying',
  );
};

export const mostRecentIncomplete = (projectRoot: string): Task | null => {
  const list = findIncompleteTasks(projectRoot);
  return list.length ? list[0] : null;
};

/** All tasks for a project, most-recent first. Used by `forge resume` so the
 *  user can pick up any prior task without being gated on status. */
export const listRecentTasks = (projectRoot: string, limit = 25): Task[] => {
  const tasks = listLocalTasks(projectRoot);
  return tasks
    .slice()
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, limit);
};

export const mostRecent = (projectRoot: string): Task | null => {
  const list = listRecentTasks(projectRoot, 1);
  return list.length ? list[0] : null;
};
