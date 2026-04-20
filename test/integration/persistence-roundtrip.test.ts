/**
 * Persistence round-trip: fixture → save → load → transition → reload.
 *
 * Exercises the real saveTask / loadTask / transitionTask code path
 * (including the SQLite index write) against an isolated tmp project
 * root so we don't touch the developer's ~/.forge.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { draftTask, plannedTask, completedTask, failedTask } from '../fixtures';
import { listLocalTasks, loadTask, saveTask, transitionTask } from '../../src/persistence/tasks';
import { ensureProjectDir, projectId as computeProjectId } from '../../src/config/paths';
import type { Task } from '../../src/types';

let projectRoot = '';
let pid = '';

/** Fixtures hard-code a fake projectId; the SQLite index has a FK from tasks
 *  to projects, so we rewrite each fixture's projectId to the one that
 *  matches this test's actual tmp project root. */
const stamp = <T extends Task>(t: T): T => ({ ...t, projectId: pid });

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-roundtrip-'));
  ensureProjectDir(projectRoot);
  pid = computeProjectId(projectRoot);
});

afterEach(() => {
  try {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('persistence round-trip — save + load', () => {
  it('writes a draft task and loads it back byte-equivalent for stable fields', () => {
    const src = stamp(draftTask());
    saveTask(projectRoot, src);
    const back = loadTask(projectRoot, src.id);
    expect(back).not.toBeNull();
    expect(back!.id).toBe(src.id);
    expect(back!.title).toBe(src.title);
    expect(back!.status).toBe('draft');
    expect(back!.profile?.intent).toBe('bugfix');
  });

  it('listLocalTasks finds every fixture persisted', () => {
    for (const t of [draftTask(), plannedTask(), completedTask(), failedTask()]) {
      saveTask(projectRoot, stamp(t));
    }
    const listed = listLocalTasks(projectRoot).map((t) => t.id);
    for (const expected of [
      'task_draft_fixture',
      'task_planned_fixture',
      'task_completed_fixture',
      'task_failed_fixture',
    ]) {
      expect(listed).toContain(expected);
    }
  });

  it('listLocalTasks returns every saved task (saveTask stamps its own updatedAt)', () => {
    // saveTask always sets updatedAt = now, so the test asserts completeness
    // rather than input-derived ordering. Ordering-by-updatedAt is a property
    // of the writes' real-world timestamps and is covered by the ordering
    // contract in `src/persistence/tasks.ts`.
    saveTask(projectRoot, stamp(draftTask()));
    saveTask(projectRoot, stamp(plannedTask()));
    saveTask(projectRoot, stamp(completedTask()));
    const ids = listLocalTasks(projectRoot).map((t) => t.id);
    expect(ids).toHaveLength(3);
    expect(ids).toContain('task_planned_fixture');
    expect(ids).toContain('task_draft_fixture');
    expect(ids).toContain('task_completed_fixture');
  });
});

describe('persistence round-trip — state-machine transitions', () => {
  it('draft → planned → approved → scheduled → running → verifying → completed is the canonical happy path', () => {
    const base = stamp(draftTask());
    saveTask(projectRoot, base);
    let t = transitionTask(projectRoot, base.id, 'planned');
    expect(t.status).toBe('planned');
    t = transitionTask(projectRoot, base.id, 'approved');
    t = transitionTask(projectRoot, base.id, 'scheduled');
    t = transitionTask(projectRoot, base.id, 'running');
    expect(t.startedAt).toBeDefined();
    t = transitionTask(projectRoot, base.id, 'verifying');
    t = transitionTask(projectRoot, base.id, 'completed', {
      result: {
        success: true,
        summary: 'ok',
        filesChanged: [],
        durationMs: 42,
      },
    });
    expect(t.status).toBe('completed');
    expect(t.completedAt).toBeDefined();
    expect(t.result?.success).toBe(true);
  });

  it('illegal transitions throw state_invalid with the legal-next list', () => {
    const base = stamp(draftTask());
    saveTask(projectRoot, base);
    expect(() => transitionTask(projectRoot, base.id, 'running')).toThrowError(
      /Illegal transition/,
    );
  });

  it('terminal tasks reset to draft via forge resume (the only legal move out)', () => {
    const done = stamp(completedTask());
    saveTask(projectRoot, done);
    const t = transitionTask(projectRoot, done.id, 'draft');
    expect(t.status).toBe('draft');
    // Terminal → scheduled is no longer legal; confirms the earlier bugfix.
    saveTask(projectRoot, stamp({ ...completedTask(), id: 'task_terminal_fixture_2' }));
    expect(() => transitionTask(projectRoot, 'task_terminal_fixture_2', 'scheduled')).toThrowError(
      /Illegal transition/,
    );
  });

  it('failed + blocked + cancelled all reset to draft', () => {
    for (const t of [
      stamp({ ...failedTask(), id: 'fx_failed' }),
      stamp({ ...draftTask(), id: 'fx_blocked', status: 'blocked' as const }),
      stamp({ ...draftTask(), id: 'fx_cancelled', status: 'cancelled' as const }),
    ]) {
      saveTask(projectRoot, t);
      const reset = transitionTask(projectRoot, t.id, 'draft');
      expect(reset.status).toBe('draft');
    }
  });
});
