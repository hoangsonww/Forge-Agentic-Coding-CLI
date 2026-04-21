/**
 * Heuristic-based classifier for software development tasks. This module analyzes the input text (e.g., task description, commit message) to classify the type of task (bugfix, feature, refactor, etc.), estimate its complexity, assess potential risks, and determine the scope of changes. The classification is based on a set of predefined rules and keywords commonly associated with different types of development tasks. The output includes a primary task type, secondary types, scope, complexity, risk level, and a confidence score indicating the reliability of the classification.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { TaskType, Complexity, Risk, Scope } from '../types';

interface KeywordRule {
  re: RegExp;
  type: TaskType;
  weight: number;
}

const RULES: KeywordRule[] = [
  { re: /\b(fix|bug|broken|crash|error|issue)\b/i, type: 'bugfix', weight: 3 },
  { re: /\b(refactor|clean ?up|rewrite|simplify|restructure)\b/i, type: 'refactor', weight: 3 },
  {
    re: /\b(add|build|create|implement|introduce|new feature|feature)\b/i,
    type: 'feature',
    weight: 2,
  },
  {
    re: /\b(optimi[sz]e|speed ?up|faster|performance|reduce latency)\b/i,
    type: 'optimization',
    weight: 3,
  },
  {
    re: /\b(explain|understand|analy[sz]e|describe|what does|why does)\b/i,
    type: 'analysis',
    weight: 2,
  },
  { re: /\b(install|setup|configure|scaffold|init|bootstrap)\b/i, type: 'setup', weight: 2 },
  {
    re: /\b(test|unit test|integration test|spec|coverage|write a test)\b/i,
    type: 'test',
    weight: 2,
  },
];

const SCOPE_HINTS: Array<{ re: RegExp; scope: Scope; weight: number }> = [
  {
    re: /\b(system[- ]wide|entire|whole|all (files|modules)|monorepo)\b/i,
    scope: 'system-wide',
    weight: 3,
  },
  {
    re: /\b(multi[- ]?module|across (services|packages|modules)|architecture)\b/i,
    scope: 'multi-module',
    weight: 3,
  },
  {
    re: /\b(across files|multiple files|in several|refactor .* (files|modules))\b/i,
    scope: 'multi-file',
    weight: 2,
  },
];

const COMPLEXITY_HINTS: Array<{ re: RegExp; c: Complexity; weight: number }> = [
  { re: /\b(rename|typo|one[- ]liner|tiny|quick|trivial|small|minor)\b/i, c: 'trivial', weight: 3 },
  {
    re: /\b(architecture|design|system[- ]level|end[- ]to[- ]end|major|large)\b/i,
    c: 'complex',
    weight: 3,
  },
];

const RISK_HINTS: Array<{ re: RegExp; risk: Risk; weight: number }> = [
  { re: /\b(delete|remove|drop|destroy|wipe|purge)\b/i, risk: 'critical', weight: 5 },
  {
    re: /\b(migrate|migration|rename|breaking change|production|rm -rf)\b/i,
    risk: 'high',
    weight: 4,
  },
  {
    re: /\b(install|update deps|upgrade|downgrade|refactor|rewrite)\b/i,
    risk: 'medium',
    weight: 2,
  },
];

export interface HeuristicResult {
  type: TaskType;
  secondary: TaskType[];
  scope: Scope;
  complexity: Complexity;
  risk: Risk;
  confidence: number;
}

export const heuristicClassify = (input: string, fileCount = 0): HeuristicResult => {
  const scores = new Map<TaskType, number>();
  for (const { re, type, weight } of RULES) {
    if (re.test(input)) scores.set(type, (scores.get(type) ?? 0) + weight);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const primary: TaskType = ranked[0]?.[0] ?? 'other';
  const secondary: TaskType[] = ranked.slice(1, 3).map(([t]) => t);

  let scope: Scope = fileCount > 5 ? 'multi-file' : 'single-file';
  let scopeScore = 0;
  for (const h of SCOPE_HINTS) {
    if (h.re.test(input) && h.weight > scopeScore) {
      scope = h.scope;
      scopeScore = h.weight;
    }
  }

  let complexity: Complexity = 'simple';
  let complexityScore = 0;
  for (const h of COMPLEXITY_HINTS) {
    if (h.re.test(input) && h.weight > complexityScore) {
      complexity = h.c;
      complexityScore = h.weight;
    }
  }
  if (scope === 'system-wide' || scope === 'multi-module') complexity = 'complex';
  if (primary === 'refactor' && scope !== 'single-file') complexity = 'moderate';

  let risk: Risk = 'low';
  let riskScore = 0;
  for (const h of RISK_HINTS) {
    if (h.re.test(input) && h.weight > riskScore) {
      risk = h.risk;
      riskScore = h.weight;
    }
  }
  if (scope === 'system-wide' && riskScore < 4) risk = 'high';

  const confidence =
    Math.min(1, (ranked[0]?.[1] ?? 0) / 5) * 0.6 +
    Math.min(1, scopeScore / 3) * 0.2 +
    Math.min(1, riskScore / 5) * 0.2;

  return { type: primary, secondary, scope, complexity, risk, confidence };
};
