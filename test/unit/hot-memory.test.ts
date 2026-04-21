/**
 * HotMemory is a simple in-memory store that tracks the "hotness" of entries based on a priority and a budget. It evicts the least hot entries when the budget is exceeded. This test suite verifies that the HotMemory class correctly tracks the budget, evicts entries based on priority, allows forgetting specific sources, and supports replacing content for existing sources.
 *
 * The tests cover:
 *   Eviction of lowest priority entries when the budget is exceeded.
 *   Removal of specific sources using the forget method.
 *   Replacement of content for existing sources using the replace method.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { describe, it, expect } from 'vitest';
import { HotMemory } from '../../src/memory/hot';

describe('HotMemory', () => {
  it('tracks budget and evicts lowest priority', () => {
    const hot = new HotMemory(20);
    hot.push('a', 'A'.repeat(40), 1); // ~10 tokens
    hot.push('b', 'B'.repeat(40), 3);
    hot.push('c', 'C'.repeat(40), 2);
    const sources = hot.snapshot().map((e) => e.source);
    expect(sources).toContain('b');
    expect(hot.budgetUsed()).toBeLessThanOrEqual(20);
  });

  it('forget removes a source', () => {
    const hot = new HotMemory(100);
    hot.push('x', 'hello');
    hot.forget('x');
    expect(hot.snapshot()).toHaveLength(0);
  });

  it('replace swaps content', () => {
    const hot = new HotMemory(100);
    hot.push('x', 'hello');
    hot.replace('x', 'world');
    expect(hot.snapshot()[0].content).toBe('world');
  });
});
