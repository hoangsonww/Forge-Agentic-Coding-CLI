/**
 * Cost ledger. Every model response is recorded with an estimated USD cost
 * based on static per-model rates. Costs are a rough indicator — the
 * provider's invoice is the source of truth. Rates live in one table so
 * corrections are cheap.
 */
import { getDb } from '../persistence/index-db';
import { ModelResponse } from '../types';
import { log } from '../logging/logger';

const migrate = (): void => {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS model_cost_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT,
      task_id TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cost_project ON model_cost_ledger(project_id);
    CREATE INDEX IF NOT EXISTS idx_cost_created ON model_cost_ledger(created_at);
  `);
};

interface Rate {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

// Approximate public rates. Local models (ollama/llamacpp) are free.
const RATE_TABLE: Array<{ match: RegExp; rate: Rate }> = [
  { match: /^claude-opus/, rate: { inputUsdPerMTok: 15, outputUsdPerMTok: 75 } },
  { match: /^claude-sonnet/, rate: { inputUsdPerMTok: 3, outputUsdPerMTok: 15 } },
  { match: /^claude-haiku/, rate: { inputUsdPerMTok: 0.8, outputUsdPerMTok: 4 } },
  { match: /^gpt-4o-mini/, rate: { inputUsdPerMTok: 0.15, outputUsdPerMTok: 0.6 } },
  { match: /^gpt-4o/, rate: { inputUsdPerMTok: 2.5, outputUsdPerMTok: 10 } },
  { match: /^gpt-4-turbo/, rate: { inputUsdPerMTok: 10, outputUsdPerMTok: 30 } },
  { match: /^gpt-4/, rate: { inputUsdPerMTok: 30, outputUsdPerMTok: 60 } },
  { match: /^gpt-3\.5/, rate: { inputUsdPerMTok: 0.5, outputUsdPerMTok: 1.5 } },
  { match: /^o1-mini/, rate: { inputUsdPerMTok: 3, outputUsdPerMTok: 12 } },
  { match: /^o1/, rate: { inputUsdPerMTok: 15, outputUsdPerMTok: 60 } },
];

export const estimateCostUsd = (
  provider: string,
  model: string,
  input: number,
  output: number,
): number => {
  if (provider === 'ollama' || provider === 'llamacpp') return 0;
  const rate = RATE_TABLE.find((r) => r.match.test(model));
  if (!rate) return 0;
  return (input * rate.rate.inputUsdPerMTok + output * rate.rate.outputUsdPerMTok) / 1_000_000;
};

export const record = (
  ctx: { projectId?: string; taskId?: string },
  response: ModelResponse,
): number => {
  try {
    migrate();
    const input = response.inputTokens ?? 0;
    const output = response.outputTokens ?? 0;
    const cost = estimateCostUsd(response.provider, response.model, input, output);
    getDb()
      .prepare(
        `INSERT INTO model_cost_ledger
         (project_id, task_id, provider, model, input_tokens, output_tokens, duration_ms, cost_usd, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ctx.projectId ?? null,
        ctx.taskId ?? null,
        response.provider,
        response.model,
        input,
        output,
        response.durationMs,
        cost,
        new Date().toISOString(),
      );
    return cost;
  } catch (err) {
    log.debug('cost ledger write failed', { err: String(err) });
    return 0;
  }
};

export const totals = (projectId?: string): { calls: number; tokens: number; usd: number } => {
  migrate();
  const db = getDb();
  const row = projectId
    ? db
        .prepare(
          'SELECT COUNT(*) as calls, COALESCE(SUM(input_tokens + output_tokens), 0) as tokens, COALESCE(SUM(cost_usd), 0) as usd FROM model_cost_ledger WHERE project_id = ?',
        )
        .get(projectId)
    : db
        .prepare(
          'SELECT COUNT(*) as calls, COALESCE(SUM(input_tokens + output_tokens), 0) as tokens, COALESCE(SUM(cost_usd), 0) as usd FROM model_cost_ledger',
        )
        .get();
  return row as { calls: number; tokens: number; usd: number };
};

export const recent = (limit = 25) => {
  migrate();
  return getDb()
    .prepare(
      `SELECT provider, model, input_tokens, output_tokens, duration_ms, cost_usd, created_at
       FROM model_cost_ledger ORDER BY id DESC LIMIT ?`,
    )
    .all(limit);
};
