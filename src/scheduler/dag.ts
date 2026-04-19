import { Plan, PlanStep } from '../types';
import { ForgeRuntimeError } from '../types/errors';

export const topoSort = (plan: Plan): PlanStep[] => {
  const byId = new Map(plan.steps.map((s) => [s.id, s]));
  const indeg = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const s of plan.steps) {
    indeg.set(s.id, 0);
    children.set(s.id, []);
  }
  for (const s of plan.steps) {
    const deps = s.dependsOn ?? [];
    for (const d of deps) {
      if (!byId.has(d)) continue; // ignore dangling refs (log upstream)
      indeg.set(s.id, (indeg.get(s.id) ?? 0) + 1);
      children.get(d)!.push(s.id);
    }
  }

  const queue: string[] = [];
  for (const [id, n] of indeg) if (n === 0) queue.push(id);

  const out: PlanStep[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(byId.get(id)!);
    for (const child of children.get(id) ?? []) {
      indeg.set(child, (indeg.get(child) ?? 0) - 1);
      if ((indeg.get(child) ?? 0) === 0) queue.push(child);
    }
  }
  if (out.length !== plan.steps.length) {
    throw new ForgeRuntimeError({
      class: 'plan_invalid',
      message: 'Plan contains a cycle or unresolvable dependency.',
      retryable: false,
    });
  }
  return out;
};

export const validatePlan = (plan: Plan): { ok: boolean; issues: string[] } => {
  const issues: string[] = [];
  if (!plan.steps.length) {
    issues.push('plan has no steps');
  }
  const ids = new Set<string>();
  for (const s of plan.steps) {
    if (ids.has(s.id)) issues.push(`duplicate step id ${s.id}`);
    ids.add(s.id);
  }
  for (const s of plan.steps) {
    for (const d of s.dependsOn ?? []) {
      if (!ids.has(d)) issues.push(`step ${s.id} depends on missing ${d}`);
    }
  }
  try {
    topoSort(plan);
  } catch (err) {
    issues.push(String((err as Error).message));
  }
  return { ok: issues.length === 0, issues };
};
