/**
 * Retrieval Engine Tests.
 *
 * Mocks the four backing stores (hot/warm/cold/learning) and pins the
 * retrieve() function's contract: it includes hot snapshot, decorates
 * warm with fenced markers, counts cold hits, and optionally skips
 * learning patterns.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/memory/warm', () => ({
  collectRelated: () => ['/project/src/b.ts'],
  sampleFileExcerpts: (files: string[]) =>
    files.map((f) => ({ source: f, content: 'content of ' + f })),
}));

vi.mock('../../src/memory/cold', () => ({
  search: () => [
    { path: 'src/a.ts', snippet: 'snippet a' },
    { path: 'src/b.ts', snippet: 'snippet b' },
  ],
}));

vi.mock('../../src/memory/learning', () => ({
  relevantPatterns: (_q: string, _limit: number) => [
    { pattern: 'NPE', confidence: 0.9, fix: 'null check' },
  ],
}));

import { retrieve } from '../../src/memory/retrieval';
import { HotMemory } from '../../src/memory/hot';

describe('retrieve()', () => {
  it('aggregates hot + warm + cold + learning blocks', () => {
    const hot = new HotMemory();
    hot.push('inline', 'from hot');
    const r = retrieve({
      projectRoot: '/project',
      query: 'something',
      seedFile: '/project/src/a.ts',
      hot,
    });
    expect(r.coldHits).toBe(2);
    expect(r.warmFiles).toBe(1);
    expect(r.learningHits).toBe(1);
    expect(r.blocks.some((b) => b.source.startsWith('hot:'))).toBe(true);
    expect(r.blocks.some((b) => b.source.startsWith('warm:'))).toBe(true);
    expect(r.blocks.some((b) => b.source.startsWith('cold:'))).toBe(true);
    expect(r.blocks.some((b) => b.source === 'learning')).toBe(true);
  });

  it('skips learning patterns when includeLearning is false', () => {
    const r = retrieve({
      projectRoot: '/project',
      query: 'q',
      includeLearning: false,
    });
    expect(r.learningHits).toBe(0);
    expect(r.blocks.find((b) => b.source === 'learning')).toBeUndefined();
  });

  it('returns zero warm files when seedFile is not provided', () => {
    const r = retrieve({ projectRoot: '/project', query: 'q' });
    expect(r.warmFiles).toBe(0);
  });
});
