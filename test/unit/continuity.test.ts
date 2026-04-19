import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  findIncompleteTasks,
  listRecentTasks,
  mostRecent,
  mostRecentIncomplete,
} from '../../src/core/continuity';
import { saveTask } from '../../src/persistence/tasks';
import { ensureProjectDir, projectId as computeProjectId } from '../../src/config/paths';
import { Task } from '../../src/types';

let tmp = '';
let pid = '';
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-continuity-'));
  ensureProjectDir(tmp);
  pid = computeProjectId(tmp);
});
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

const mkTask = (overrides: Partial<Task>): Task => ({
  id: overrides.id ?? `task_${Math.random().toString(16).slice(2, 10)}`,
  projectId: overrides.projectId ?? pid,
  title: overrides.title ?? 'test',
  description: overrides.description ?? 'test description',
  status: overrides.status ?? 'completed',
  mode: overrides.mode ?? 'balanced',
  profile: overrides.profile ?? {
    type: 'other',
    complexity: 'simple',
    risk: 'low',
    scope: 'single-file',
    sideEffects: [],
    sensitivity: 'low',
    intent: 'other',
    needsPlan: false,
    agents: [],
    confidence: 1,
  },
  dependencies: [],
  traceId: 'trace',
  runId: 'run',
  createdAt: overrides.createdAt ?? new Date().toISOString(),
  updatedAt: overrides.updatedAt ?? new Date().toISOString(),
  attempts: 0,
  maxAttempts: 3,
  ...overrides,
});

describe('continuity — listRecentTasks', () => {
  it('returns tasks sorted newest-first, capped at `limit`', async () => {
    // saveTask overrides updatedAt to "now" on every save. Saves happen in
    // sequence, so the i-th call has a strictly-later updatedAt than the
    // (i-1)-th. Insert t0..t4 → expect newest first = t4, t3, t2 when capped.
    for (let i = 0; i < 5; i++) {
      saveTask(tmp, mkTask({ id: `t${i}`, status: 'completed' }));
      // Pause 2ms so ISO timestamps differ in the millisecond component.
      await new Promise((r) => setTimeout(r, 2));
    }
    const list = listRecentTasks(tmp, 3);
    expect(list.map((x) => x.id)).toEqual(['t4', 't3', 't2']);
  });

  it('returns an empty array for an empty project', () => {
    expect(listRecentTasks(tmp)).toEqual([]);
  });

  it('includes tasks of every status (not just incomplete)', () => {
    saveTask(tmp, mkTask({ id: 'done-1', status: 'completed' }));
    saveTask(tmp, mkTask({ id: 'fail-1', status: 'failed' }));
    saveTask(tmp, mkTask({ id: 'run-1', status: 'running' }));
    saveTask(tmp, mkTask({ id: 'canc-1', status: 'cancelled' }));
    const list = listRecentTasks(tmp);
    const statuses = list.map((x) => x.status).sort();
    expect(statuses).toEqual(['cancelled', 'completed', 'failed', 'running']);
  });
});

describe('continuity — mostRecent / mostRecentIncomplete', () => {
  it('mostRecent returns any task; mostRecentIncomplete filters to running|blocked|verifying', () => {
    saveTask(
      tmp,
      mkTask({
        id: 'old-completed',
        status: 'completed',
        updatedAt: new Date(Date.now() - 10_000).toISOString(),
      }),
    );
    saveTask(
      tmp,
      mkTask({
        id: 'new-running',
        status: 'running',
        updatedAt: new Date().toISOString(),
      }),
    );
    expect(mostRecent(tmp)?.id).toBe('new-running');
    expect(mostRecentIncomplete(tmp)?.id).toBe('new-running');

    // Remove the running task → mostRecent still finds the completed one,
    // but mostRecentIncomplete returns null.
    saveTask(
      tmp,
      mkTask({
        id: 'new-running',
        status: 'completed', // transition it
        updatedAt: new Date().toISOString(),
      }),
    );
    expect(mostRecent(tmp)?.id).toBe('new-running');
    expect(mostRecentIncomplete(tmp)).toBeNull();
  });

  it('findIncompleteTasks still filters correctly (back-compat)', () => {
    saveTask(tmp, mkTask({ id: 'a', status: 'completed' }));
    saveTask(tmp, mkTask({ id: 'b', status: 'running' }));
    saveTask(tmp, mkTask({ id: 'c', status: 'blocked' }));
    const ids = findIncompleteTasks(tmp)
      .map((x) => x.id)
      .sort();
    expect(ids).toEqual(['b', 'c']);
  });
});
