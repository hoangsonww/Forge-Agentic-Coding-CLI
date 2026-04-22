/**
 * Routing logic for model calls. This module encapsulates the decision-making process for which model provider and specific model to use for a given call, based on factors like the role of the call (e.g. planner vs executor), the mode (e.g. offline-safe), user preferences, and provider availability. The goal is to centralize this logic so that the rest of the system can simply call `callModel` with a role and mode, and get back a response without worrying about which provider is being used or handling fallbacks.
 *
 * The routing logic currently implements a local-first strategy, preferring local providers like Ollama when available, and falling back to Anthropic if not. It also takes into account the role of the call to select appropriate models (e.g. using a faster model for 'fast' roles). If the preferred provider is unavailable or fails, it will attempt to use a fallback provider if configured and available.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import {
  Mode,
  ModelMessage,
  ModelCallOptions,
  ModelResponse,
  ModelRole,
  ModelProvider,
} from '../types';
import { loadGlobalConfig } from '../config/loader';
import { ForgeRuntimeError } from '../types/errors';
import { getProvider, listProviders, firstAvailableProvider } from './provider';
import { log } from '../logging/logger';
import * as cache from './cache';
import * as rateLimit from './rate-limit';
import * as breaker from './circuit-breaker';
import * as cost from './cost';
import { resolveLocalModel, isLocalProvider } from './adapter';
import { emitDelta, eventBus } from '../persistence/events';

// Per-process cache of (provider:model) pairs we've already asked to warm.
// Warming is idempotent and cheap when already loaded, so the only reason to
// gate is to avoid emitting the "warming…" spinner text on every single call.
const warmed = new Set<string>();
const inflightWarms = new Map<string, Promise<void>>();

/**
 * Ensure the given provider+model is loaded into memory before we send the
 * first real request. Emits TASK-scoped MODEL_WARMING/MODEL_WARMED events so
 * the CLI spinner and UI can tell users exactly why they're waiting.
 *
 * Concurrent callers for the same (provider, model) share one underlying
 * warm promise. Warming errors are logged and swallowed — the next real call
 * will surface any real problem with a clearer error.
 */
const ensureWarm = async (
  provider: ModelProvider,
  model: string,
  ctx: CallContext,
): Promise<void> => {
  const warmFn = provider.warm;
  if (typeof warmFn !== 'function') return;
  const key = `${provider.name}:${model}`;
  if (warmed.has(key)) return;
  const existing = inflightWarms.get(key);
  if (existing) return existing;

  const started = Date.now();
  const task = (async () => {
    const timestamp = new Date().toISOString();
    eventBus.emit('event', {
      type: 'MODEL_WARMING',
      taskId: ctx.taskId,
      projectId: ctx.projectId,
      severity: 'info',
      message: `warming ${model}`,
      payload: { provider: provider.name, model },
      timestamp,
    });
    try {
      await warmFn.call(provider, model);
    } catch (err) {
      log.debug('warm threw despite contract', { provider: provider.name, err: String(err) });
    } finally {
      warmed.add(key);
      inflightWarms.delete(key);
      eventBus.emit('event', {
        type: 'MODEL_WARMED',
        taskId: ctx.taskId,
        projectId: ctx.projectId,
        severity: 'info',
        message: `warmed ${model}`,
        payload: { provider: provider.name, model, durationMs: Date.now() - started },
        timestamp: new Date().toISOString(),
      });
    }
  })();
  inflightWarms.set(key, task);
  return task;
};

/**
 * Best-effort fire-and-forget warm — used by the REPL at startup so the
 * model is ready by the time the user's first prompt arrives. Callers don't
 * await it and any errors are fully isolated.
 */
export const backgroundWarm = (providerName: string, model: string): void => {
  try {
    const provider = getProvider(providerName);
    void ensureWarm(provider, model, {});
  } catch {
    // provider not registered or something similar; silent per contract
  }
};

/**
 * Exposed for tests — clears the warmed set so a fresh run is observable.
 */
export const _resetWarmedForTest = (): void => {
  warmed.clear();
  inflightWarms.clear();
};

