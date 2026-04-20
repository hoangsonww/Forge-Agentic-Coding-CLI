/**
 * Typed fixture loaders.
 *
 * Tests should import from here rather than reading fixture files by path
 * so that a restructure doesn't ripple into 30 suites. Every helper
 * returns a fresh deep-clone (via JSON round-trip) so mutation in one
 * test can't leak into another.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Plan, Task } from '../../src/types';

const FIXTURES_DIR = __dirname;

const readJson = <T>(relPath: string): T => {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, relPath), 'utf8');
  return JSON.parse(raw) as T;
};

const readText = (relPath: string): string =>
  fs.readFileSync(path.join(FIXTURES_DIR, relPath), 'utf8');

/* ---------- Tasks ---------- */

export const draftTask = (): Task => readJson<Task>('tasks/draft.json');
export const plannedTask = (): Task => readJson<Task>('tasks/planned.json');
export const completedTask = (): Task => readJson<Task>('tasks/completed.json');
export const failedTask = (): Task => readJson<Task>('tasks/failed.json');

/* ---------- Plans ---------- */

export const bugfix3stepPlan = (): Plan => readJson<Plan>('plans/bugfix-3step.json');
export const invalidCyclePlan = (): Plan => readJson<Plan>('plans/invalid-cycle.json');

/* ---------- JSONL streams ---------- */

export const replSessionJsonl = (): string => readText('sessions/repl.jsonl');
export const replConversationJsonl = (): string => readText('conversations/repl.jsonl');

export const replSessionEntries = (): Array<Record<string, unknown>> =>
  replSessionJsonl()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

export const replConversationEntries = (): Array<Record<string, unknown>> =>
  replConversationJsonl()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

/* ---------- Markdown skills ---------- */

export const commitStyleSkill = (): string => readText('skills/commit-style.md');

/* ---------- Config + provider data ---------- */

export const globalConfigJson = (): unknown => readJson('config/global.json');
export const ollamaTagsResponse = (): { models: Array<{ name: string; size?: number }> } =>
  readJson('models/ollama-tags.json');

/* ---------- Path helpers (rarely needed; prefer the loaders above) ---------- */

export const fixturePath = (relPath: string): string => path.join(FIXTURES_DIR, relPath);
