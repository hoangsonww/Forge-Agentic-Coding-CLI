import { Mode, ModelMessage, ModelCallOptions, ModelResponse, ModelRole } from '../types';
import { loadGlobalConfig } from '../config/loader';
import { ForgeRuntimeError } from '../types/errors';
import { getProvider, listProviders, firstAvailableProvider } from './provider';
import { log } from '../logging/logger';
import * as cache from './cache';
import * as rateLimit from './rate-limit';
import * as breaker from './circuit-breaker';
import * as cost from './cost';
import { resolveLocalModel, isLocalProvider } from './adapter';

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
}

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
  try {
    const response = await provider.complete(decision.model, messages, options);
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
        const response = await fb.complete(decision.fallback.model, messages, options);
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