export interface RoutingDecision {
  provider: string;
  model: string;
  reason: string;
  fallback?: { provider: string; model: string };
}

const pickAnthropicForRole = (role: ModelRole): string => {
  if (role === 'architect' || role === 'reviewer' || role === 'debugger') return 'claude-opus-4-7';
  if (role === 'planner') return 'claude-sonnet-4-6';
  if (role === 'fast') return 'claude-haiku-4-5-20251001';
  return 'claude-sonnet-4-6';
};

const pickOllamaForRole = (role: ModelRole, cfg = loadGlobalConfig()): string => {
  if (role === 'fast') return cfg.models.fast;
  if (role === 'executor') return cfg.models.code;
  if (role === 'planner' || role === 'architect') return cfg.models.planner;
  return cfg.models.balanced;
};

export const resolveModel = async (params: {
  role: ModelRole;
  mode: Mode;
  preferredProvider?: string;
}): Promise<RoutingDecision> => {
  const cfg = loadGlobalConfig();
  const preferred = params.preferredProvider ?? cfg.provider;

  // Offline-safe never uses anthropic.
  if (params.mode === 'offline-safe' && preferred === 'anthropic') {
    log.info('routing: forcing ollama due to offline-safe mode');
  }
  const desired = params.mode === 'offline-safe' ? 'ollama' : preferred;

  const pickFor = async (providerName: string): Promise<string> => {
    if (providerName === 'anthropic') {
      return cfg.anthropic.model || pickAnthropicForRole(params.role);
    }
    const configured = pickOllamaForRole(params.role, cfg);
    if (isLocalProvider(providerName)) {
      try {
        return await resolveLocalModel(getProvider(providerName), params.role, configured);
      } catch (err) {
        log.debug('adapter failed; falling back to configured model', {
          provider: providerName,
          err: String(err),
        });
      }
    }
    return configured;
  };

  try {
    const provider = getProvider(desired);
    if (await provider.isAvailable()) {
      const model = await pickFor(desired);
      const fb = listProviders().find((p) => p.name !== desired);
      const fbModel = fb ? await pickFor(fb.name) : undefined;
      return {
        provider: desired,
        model,
        reason: `routed to ${desired} for role=${params.role} mode=${params.mode}`,
        fallback: fb && fbModel ? { provider: fb.name, model: fbModel } : undefined,
      };
    }
  } catch {
    // fall through
  }

  const fallback = await firstAvailableProvider();
  if (!fallback) {
    const tried = listProviders().map((p) => p.name);
    throw new ForgeRuntimeError({
      class: 'model_error',
      message: `No model provider is available (tried: ${tried.join(', ') || 'none'}).`,
      retryable: false,
      recoveryHint:
        'Start a local runtime — `ollama serve`, `vllm serve <model>`, or LM Studio → ' +
        'Start Server — or set ANTHROPIC_API_KEY / OPENAI_API_KEY. `forge doctor` shows details.',
    });
  }
  return {
    provider: fallback.name,
    model: await pickFor(fallback.name),
    reason: `fallback: ${desired} unavailable, using ${fallback.name}`,
  };
};

export interface CallContext {
  projectId?: string;
  taskId?: string;
  role?: ModelRole;
  /**
   * Disable streaming for this call even if the provider supports it. Used by
   * callers that explicitly need a single-shot response (e.g. strict JSON
   * mode with validators that parse the full body).
   */
  noStream?: boolean;
}

/**
 * Call a provider and accumulate a full `ModelResponse`, streaming deltas via
 * the in-process event bus along the way if the provider supports it. Falls
 * back cleanly to `complete()` for providers without `stream()`, callers that
 * opt out with `ctx.noStream`, or when `jsonMode` is set (JSON responses are
 * only useful whole).
 */
