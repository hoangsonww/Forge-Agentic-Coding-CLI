import { describe, it, expect } from 'vitest';
import { topoSort, validatePlan } from '../../src/scheduler/dag';
import { Plan } from '../../src/types';

const basePlan = (steps: Plan['steps']): Plan => ({
  id: 'plan_test',
  goal: 'test',
  steps,
  createdAt: new Date().toISOString(),
  mode: 'balanced',
  version: '1',
});

describe('topoSort', () => {
  it('sorts a linear plan in dependency order', () => {
    const plan = basePlan([
      { id: 'a', type: 'analyze', description: '' },
      { id: 'b', type: 'analyze', description: '', dependsOn: ['a'] },
      { id: 'c', type: 'analyze', description: '', dependsOn: ['b'] },
    ]);
    const sorted = topoSort(plan);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('throws on cycles', () => {
    const plan = basePlan([
      { id: 'a', type: 'analyze', description: '', dependsOn: ['b'] },
      { id: 'b', type: 'analyze', description: '', dependsOn: ['a'] },
    ]);
    expect(() => topoSort(plan)).toThrow();
  });
});

describe('validatePlan', () => {
  it('flags duplicate step ids', () => {
    const plan = basePlan([
      { id: 'a', type: 'analyze', description: '' },
      { id: 'a', type: 'analyze', description: '' },
    ]);
    const r = validatePlan(plan);
    expect(r.ok).toBe(false);
    expect(r.issues.join('\n')).toMatch(/duplicate/);
  });

  it('flags empty plans', () => {
    const plan = basePlan([]);
    expect(validatePlan(plan).ok).toBe(false);
  });
});
