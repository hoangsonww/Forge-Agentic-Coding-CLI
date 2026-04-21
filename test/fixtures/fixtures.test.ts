/**
 * Self-test for the fixture loaders.
 *
 * Keeps every fixture exercised by at least one assertion so a typo in
 * a JSON file doesn't sit undetected. Also smoke-tests that the
 * fixtures validate against the real zod schemas (config) and obey the
 * shape invariants the rest of the codebase assumes (task status set,
 * plan IDs unique, etc.).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import {
  bugfix3stepPlan,
  commitStyleSkill,
  completedTask,
  draftTask,
  failedTask,
  globalConfigJson,
  invalidCyclePlan,
  ollamaTagsResponse,
  plannedTask,
  replConversationEntries,
  replSessionEntries,
  // @ts-ignore
} from './index';
import { globalConfigSchema } from '../../src/config/schema';
import { validatePlan } from '../../src/scheduler/dag';
import { TERMINAL_STATUSES } from '../../src/types';

describe('fixtures — tasks', () => {
  it('draft task is draft-shaped', () => {
    const t = draftTask();
    expect(t.status).toBe('draft');
    expect(t.plan).toBeUndefined();
    expect(t.result).toBeUndefined();
    expect(t.attempts).toBe(0);
  });

  it('planned task carries a valid DAG plan', () => {
    const t = plannedTask();
    expect(t.status).toBe('planned');
    expect(t.plan).toBeDefined();
    const v = validatePlan(t.plan!);
    expect(v.ok).toBe(true);
  });

  it('completed task is terminal with a success result', () => {
    const t = completedTask();
    expect(TERMINAL_STATUSES.has(t.status)).toBe(true);
    expect(t.result?.success).toBe(true);
    expect(t.result?.filesChanged.length).toBeGreaterThan(0);
    expect(t.completedAt).toBeDefined();
  });

  it('failed task carries a structured error', () => {
    const t = failedTask();
    expect(t.status).toBe('failed');
    expect(t.result?.success).toBe(false);
    expect(t.result?.errors?.[0]?.class).toBe('tool_error');
  });

  it('a fresh load returns a deep clone — mutation does not leak', () => {
    const a = draftTask();
    a.title = '--mutated--';
    const b = draftTask();
    expect(b.title).not.toBe('--mutated--');
  });
});

describe('fixtures — plans', () => {
  it('bugfix-3step plan passes the DAG validator', () => {
    const v = validatePlan(bugfix3stepPlan());
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
  });

  it('invalid-cycle plan is rejected for a cycle', () => {
    const v = validatePlan(invalidCyclePlan());
    expect(v.ok).toBe(false);
    expect(v.issues.join(' ')).toMatch(/cycle|unresolvable/i);
  });

  it('step ids are unique in the 3-step plan', () => {
    const ids = bugfix3stepPlan().steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('fixtures — JSONL streams', () => {
  it('repl session is valid JSONL and carries the canonical entry types', () => {
    const rows = replSessionEntries();
    expect(rows.length).toBeGreaterThan(5);
    const types = new Set(rows.map((r) => r.type as string));
    for (const required of ['user', 'plan', 'tool_call', 'tool_result', 'result']) {
      expect(types.has(required)).toBe(true);
    }
  });

  it('repl conversation starts with session-created + alternates turn events', () => {
    const rows = replConversationEntries();
    expect(rows[0].type).toBe('session-created');
    const turnEvents = rows.filter((r) => String(r.type).startsWith('turn-'));
    expect(turnEvents.length).toBeGreaterThan(0);
  });
});

describe('fixtures — markdown + config + provider data', () => {
  it('commit-style skill has YAML frontmatter with name/description/triggers', () => {
    const md = commitStyleSkill();
    expect(md).toMatch(/^---/);
    expect(md).toMatch(/name:\s*conventional-commit/);
    expect(md).toMatch(/triggers:\s*\[/);
  });

  it('global.json validates against the real GlobalConfig zod schema', () => {
    const parsed = globalConfigSchema.safeParse(globalConfigJson());
    expect(parsed.success).toBe(true);
  });

  it('ollama-tags fixture matches the /api/tags shape the provider expects', () => {
    const payload = ollamaTagsResponse();
    expect(Array.isArray(payload.models)).toBe(true);
    expect(payload.models.length).toBeGreaterThan(3);
    for (const m of payload.models) {
      expect(typeof m.name).toBe('string');
    }
  });
});
