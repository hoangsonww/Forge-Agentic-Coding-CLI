/**
 * Model Router Tests.
 *
 * We mock the provider registry and the downstream cache/rate-limit/
 * breaker/cost helpers to drive the pure routing logic: happy path,
 * offline-safe forcing, fallback when the preferred provider is
 * unavailable, and the terminal "no provider available" error.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelResponse } from '../../src/types';

const makeProvider = (name: string, available: boolean, responseContent = 'hi') => ({
  name,
  isAvailable: vi.fn(async () => available),
  complete: vi.fn(
    async (): Promise<ModelResponse> => ({
      content: responseContent,
      provider: name,
      model: 'mock-model',
      finishReason: 'stop',
      durationMs: 1,
      inputTokens: 1,
      outputTokens: 1,
    }),
  ),
});

let providers: ReturnType<typeof makeProvider>[] = [];

vi.mock('../../src/models/provider', () => ({
  getProvider: (name: string) => {
    const p = providers.find((x) => x.name === name);
    if (!p) throw new Error(`no provider ${name}`);
    return p;
  },
  listProviders: () => providers,
  firstAvailableProvider: async () => {
    for (const p of providers) if (await p.isAvailable()) return p;
    return null;
  },
}));

vi.mock('../../src/config/loader', () => ({
  loadGlobalConfig: () => ({
    provider: 'anthropic',
    anthropic: { model: 'claude-sonnet-4-6' },
    models: {
      fast: 'llama3.2:1b',
      code: 'qwen2.5-coder',
      planner: 'llama3.2:3b',
      balanced: 'llama3.2:3b',
    },
    permissions: { trust: { autoAllowAfter: 3 } },
  }),
}));

vi.mock('../../src/models/cache', () => ({
  lookup: () => null,
  store: () => undefined,
}));

vi.mock('../../src/models/rate-limit', () => ({
  acquire: async () => undefined,
}));

vi.mock('../../src/models/circuit-breaker', () => ({
  canTry: () => true,
  reportSuccess: () => undefined,
  reportFailure: () => undefined,
}));

vi.mock('../../src/models/cost', () => ({
  record: () => 0,
}));

vi.mock('../../src/models/adapter', () => ({
  resolveLocalModel: async (_p: unknown, _r: unknown, configured: string) => configured,
  isLocalProvider: (name: string) => name === 'ollama',
}));

import { resolveModel, callModel } from '../../src/models/router';
import { ForgeRuntimeError } from '../../src/types/errors';

describe('resolveModel', () => {
  beforeEach(() => {
    providers = [makeProvider('anthropic', true), makeProvider('ollama', true)];
  });

  it('routes to the preferred (anthropic) provider when available', async () => {
    const d = await resolveModel({ role: 'planner', mode: 'balanced' });
    expect(d.provider).toBe('anthropic');
    expect(d.model).toBe('claude-sonnet-4-6');
    expect(d.fallback?.provider).toBe('ollama');
  });

  it('forces ollama when mode=offline-safe', async () => {
    const d = await resolveModel({ role: 'planner', mode: 'offline-safe' });
    expect(d.provider).toBe('ollama');
  });

  it('falls back when the preferred provider is unavailable', async () => {
    providers = [makeProvider('anthropic', false), makeProvider('ollama', true)];
    const d = await resolveModel({ role: 'fast', mode: 'balanced' });
    expect(d.provider).toBe('ollama');
    expect(d.reason).toMatch(/fallback/);
  });

  it('raises when nothing is available', async () => {
    providers = [makeProvider('anthropic', false), makeProvider('ollama', false)];
    await expect(resolveModel({ role: 'fast', mode: 'balanced' })).rejects.toBeInstanceOf(
      ForgeRuntimeError,
    );
  });
});

describe('callModel', () => {
  beforeEach(() => {
    providers = [makeProvider('anthropic', true), makeProvider('ollama', true)];
  });

  it('returns a response and records zero cost for a happy path', async () => {
    const r = await callModel('planner', 'balanced', [{ role: 'user', content: 'hi' }]);
    expect(r.cached).toBe(false);
    expect(r.response.content).toBe('hi');
    expect(r.costUsd).toBe(0);
  });

  it('switches to fallback when primary complete() throws', async () => {
    providers = [makeProvider('anthropic', true), makeProvider('ollama', true)];
    providers[0].complete = vi.fn(async () => {
      throw new Error('rate limit');
    });
    const r = await callModel('planner', 'balanced', [{ role: 'user', content: 'hi' }]);
    expect(r.decision.reason).toMatch(/fallback after error/);
    expect(r.response.provider).toBe('ollama');
  });
});
