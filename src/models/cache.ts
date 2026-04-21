/**
 * Prompt-level response cache. Keyed by the deterministic prompt hash from
 * the assembler plus call options. Only caches when temperature=0 (or
 * deterministic=true). Keeps a small LRU in-process + an optional SQLite
 * mirror so repeated runs benefit from prior output without hitting the
 * model again.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import * as crypto from 'crypto';
import { ModelCallOptions, ModelMessage, ModelResponse } from '../types';
import { getDb } from '../persistence/index-db';
import { log } from '../logging/logger';

const migrate = (): void => {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS prompt_cache (
      key TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      content TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      finish_reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_prompt_cache_created ON prompt_cache(created_at);
  `);
};

const MAX_LIVE = 128;
interface Entry {
  key: string;
  value: ModelResponse;
  addedAt: number;
}
const live: Entry[] = [];

const makeKey = (
  provider: string,
  model: string,
  messages: ModelMessage[],
  options: ModelCallOptions,
): string => {
  const hasher = crypto.createHash('sha256');
  hasher.update(`${provider}::${model}::`);
  for (const m of messages) hasher.update(`${m.role}::${m.content}\n`);
  hasher.update(JSON.stringify({ ...options, timeoutMs: undefined }));
  return hasher.digest('hex');
};

const isCacheable = (options: ModelCallOptions): boolean =>
  options.deterministic === true || (options.temperature ?? 0.3) === 0;

export const lookup = (
  provider: string,
  model: string,
  messages: ModelMessage[],
  options: ModelCallOptions,
): ModelResponse | null => {
  if (!isCacheable(options)) return null;
  const key = makeKey(provider, model, messages, options);
  const fromLive = live.find((e) => e.key === key);
  if (fromLive) return fromLive.value;
  try {
    migrate();
    const row = getDb()
      .prepare(
        'SELECT content, provider, model, input_tokens, output_tokens, finish_reason FROM prompt_cache WHERE key = ?',
      )
      .get(key) as
      | {
          content: string;
          provider: string;
          model: string;
          input_tokens: number | null;
          output_tokens: number | null;
          finish_reason: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      content: row.content,
      provider: row.provider,
      model: row.model,
      inputTokens: row.input_tokens ?? undefined,
      outputTokens: row.output_tokens ?? undefined,
      finishReason: (row.finish_reason as ModelResponse['finishReason']) ?? 'stop',
      durationMs: 0,
    };
  } catch (err) {
    log.debug('prompt cache lookup failed', { err: String(err) });
    return null;
  }
};

export const store = (
  provider: string,
  model: string,
  messages: ModelMessage[],
  options: ModelCallOptions,
  response: ModelResponse,
): void => {
  if (!isCacheable(options)) return;
  const key = makeKey(provider, model, messages, options);
  live.push({ key, value: response, addedAt: Date.now() });
  if (live.length > MAX_LIVE) live.shift();
  try {
    migrate();
    getDb()
      .prepare(
        `INSERT INTO prompt_cache (key, provider, model, content, input_tokens, output_tokens, finish_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`,
      )
      .run(
        key,
        provider,
        model,
        response.content,
        response.inputTokens ?? null,
        response.outputTokens ?? null,
        response.finishReason ?? null,
        new Date().toISOString(),
      );
  } catch (err) {
    log.debug('prompt cache store failed', { err: String(err) });
  }
};

export const clear = (): number => {
  live.length = 0;
  try {
    migrate();
    const r = getDb().prepare('DELETE FROM prompt_cache').run();
    return r.changes;
  } catch {
    return 0;
  }
};
