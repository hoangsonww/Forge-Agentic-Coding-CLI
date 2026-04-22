/**
 * Heuristic-based classifier for software development tasks. This module analyzes the input text (e.g., task description, commit message) to classify the type of task (bugfix, feature, refactor, etc.), estimate its complexity, assess potential risks, and determine the scope of changes. The classification is based on a set of predefined rules and keywords commonly associated with different types of development tasks. The output includes a primary task type, secondary types, scope, complexity, risk level, and a confidence score indicating the reliability of the classification.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { TaskType, Complexity, Risk, Scope } from '../types';

/**
 * Conservative detector for "pure conversational question" inputs that don't
 * need the plan/approve/execute pipeline — e.g. "what's the difference
 * between a Map and a Dict?" or "explain closures".
 *
 * Err strongly toward false (treat as normal task). A missed-conversation
 * just means the user waits through planning for a tiny reply; a
 * false-positive means we answer from general knowledge when the user was
 * asking about their codebase.
 *
 * Rejects anything that:
 *   - references a file/path/extension in the repo
 *   - mentions "this codebase / this file / our code / …"
 *   - contains any imperative code verb (create/fix/refactor/write/…)
 *   - is longer than ~400 chars (chat questions are short)
 * Accepts if it starts with an interrogative (what/why/how/…) or ends with `?`.
 */
export const looksConversational = (input: string): boolean => {
  const s = input.trim();
  if (!s || s.length > 400) return false;

  // Any reference to repo artifacts disqualifies — the user is asking about
  // their code, not a general concept.
  const repoRef =
    /\b(src|lib|app|test|tests|docs|bin|dist|node_modules|public|scripts)\/[\w./-]+|\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|cs|php|swift|kt|md|json|yaml|yml|toml|html|css|scss|sh|sql|proto|graphql)\b|\bthis (repo|repository|codebase|code ?base|project|file|function|module|component|class|package|method|script|service)\b|\bthe (codebase|repo|project|file)\b|\b(README|CHANGELOG|LICENSE|NOTICE|CONTRIBUTING|SECURITY|Dockerfile|Makefile|package\.json|tsconfig|eslintrc|prettierrc)\b/;
  if (repoRef.test(s)) return false;

  // Imperative code / analysis actions imply the user wants something DONE
  // on concrete targets, not chatted about abstractly.
  const imperative =
    /\b(create|add|build|implement|introduce|fix|patch|refactor|rewrite|edit|modify|update|change|write|delete|remove|drop|migrate|install|upgrade|downgrade|optimi[sz]e|scaffold|deploy|setup|configure|rename|move|copy|generate|run|execute|test|summari[sz]e|analy[sz]e|audit|review|investigate|debug|trace|lint|format)\b/i;
  if (imperative.test(s)) return false;

  // Greetings / short chat openers. Pulled out because they're common REPL
  // starters and don't match any interrogative pattern.
  const greeting =
    /^(hi|hello|hey|yo|sup|howdy|greetings|good (morning|afternoon|evening|night)|thanks?|thx|ty|ok|okay|cool|nice|great|sure|yep|yeah|yes|no|nope|bye|goodbye|cheers)\b[!?. ]*$/i;
  if (greeting.test(s)) return true;

  // Question shape: starts with an interrogative or ends with '?'.
  const interrogative =
    /^(what|why|how|when|where|who|which|is|are|can|could|should|would|will|does|do|did|explain|compare|contrast|tell me|describe (?!src)|define|difference between)\b/i;
  if (interrogative.test(s)) return true;
  if (s.endsWith('?')) return true;

  // Short, non-imperative, no-repo-ref text (<=5 words, <=40 chars) is
  // almost always small talk or a clarifying remark rather than a coding
  // task. Takes the fast-path.
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  if (s.length <= 40 && wordCount <= 5) return true;

  return false;
};

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
