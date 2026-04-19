import { describe, it, expect } from 'vitest';
import { heuristicClassify } from '../../src/classifier/heuristics';

describe('heuristicClassify', () => {
  it('detects bugfix intent', () => {
    const r = heuristicClassify('fix login bug');
    expect(r.type).toBe('bugfix');
  });

  it('detects refactor intent', () => {
    const r = heuristicClassify('refactor the auth module');
    expect(r.type).toBe('refactor');
  });

  it('escalates scope for system-wide tasks', () => {
    const r = heuristicClassify('migrate the entire monorepo to ESM');
    expect(r.scope).toBe('system-wide');
    expect(r.complexity).toBe('complex');
  });

  it('raises risk for destructive keywords', () => {
    const r = heuristicClassify('delete all stale migration files');
    expect(r.risk).toBe('critical');
  });

  it('returns trivial complexity for renames', () => {
    const r = heuristicClassify('rename variable foo to bar');
    expect(r.complexity).toBe('trivial');
  });
});
