/**
 * Slash-command catalog for the Forge REPL.
 *
 * Every entry declares:
 *   - name:      canonical name without the leading slash ("status")
 *   - aliases:   alternative names ("s")
 *   - description: shown in the live dropdown and /help card
 *   - category:  groups entries in /help
 *   - kind:      how the REPL executes it — a commander passthrough, an
 *                internal editor action, or a semantic shortcut that rewrites
 *                the user prompt before handing off to the orchestrator.
 *   - template:  for kind="semantic", a function (args) => { prompt, mode? }
 *                that produces the orchestrator input.
 *
 * Fuzzy ranking is intentionally small and hand-tuned: exact name → prefix →
 * substring → subsequence, with boosts for matching at the start of the
 * command and within word boundaries.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Mode } from '../types';

export type SlashKind = 'passthrough' | 'internal' | 'semantic';

export interface SemanticExpansion {
  prompt: string;
  mode?: Mode;
  autoApprove?: boolean;
  planOnly?: boolean;
}

export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  category:
    | 'Agentic'
    | 'Session'
    | 'Modes'
    | 'Knowledge'
    | 'Models'
    | 'Infrastructure'
    | 'Shortcut';
  kind: SlashKind;
  passthroughTo?: string;
  template?: (args: string) => SemanticExpansion;
  hint?: string;
}

const tpl =
  (
    prompt: (args: string) => string,
    opts: Partial<SemanticExpansion> = {},
  ): ((a: string) => SemanticExpansion) =>
  (args) => ({ prompt: prompt(args), ...opts });

// ---------- Catalog ----------

export const SLASH_COMMANDS: SlashCommand[] = [
  // Agentic
  {
    name: 'run',
    description: 'run a task (same as typing the prompt bare)',
    category: 'Agentic',
    kind: 'passthrough',
    passthroughTo: 'run',
    aliases: ['r'],
  },
  {
    name: 'plan',
    description: 'produce a plan without executing',
    category: 'Agentic',
    kind: 'passthrough',
    passthroughTo: 'plan',
    aliases: ['p'],
  },
  {
    name: 'execute',
    description: 'execute an approved plan (auto-approve)',
    category: 'Agentic',
    kind: 'passthrough',
    passthroughTo: 'execute',
  },
  {
    name: 'resume',
    description: 'resume any prior task (interactive picker)',
    category: 'Agentic',
    kind: 'passthrough',
    passthroughTo: 'resume',
  },
  {
    name: 'spec',
    description: 'specification workflow',
    category: 'Agentic',
    kind: 'passthrough',
    passthroughTo: 'spec',
  },
  {
    name: 'task',
    description: 'task registry: list / show / cancel',
    category: 'Agentic',
    kind: 'passthrough',
    passthroughTo: 'task',
  },
  {
    name: 'status',
    aliases: ['s', 'stat'],
    description: 'compact runtime + project status',
    category: 'Agentic',
    kind: 'passthrough',
    passthroughTo: 'status',
  },
  {
    name: 'doctor',
    aliases: ['d', 'health'],
    description: 'environment + connectivity health check',
    category: 'Agentic',
    kind: 'passthrough',
    passthroughTo: 'doctor',
  },

  // Shortcuts (semantic prompt templates)
  {
    name: 'ask',
    aliases: ['a'],
    description: 'ask a question about this codebase',
    category: 'Shortcut',
    kind: 'semantic',
    template: tpl(
      (a) =>
        `Answer the following question about this codebase with references to specific files and line numbers. Do not change any code.\n\nQuestion: ${a}`,
      { mode: 'fast' },
    ),
    hint: '/ask how does the scheduler work?',
  },
  {
    name: 'explain',
    description: 'explain a file, function, or concept',
    category: 'Shortcut',
    kind: 'semantic',
    template: tpl(
      (a) =>
        `Explain ${a} in detail. Reference specific lines. Highlight invariants, edge cases, and non-obvious behaviour. Read-only — do not modify code.`,
      { mode: 'fast' },
    ),
    hint: '/explain src/core/loop.ts',
  },
  {
    name: 'fix',
    description: 'diagnose and fix a bug',
    category: 'Shortcut',
    kind: 'semantic',
    template: tpl(
      (a) =>
        `Diagnose and fix: ${a}\n\nReproduce first, then propose a minimal fix with tests that cover the regression.`,
      { mode: 'debug' },
    ),
    hint: '/fix login flow 500s on empty email',
  },
  {
    name: 'test',
    description: 'add or fix tests',
    category: 'Shortcut',
    kind: 'semantic',
    template: tpl(
      (a) =>
        `Add or improve tests for: ${a}\n\nCover success path, edge cases, and error paths. Match existing testing conventions.`,
      { mode: 'balanced' },
    ),
  },
  {
    name: 'review',
    description: 'review code quality / architecture',
    category: 'Shortcut',
    kind: 'semantic',
    template: tpl(
      (a) =>
        `Review ${a} across correctness, readability, architecture, security, and performance. Report findings without rewriting.`,
      { mode: 'audit' },
    ),
  },
  {
    name: 'refactor',
    description: 'refactor without changing behaviour',
    category: 'Shortcut',
    kind: 'semantic',
    template: tpl(
      (a) =>
        `Refactor ${a} without changing observable behaviour. Keep tests green. Prefer minimal diffs and clearer names over clever abstractions.`,
      { mode: 'architect' },
    ),
  },
  {
    name: 'docs',
    description: 'write / update documentation',
    category: 'Shortcut',
    kind: 'semantic',
    template: tpl(
      (a) =>
        `Write or update documentation for ${a}. Match the existing style. Reference concrete examples from the code.`,
      { mode: 'balanced' },
    ),
  },
  {
    name: 'audit',
    description: 'security audit of code or config',
    category: 'Shortcut',
    kind: 'semantic',
    template: tpl(
      (a) =>
        `Security audit: ${a}\n\nReport findings by severity (critical/high/medium/low) with remediation. Focus on OWASP top 10, input validation, auth, secrets, supply chain.`,
      { mode: 'audit' },
    ),
  },
  {
    name: 'commit',
    description: 'compose a git commit for pending changes',
    category: 'Shortcut',
    kind: 'semantic',
    template: tpl(
      (a) =>
        `Review git status and pending changes. Compose an atomic commit (or multiple if needed) with clear messages. ${a ? 'Scope hint: ' + a : ''}`.trim(),
      { mode: 'balanced' },
    ),
  },
  {
    name: 'optimize',
    description: 'optimize a hot path',
    category: 'Shortcut',
    kind: 'semantic',
    template: tpl(
      (a) =>
        `Measure and optimize: ${a}\n\nProfile first. Only change what measurement says matters. Report before/after numbers.`,
      { mode: 'heavy' },
    ),
  },

  // Session
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'show REPL command reference',
    category: 'Session',
    kind: 'internal',
  },
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    description: 'leave the REPL',
    category: 'Session',
    kind: 'internal',
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: 'clear the screen',
    category: 'Session',
    kind: 'internal',
  },
  {
    name: 'new',
    aliases: ['reset'],
    description: 'start a fresh conversation (clears turn history)',
    category: 'Session',
    kind: 'internal',
  },
  {
    name: 'turns',
    aliases: ['history'],
    description: 'show turns in this session',
    category: 'Session',
    kind: 'internal',
  },
  {
    name: 'session',
    description: 'task session replay / list / fork',
    category: 'Session',
    kind: 'passthrough',
    passthroughTo: 'session',
  },
  {
    name: 'sessions',
    aliases: ['ls'],
    description: 'list prior conversations (REPL + web chat)',
    category: 'Session',
    kind: 'internal',
  },
  {
    name: 'load',
    aliases: ['switch', 'open'],
    description: 'load a prior conversation by id',
    category: 'Session',
    kind: 'internal',
  },
  {
    name: 'continue',
    aliases: ['cont'],
    description: 'continue the most recently updated conversation',
    category: 'Session',
    kind: 'internal',
  },
  {
    name: 'rename',
    description: 'rename the current conversation',
    category: 'Session',
    kind: 'internal',
  },
  {
    name: 'delete',
    aliases: ['rm'],
    description: 'delete a conversation by id (default: current)',
    category: 'Session',
    kind: 'internal',
  },
  {
    name: 'export',
    description: 'export the current conversation to a JSON file',
    category: 'Session',
    kind: 'internal',
  },
  {
    name: 'pwd',
    aliases: ['cwd'],
    description: 'show current working directory',
    category: 'Session',
    kind: 'internal',
  },
  {
    name: 'cd',
    description: 'change the working directory',
    category: 'Session',
    kind: 'internal',
  },
  { name: 'retry', description: 'retry the last turn', category: 'Session', kind: 'internal' },
  {
    name: 'undo',
    description: 'undo the last turn (git stash)',
    category: 'Session',
    kind: 'internal',
  },

  // Modes / permissions
  {
    name: 'mode',
    aliases: ['m'],
    description: 'set mode: fast|balanced|heavy|plan|audit|debug|architect|offline-safe',
    category: 'Modes',
    kind: 'internal',
  },
  {
    name: 'yes',
    description: 'auto-approve plans for future turns (toggle)',
    category: 'Modes',
    kind: 'internal',
  },
  {
    name: 'strict',
    description: 'confirm every action (toggle)',
    category: 'Modes',
    kind: 'internal',
  },
  {
    name: 'allow',
    description: 'grant files|shell|network|web|mcp|all',
    category: 'Modes',
    kind: 'internal',
  },
  { name: 'deny', description: 'revoke a flag', category: 'Modes', kind: 'internal' },
  {
    name: 'permissions',
    description: 'view / edit permission policy',
    category: 'Modes',
    kind: 'passthrough',
    passthroughTo: 'permissions',
  },

  // Knowledge / tools
  {
    name: 'memory',
    description: 'hot/warm/cold memory operations',
    category: 'Knowledge',
    kind: 'passthrough',
    passthroughTo: 'memory',
  },
  {
    name: 'skills',
    description: 'skills marketplace',
    category: 'Knowledge',
    kind: 'passthrough',
    passthroughTo: 'skills',
  },
  {
    name: 'agents',
    description: 'agent registry',
    category: 'Knowledge',
    kind: 'passthrough',
    passthroughTo: 'agents',
  },
  {
    name: 'mcp',
    description: 'MCP server management',
    category: 'Knowledge',
    kind: 'passthrough',
    passthroughTo: 'mcp',
  },
  {
    name: 'web',
    description: 'web fetch / search / browse',
    category: 'Knowledge',
    kind: 'passthrough',
    passthroughTo: 'web',
  },

  // Models / config
  {
    name: 'model',
    aliases: ['models'],
    description: 'switch planner / executor models',
    category: 'Models',
    kind: 'passthrough',
    passthroughTo: 'model',
  },
  {
    name: 'config',
    description: 'read / edit config',
    category: 'Models',
    kind: 'passthrough',
    passthroughTo: 'config',
  },
  {
    name: 'cost',
    description: 'session cost summary',
    category: 'Models',
    kind: 'passthrough',
    passthroughTo: 'cost',
  },

  // Infra
  {
    name: 'init',
    description: 'initialise forge in this project',
    category: 'Infrastructure',
    kind: 'passthrough',
    passthroughTo: 'init',
  },
  {
    name: 'ui',
    description: 'launch / control the web dashboard',
    category: 'Infrastructure',
    kind: 'passthrough',
    passthroughTo: 'ui',
  },
  {
    name: 'daemon',
    description: 'background daemon control',
    category: 'Infrastructure',
    kind: 'passthrough',
    passthroughTo: 'daemon',
  },
  {
    name: 'bundle',
    description: 'release bundling',
    category: 'Infrastructure',
    kind: 'passthrough',
    passthroughTo: 'bundle',
  },
  {
    name: 'container',
    description: 'run inside a container',
    category: 'Infrastructure',
    kind: 'passthrough',
    passthroughTo: 'container',
  },
  {
    name: 'migrate',
    description: 'migrate data schemas',
    category: 'Infrastructure',
    kind: 'passthrough',
    passthroughTo: 'migrate',
  },
  {
    name: 'update',
    description: 'check / apply updates',
    category: 'Infrastructure',
    kind: 'passthrough',
    passthroughTo: 'update',
  },
  {
    name: 'changelog',
    description: 'show recent changes',
    category: 'Infrastructure',
    kind: 'passthrough',
    passthroughTo: 'changelog',
  },
  {
    name: 'dev',
    description: 'dev loop helpers',
    category: 'Infrastructure',
    kind: 'passthrough',
    passthroughTo: 'dev',
  },
];

// ---------- Lookups ----------

const CMD_BY_NAME: Map<string, SlashCommand> = (() => {
  const m = new Map<string, SlashCommand>();
  for (const c of SLASH_COMMANDS) {
    m.set(c.name, c);
    for (const a of c.aliases ?? []) m.set(a, c);
  }
  return m;
})();

export const findSlash = (input: string): SlashCommand | undefined =>
  CMD_BY_NAME.get(input.toLowerCase());

// ---------- Fuzzy ranking ----------

/**
 * Score how well `query` matches `candidate`. Higher = better. Negative = no match.
 */
