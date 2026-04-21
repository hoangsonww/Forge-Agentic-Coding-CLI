/**
 * Adapter tests. These are mostly focused on the resolveLocalModel function, which is the core of the adapter's "local provider" logic. The tests verify that:
 *   - Local providers are correctly identified by name.
 *   - When resolving a model for a local provider, if the configured model is installed, it is returned unchanged.
 *   - If the configured model is missing, the best-fit installed model is substituted based on role and token count.
 *   - The substitution is cached so that subsequent calls with the same missing model do not trigger re-discovery.
 *   - For hosted providers, the configured model is always returned unchanged (no substitution).
 *   - If discovery fails (e.g. listModels throws), resolveLocalModel falls back to returning the configured model.
 *   - If listModels returns an empty list (user has no models), resolveLocalModel also falls back to the configured model.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveLocalModel,
  isLocalProvider,
  _resetAdapterForTest,
  snapshotMapping,
} from '../../src/models/adapter';
import { ModelProvider, ModelRole } from '../../src/types';

const stubProvider = (
  name: string,
  installed: string[],
  opts: { available?: boolean; throwOnList?: boolean } = {},
): ModelProvider => ({
  name,
  async isAvailable() {
    return opts.available ?? true;
  },
  async listModels() {
    if (opts.throwOnList) throw new Error('boom');
    return installed.map((id) => ({
      provider: name,
      id,
      class: 'mid' as const,
      contextTokens: 8192,
      roles: ['executor' as ModelRole],
    }));
  },
  async complete() {
    throw new Error('not used in tests');
  },
});

beforeEach(() => {
  _resetAdapterForTest();
});

describe('adapter — provider kind', () => {
  it('recognises the local runtimes', () => {
    expect(isLocalProvider('ollama')).toBe(true);
    expect(isLocalProvider('llamacpp')).toBe(true);
    expect(isLocalProvider('vllm')).toBe(true);
    expect(isLocalProvider('lmstudio')).toBe(true);
  });

  it('does not treat hosted providers as local', () => {
    expect(isLocalProvider('anthropic')).toBe(false);
    expect(isLocalProvider('openai')).toBe(false);
  });
});

describe('adapter — resolveLocalModel', () => {
  it('returns the configured model unchanged when it is installed', async () => {
    const p = stubProvider('ollama', ['llama3:8b', 'phi3:mini']);
    const out = await resolveLocalModel(p, 'executor', 'llama3:8b');
    expect(out).toBe('llama3:8b');
  });

  it('substitutes the best-fit model when the configured one is missing', async () => {
    const p = stubProvider('ollama', ['deepseek-coder:6.7b', 'phi3:mini', 'llama3:8b']);
    const out = await resolveLocalModel(p, 'executor', 'does-not-exist:99b');
    // executor → prefer the code specialist.
    expect(out).toBe('deepseek-coder:6.7b');
  });

  it('caches the substitution so we do not re-pick on subsequent calls', async () => {
    const p = stubProvider('ollama', ['llama3:8b', 'phi3:mini']);
    await resolveLocalModel(p, 'fast', 'missing');
    const snap = snapshotMapping('ollama');
    expect(snap).not.toBeNull();
    expect(snap!.perRole.get('fast')).toBe('phi3:mini');
  });

  it('passes through unchanged for hosted providers', async () => {
    const p = stubProvider('anthropic', []);
    const out = await resolveLocalModel(p, 'planner', 'claude-opus-4-7');
    expect(out).toBe('claude-opus-4-7');
  });

  it('falls back to the configured model when discovery fails', async () => {
    const p = stubProvider('ollama', [], { throwOnList: true });
    const out = await resolveLocalModel(p, 'planner', 'llama3:70b');
    expect(out).toBe('llama3:70b');
  });

  it('falls back when listModels returns an empty list (user has no models)', async () => {
    const p = stubProvider('ollama', []);
    const out = await resolveLocalModel(p, 'fast', 'phi3:mini');
    expect(out).toBe('phi3:mini'); // downstream error will explain "model not found"
  });
});
