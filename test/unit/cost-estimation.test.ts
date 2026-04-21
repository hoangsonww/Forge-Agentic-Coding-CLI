/**
 * Cost Estimation Tests.
 *
 * Exercises the pure per-model rate lookup used by the cost ledger.
 * The SQLite ledger write path is out of scope for a unit test — this
 * pins the math that drives it.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import { estimateCostUsd } from '../../src/models/cost';

describe('estimateCostUsd', () => {
  it('returns 0 for local providers regardless of model', () => {
    expect(estimateCostUsd('ollama', 'whatever', 10_000, 10_000)).toBe(0);
    expect(estimateCostUsd('llamacpp', 'mistral', 1, 1)).toBe(0);
  });

  it('returns 0 for unknown models', () => {
    expect(estimateCostUsd('openai', 'not-a-real-model', 1_000_000, 1_000_000)).toBe(0);
  });

  it('matches Claude Opus rates at the $15/$75 tier', () => {
    // 1M input tokens × $15/M + 1M output tokens × $75/M = $90
    expect(estimateCostUsd('anthropic', 'claude-opus-4-7', 1_000_000, 1_000_000)).toBeCloseTo(
      90,
      6,
    );
  });

  it('matches Claude Sonnet rates', () => {
    // 1M in × $3 + 1M out × $15 = $18
    expect(estimateCostUsd('anthropic', 'claude-sonnet-4-6', 1_000_000, 1_000_000)).toBeCloseTo(
      18,
      6,
    );
  });

  it('matches GPT-4o-mini rates', () => {
    // 1M in × $0.15 + 1M out × $0.60 = $0.75
    expect(estimateCostUsd('openai', 'gpt-4o-mini', 1_000_000, 1_000_000)).toBeCloseTo(0.75, 6);
  });

  it('prefers the more specific pattern (o1-mini before o1)', () => {
    // o1-mini: 3/12, o1: 15/60. If the o1 match came first, 1M+1M would be $75.
    const cost = estimateCostUsd('openai', 'o1-mini', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(15, 6);
  });
});
