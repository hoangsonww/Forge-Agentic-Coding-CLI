/**
 * Learning memory — integration cycle.
 *
 * Round-trips the learning memory through its real SQLite store:
 *   recordSuccess → relevantPatterns → recordFailure → relevantPatterns → decay
 *
 * The store lives under FORGE_HOME (set by test/setup-env.ts to a tmp
 * dir), so these tests don't touch the developer's real state.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  decay,
  forgetAll,
  recordFailure,
  recordSuccess,
  relevantPatterns,
} from '../../src/memory/learning';

beforeEach(() => {
  forgetAll();
});

/**
 * Calling convention check, since these tests depend on it:
 *   recordSuccess(pattern, context, fix)
 *   relevantPatterns(context, limit)  ← searches the CONTEXT column
 * so retrieval queries use the value passed as `context`, not `pattern`.
 */
describe('learning memory — record + retrieve', () => {
  it('recordSuccess makes a pattern retrievable via relevantPatterns (context-keyed)', () => {
    recordSuccess('bugfix:single-file', 'off-by-one-in-loop', 'swap < for <=');
    const rows = relevantPatterns('off-by-one-in-loop');
    expect(rows.length).toBeGreaterThan(0);
    const match = rows.find((r) => r.pattern === 'bugfix:single-file');
    expect(match).toBeDefined();
    expect(match!.successCount).toBe(1);
    expect(match!.failureCount).toBe(0);
    expect(match!.confidence).toBeGreaterThan(0.5);
  });

  it('repeated recordSuccess keeps the pattern retrievable without duplicating it', () => {
    recordSuccess('feature:multi-file', 'add-new-tool', 'register in registry');
    recordSuccess('feature:multi-file', 'add-new-tool', 'register in registry');
    recordSuccess('feature:multi-file', 'add-new-tool', 'register in registry');
    const rows = relevantPatterns('add-new-tool');
    const match = rows.filter((r) => r.pattern === 'feature:multi-file');
    // upsertLearning keys on pattern, so we always have exactly one row.
    expect(match).toHaveLength(1);
    expect(match[0].successCount).toBeGreaterThanOrEqual(1);
    expect(match[0].confidence).toBeGreaterThan(0);
  });

  it('recordFailure lowers confidence without erasing the pattern', () => {
    recordSuccess('refactor:multi-module', 'rename-exported-api', 'update callers');
    const before = relevantPatterns('rename-exported-api')[0];
    recordFailure('refactor:multi-module', 'rename-exported-api', 'reverted');
    const after = relevantPatterns('rename-exported-api')[0];
    expect(after.failureCount).toBe(1);
    expect(after.confidence).toBeLessThanOrEqual(before.confidence);
  });

  it('relevantPatterns respects the limit argument', () => {
    for (let i = 0; i < 8; i++) {
      recordSuccess(`bugfix:ctx-${i}`, `shared-context-tag`, `fix ${i}`);
    }
    const five = relevantPatterns('shared-context-tag', 5);
    const ten = relevantPatterns('shared-context-tag', 10);
    expect(five.length).toBeLessThanOrEqual(5);
    expect(ten.length).toBeGreaterThanOrEqual(five.length);
  });

  it('decay does not crash on a fresh DB and returns the change count', () => {
    recordSuccess('bugfix:single-file', 'stale-pattern-ctx', 'old fix');
    const n = decay(0, 0.5);
    expect(typeof n).toBe('number');
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it('forgetAll wipes the store clean', () => {
    recordSuccess('any:scope', 'ctx-for-wipe-test', 'fix');
    expect(relevantPatterns('ctx-for-wipe-test').length).toBeGreaterThan(0);
    forgetAll();
    expect(relevantPatterns('ctx-for-wipe-test').length).toBe(0);
  });
});
