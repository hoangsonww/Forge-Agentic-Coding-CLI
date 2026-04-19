import { describe, it, expect } from 'vitest';
import { estimatePlan } from '../../src/core/estimation';
import { Plan } from '../../src/types';

const p = (steps: Plan['steps']): Plan => ({
  id: 'p',
  goal: 'g',
  steps,
  createdAt: new Date().toISOString(),
  mode: 'balanced',
  version: '1',
});

describe('estimatePlan', () => {
  it('counts writes, shells, network calls', () => {
    const e = estimatePlan(
      p([
        { id: '1', type: 'edit_file', description: 'e' },
        { id: '2', type: 'run_command', description: 'r' },
        { id: '3', type: 'custom', description: 'x', tool: 'web.search' },
      ]),
    );
    expect(e.fileWrites).toBe(1);
    expect(e.shellCalls).toBe(1);
    expect(e.networkCalls).toBe(1);
    expect(e.stepCount).toBe(3);
    expect(e.summary).toContain('steps');
  });
});