const callProvider = async (
  provider: ModelProvider,
  model: string,
  messages: ModelMessage[],
  options: ModelCallOptions,
  ctx: CallContext,
): Promise<ModelResponse> => {
  // Pre-warm on first use of this (provider, model) combo. This is the
  // difference between a mysterious 60+ second silence and an explicit
  // "warming qwen2.5:7b…" phase the user can see ticking.
  await ensureWarm(provider, model, ctx);

  const streamFn = !ctx.noStream && !options.jsonMode ? provider.stream : undefined;
  if (!streamFn) return provider.complete(model, messages, options);

  const started = Date.now();
  let text = '';
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let finishReason: 'stop' | 'length' | 'error' | 'tool_call' = 'stop';
  try {
    for await (const chunk of streamFn.call(provider, model, messages, options)) {
      if (chunk.delta) {
        text += chunk.delta;
        emitDelta({
          text: chunk.delta,
          taskId: ctx.taskId,
          projectId: ctx.projectId,
          role: ctx.role,
          model,
          provider: provider.name,
          done: false,
        });
      }
      if (chunk.done) {
        inputTokens = chunk.inputTokens ?? inputTokens;
        outputTokens = chunk.outputTokens ?? outputTokens;
        finishReason = chunk.finishReason ?? finishReason;
        emitDelta({
          text: '',
          taskId: ctx.taskId,
          projectId: ctx.projectId,
          role: ctx.role,
          model,
          provider: provider.name,
          done: true,
        });
      }
    }
  } catch (err) {
    // If streaming fails mid-flight, fall back to a blocking call so we don't
    // return a torn response to agents that expected a full body.
    log.debug('stream failed; falling back to complete()', {
      provider: provider.name,
      err: String(err),
    });
    return provider.complete(model, messages, options);
  }
  return {
    content: text,
    model,
    provider: provider.name,
    inputTokens,
    outputTokens,
    durationMs: Date.now() - started,
    finishReason,
  };
};

export const callModel = async (
  role: ModelRole,
  mode: Mode,
  messages: ModelMessage[],
  options: ModelCallOptions = {},
  ctx: CallContext = {},
): Promise<{
  response: ModelResponse;
  decision: RoutingDecision;
  cached: boolean;
  costUsd: number;
}> => {
  const decision = await resolveModel({ role, mode });

  // Prompt cache lookup (deterministic / temperature=0 only).
  const cached = cache.lookup(decision.provider, decision.model, messages, options);
  if (cached) {
    log.debug('prompt cache hit', { provider: decision.provider, model: decision.model });
    return { response: cached, decision, cached: true, costUsd: 0 };
  }

  if (
    !breaker.canTry(decision.provider) &&
    decision.fallback &&
    breaker.canTry(decision.fallback.provider)
  ) {
    log.warn('primary breaker open; routing to fallback', { provider: decision.provider });
    decision.provider = decision.fallback.provider;
    decision.model = decision.fallback.model;
  }

  const provider = getProvider(decision.provider);
  await rateLimit.acquire(decision.provider);
  log.debug('calling model', {
    role,
    mode,
    provider: decision.provider,
    model: decision.model,
  });
  const effectiveCtx: CallContext = { ...ctx, role };
  try {
    const response = await callProvider(provider, decision.model, messages, options, effectiveCtx);
    breaker.reportSuccess(decision.provider);
    cache.store(decision.provider, decision.model, messages, options, response);
    const usd = cost.record(ctx, response);
    return { response, decision, cached: false, costUsd: usd };
  } catch (err) {
    breaker.reportFailure(decision.provider);
    if (decision.fallback && breaker.canTry(decision.fallback.provider)) {
      log.warn('primary model failed, trying fallback', {
        err: String(err),
        fallback: decision.fallback,
      });
      await rateLimit.acquire(decision.fallback.provider);
      try {
        const fb = getProvider(decision.fallback.provider);
        const response = await callProvider(
          fb,
          decision.fallback.model,
          messages,
          options,
          effectiveCtx,
        );
        breaker.reportSuccess(decision.fallback.provider);
        cache.store(
          decision.fallback.provider,
          decision.fallback.model,
          messages,
          options,
          response,
        );
        const usd = cost.record(ctx, response);
        return {
          response,
          decision: { ...decision, reason: `fallback after error: ${String(err)}` },
          cached: false,
          costUsd: usd,
        };
      } catch (fallbackErr) {
        breaker.reportFailure(decision.fallback.provider);
        throw fallbackErr;
      }
    }
    throw err;
  }
};
