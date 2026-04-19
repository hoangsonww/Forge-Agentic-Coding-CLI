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
