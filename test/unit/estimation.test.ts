/**
 * Estimation tests for the estimatePlan function, which estimates the cost of executing a plan based on its steps.
 *
 * These tests verify that the estimation logic correctly counts the number of file writes, shell calls, and network calls based on the types of steps in the plan. The tests cover:
 *   Counting file writes for 'edit_file' steps.
 *   Counting shell calls for 'run_command' steps.
 *   Counting network calls for 'custom' steps that use network-based tools (e.g., 'web.search').
 *   Providing a summary string that includes the total step count.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

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
