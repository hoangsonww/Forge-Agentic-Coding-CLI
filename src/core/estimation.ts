/**
 * Pre-execution resource estimation.
 *
 * Produces a human-readable preview: estimated file touches, shell calls,
 * runtime. Pure heuristics based on the plan structure; the value is in
 * warning the user before they approve a 30-step plan that will take 10
 * minutes and hit production DBs.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { Plan } from '../types';

export interface Estimate {
  stepCount: number;
  fileWrites: number;
  shellCalls: number;
  networkCalls: number;
  estimatedSeconds: number;
  summary: string;
}

const WEIGHTS: Record<string, number> = {
  analyze: 20,
  plan: 10,
  edit_file: 30,
  apply_patch: 25,
  create_file: 15,
  delete_file: 10,
  run_command: 60,
  run_tests: 120,
  review: 15,
  debug: 30,
  retrieve_context: 15,
  ask_user: 45,
  custom: 30,
};

export const estimatePlan = (plan: Plan): Estimate => {
  let fileWrites = 0;
  let shellCalls = 0;
  let networkCalls = 0;
  let total = 0;
  for (const s of plan.steps) {
    if (s.estimatedSeconds) total += s.estimatedSeconds;
    else total += WEIGHTS[s.type] ?? 20;
    if (
      s.type === 'edit_file' ||
      s.type === 'apply_patch' ||
      s.type === 'create_file' ||
      s.type === 'delete_file'
    ) {
      fileWrites++;
    }
    if (s.type === 'run_command' || s.type === 'run_tests') shellCalls++;
    if (s.tool && (s.tool.startsWith('web.') || s.tool.startsWith('mcp.'))) networkCalls++;
  }
  const summary =
    `${plan.steps.length} steps · ~${fileWrites} file writes · ~${shellCalls} shell calls` +
    (networkCalls ? ` · ~${networkCalls} network calls` : '') +
    ` · ~${Math.round(total / 60)}m estimated`;
  return {
    stepCount: plan.steps.length,
    fileWrites,
    shellCalls,
    networkCalls,
    estimatedSeconds: total,
    summary,
  };
};
