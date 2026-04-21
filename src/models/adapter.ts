/**
 * Local-model adapter.
 *
 * Users run Forge with whatever models they have pulled locally — we don't
 * get to assume `llama3:8b` or `deepseek-coder:6.7b` are installed. This
 * module reconciles Forge's configured per-role models with what the user
 * actually has available and picks a best-fit substitute when needed.
 *
 * Results are cached per process so we don't hammer `/api/tags` on every
 * single model call; the cache is invalidated by provider restart (which
 * bumps `provider.isAvailable()` probes anyway).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { ModelProvider, ModelRole } from '../types';
import { classifyModel, pickModelForRole } from './local-catalog';
import { log } from '../logging/logger';

interface CachedMapping {
  /** Installed model ids discovered at resolution time. */
  installed: string[];
  /** Per-role selections, memoised. */
  perRole: Map<ModelRole, string | null>;
  /** Models we've already warned about substituting so we don't spam. */
  warned: Set<string>;
}

const cache = new Map<string, CachedMapping>();

/**
 * Is a locally-styled provider? Anything that speaks to the user's machine
 * benefits from the adapter; hosted providers pick by role via their own
 * router logic.
 */
export const isLocalProvider = (name: string): boolean =>
  name === 'ollama' ||
  name === 'llamacpp' ||
  name === 'vllm' ||
  name === 'lmstudio' ||
  // A user-pointed `openai` provider with OPENAI_BASE_URL is effectively
  // local-ish (LocalAI, Together, etc.) — but we only adapt when it isn't
  // the real OpenAI endpoint. The provider class knows this; router checks
  // `isLocalProvider` only for known-local runtimes.
  false;

const loadMapping = async (provider: ModelProvider): Promise<CachedMapping> => {
  const hit = cache.get(provider.name);
  if (hit) return hit;
  let installed: string[] = [];
  try {
    const models = await provider.listModels();
    installed = models.map((m) => m.id);
  } catch (err) {
    log.debug('adapter: listModels failed', { provider: provider.name, err: String(err) });
  }
  const entry: CachedMapping = { installed, perRole: new Map(), warned: new Set() };
  cache.set(provider.name, entry);
  return entry;
};

/**
 * Resolve the model id Forge should actually use for `role` on `provider`,
 * given the user's configured preference.
 *
 * Behaviour:
 *  - If `configured` is installed → return it unchanged.
 *  - Else pick the best-fit installed model via `pickModelForRole`.
 *  - Warn (once) when we substitute so users know their config is drifting.
 *  - Fall back to `configured` verbatim if discovery fails — the provider
 *    will surface a concrete error downstream, and we still beat a silent
 *    corruption.
 */
export const resolveLocalModel = async (
  provider: ModelProvider,
  role: ModelRole,
  configured: string,
): Promise<string> => {
  if (!isLocalProvider(provider.name)) return configured;

  const mapping = await loadMapping(provider);
  if (!mapping.installed.length) return configured; // probe failed; let the call error out plainly

  if (mapping.installed.includes(configured)) return configured;

  const cached = mapping.perRole.get(role);
  if (cached) return cached;

  const picked = pickModelForRole(
    mapping.installed.map((id) => ({ id, meta: classifyModel(id) })),
    role,
  );
  if (picked) {
    mapping.perRole.set(role, picked);
    const warnKey = `${role}:${configured}→${picked}`;
    if (!mapping.warned.has(warnKey)) {
      mapping.warned.add(warnKey);
      log.info('adapter: substituted model', {
        provider: provider.name,
        role,
        configured,
        picked,
      });
    }
    return picked;
  }
  return configured;
};

/** Exposed for tests + `forge doctor` to surface the current mapping. */
export const snapshotMapping = (providerName: string): CachedMapping | null =>
  cache.get(providerName) ?? null;

/** Exposed for tests — wipe the process-level cache. */
export const _resetAdapterForTest = (): void => cache.clear();
