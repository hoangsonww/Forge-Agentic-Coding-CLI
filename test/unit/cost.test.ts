/**
 * Cost estimation tests for estimateCostUsd function.
 *
 * These tests verify that the cost estimation logic correctly computes the estimated cost in USD for different model providers and models based on their token usage. The tests cover:
 *   Local providers (ollama, llamacpp) should always return 0 cost.
 *   Hosted providers (anthropic, openai) should return a positive cost based on their pricing.
 *   Unknown models should be treated as having 0 cost.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import { estimateCostUsd } from '../../src/models/cost';

describe('estimateCostUsd', () => {
  it('returns 0 for local providers', () => {
    expect(estimateCostUsd('ollama', 'llama3:8b', 1000, 1000)).toBe(0);
    expect(estimateCostUsd('llamacpp', 'anything', 10, 10)).toBe(0);
  });

  it('computes Claude Opus cost approximately', () => {
    const c = estimateCostUsd('anthropic', 'claude-opus-4-7', 1_000_000, 1_000_000);
    // 15 + 75 = $90
    expect(c).toBeCloseTo(90, 1);
  });

  it('treats unknown models as 0', () => {
    expect(estimateCostUsd('openai', 'unknown-xyz', 10, 10)).toBe(0);
  });
});
