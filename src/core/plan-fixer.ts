import { Plan, PlanStep, TaskProfile } from '../types';
import { newStepId } from '../logging/trace';

/**
 * Auto-fixes common structural problems in a plan before it reaches the
 * approval gate:
 *   - ensures every non-trivial plan ends with a verification step
 *   - adds a missing test step when profile.requiresTests
 *   - repairs dangling dependsOn references
 *   - dedupes step ids
 */
export interface FixerReport {
  fixed: boolean;
  notes: string[];
  plan: Plan;
}

export const fixPlan = (plan: Plan, profile: TaskProfile | undefined): FixerReport => {
  const notes: string[] = [];
  let steps = [...plan.steps];
  const ids = new Set<string>();
  let idx = 0;
  for (const s of steps) {
    idx++;
    if (!s.id || ids.has(s.id)) {
      const fresh = newStepId(idx);
      notes.push(`renamed duplicate/missing id → ${fresh}`);
      s.id = fresh;
    }
    ids.add(s.id);
  }

  steps = steps.map((s) => ({
    ...s,
    dependsOn: s.dependsOn?.filter((d) => ids.has(d)),
  }));

  const hasVerification = steps.some((s) =>
    ['run_tests', 'review', 'verify'].includes(s.type as string),
  );
  const isTrivial = profile?.complexity === 'trivial';
  if (!hasVerification && !isTrivial) {
    const verify: PlanStep = {
      id: newStepId(steps.length + 1),
      type: 'review',
      description: 'Review the change and confirm it matches the task intent.',
      dependsOn: steps.length ? [steps[steps.length - 1].id] : undefined,
    };
    steps.push(verify);
    notes.push('added missing review step');
  }

  const needsTests = profile?.requiresTests && !steps.some((s) => s.type === 'run_tests');
  if (needsTests) {
    const testStep: PlanStep = {
      id: newStepId(steps.length + 1),
      type: 'run_tests',
      description: 'Run the test suite and confirm no regressions.',
      dependsOn: steps.length ? [steps[steps.length - 1].id] : undefined,
      risk: 'medium',
    };
    steps.splice(steps.length - (hasVerification ? 0 : 1), 0, testStep);
    notes.push('inserted missing run_tests step');
  }

  const fixed = notes.length > 0;
  return {
    fixed,
    notes,
    plan: fixed ? { ...plan, steps } : plan,
  };
};
