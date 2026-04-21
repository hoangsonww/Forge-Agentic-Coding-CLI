/**
 * Classifier unit tests for heuristicClassify function.
 *
 * These tests verify that the heuristic classification logic correctly identifies task types, scopes, complexities, and risks based on common keywords and patterns in task descriptions. The tests cover:
 *   Detection of bugfix intent from keywords like "fix" and "bug".
 *   Detection of refactor intent from keywords like "refactor".
 *   Escalation of scope to "system-wide" for tasks mentioning "entire" or "monorepo".
 *   Assignment of "critical" risk for tasks containing destructive keywords like "delete".
 *   Classification of trivial complexity for simple rename operations.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

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
