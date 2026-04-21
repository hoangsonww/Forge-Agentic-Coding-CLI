/**
 * Plan fixer tests - ensures that the plan fixer correctly adds missing steps and deduplicates step ids based on the task profile.
 *
 * These tests verify that the plan fixer:
 *   - Adds a review step if it's missing and required by the profile.
 *   - Adds a run_tests step if it's required by the profile and missing from the plan.
 *   - Skips adding verification steps for trivial tasks that don't require them.
 *   - Deduplicates step ids when there are duplicates in the original plan.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import { fixPlan } from '../../src/core/plan-fixer';
import { Plan, TaskProfile } from '../../src/types';

const basePlan = (steps: Plan['steps']): Plan => ({
  id: 'p',
  goal: 'g',
  steps,
  createdAt: new Date().toISOString(),
  mode: 'balanced',
  version: '1',
});

const profile = (patch: Partial<TaskProfile> = {}): TaskProfile => ({
  intent: 'feature',
  secondary: [],
  complexity: 'moderate',
  scope: 'multi-file',
  risk: 'low',
  requiresPlan: true,
  requiresTests: true,
  requiresReview: true,
  agents: [],
  skills: [],
  explanation: '',
  ...patch,
});

describe('plan-fixer', () => {
  it('adds review step when missing', () => {
    const plan = basePlan([{ id: 'a', type: 'edit_file', description: 'write' }]);
    const r = fixPlan(plan, profile());
    expect(r.fixed).toBe(true);
    expect(r.plan.steps.some((s) => s.type === 'review')).toBe(true);
  });

  it('adds run_tests when required', () => {
    const plan = basePlan([
      { id: 'a', type: 'edit_file', description: 'write' },
      { id: 'b', type: 'review', description: 'review' },
    ]);
    const r = fixPlan(plan, profile({ requiresTests: true }));
    expect(r.plan.steps.some((s) => s.type === 'run_tests')).toBe(true);
  });

  it('skips verification add for trivial tasks', () => {
    const plan = basePlan([{ id: 'a', type: 'edit_file', description: 'rename' }]);
    const r = fixPlan(plan, profile({ complexity: 'trivial', requiresTests: false }));
    expect(r.plan.steps.every((s) => s.type !== 'review')).toBe(true);
  });

  it('dedupes duplicate step ids', () => {
    const plan = basePlan([
      { id: 'x', type: 'analyze', description: '1' },
      { id: 'x', type: 'analyze', description: '2' },
    ]);
    const r = fixPlan(plan, profile());
    const ids = new Set(r.plan.steps.map((s) => s.id));
    expect(ids.size).toBe(r.plan.steps.length);
  });
});