const scoreOne = (query: string, candidate: string): number => {
  if (!query) return 0;
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (q === c) return 1000;
  if (c.startsWith(q)) return 700 - (c.length - q.length);
  const idx = c.indexOf(q);
  if (idx >= 0) return 400 - idx * 2 - (c.length - q.length);
  // Subsequence match: q chars appear in order inside c
  let ci = 0;
  for (const ch of q) {
    const found = c.indexOf(ch, ci);
    if (found < 0) return -1;
    ci = found + 1;
  }
  return 120 - (c.length - q.length);
};

export interface SlashSuggestion {
  label: string;
  value: string; // "/<name>"
  description?: string;
  score: number;
  cmd: SlashCommand;
}

export const rankSlash = (input: string, limit = 8): SlashSuggestion[] => {
  if (!input.startsWith('/')) return [];
  const rest = input.slice(1);
  const head = rest.split(/\s+/, 1)[0] ?? '';
  // empty head → show a curated starter list (the most useful commands)
  if (!head) {
    const starter = ['ask', 'plan', 'run', 'fix', 'review', 'status', 'help', 'exit']
      .map((n) => CMD_BY_NAME.get(n))
      .filter((c): c is SlashCommand => Boolean(c));
    return starter.map((c) => ({
      label: '/' + c.name,
      value: '/' + c.name,
      description: c.description,
      score: 500,
      cmd: c,
    }));
  }
  const seen = new Set<SlashCommand>();
  const scored: SlashSuggestion[] = [];
  for (const c of SLASH_COMMANDS) {
    if (seen.has(c)) continue;
    const names = [c.name, ...(c.aliases ?? [])];
    let best = -1;
    let bestName = c.name;
    for (const n of names) {
      const s = scoreOne(head, n);
      if (s > best) {
        best = s;
        bestName = n;
      }
    }
    if (best >= 0) {
      seen.add(c);
      scored.push({
        label: '/' + bestName,
        value: '/' + c.name,
        description: c.description,
        score: best,
        cmd: c,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
};
