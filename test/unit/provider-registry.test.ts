/**
 * Provider Registry Tests.
 *
 * Unit-tests the small in-memory registry utilities: register/get/list
 * and firstAvailableProvider's short-circuit. A stand-in provider
 * implementing the ModelProvider interface drives each branch.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerProvider,
  getProvider,
  listProviders,
  firstAvailableProvider,
} from '../../src/models/provider';
import type { ModelProvider } from '../../src/types';
import { ForgeRuntimeError } from '../../src/types/errors';

// Re-initialize the registry for each test. The registry is a module-
// scope Map, so we clear it by re-registering over previous keys.
const fakeProvider = (name: string, available: boolean): ModelProvider => ({
  name,
  isAvailable: vi.fn(async () => available),
  listModels: vi.fn(async () => []),
  complete: vi.fn(async () => ({
    content: '',
    provider: name,
    model: 'm',
    finishReason: 'stop' as const,
    durationMs: 0,
  })),
});

describe('provider registry', () => {
  beforeEach(() => {
    for (const p of listProviders()) {
      // Replace with fresh unavailable stubs so subsequent firstAvailableProvider calls
      // aren't polluted by earlier tests.
      registerProvider(fakeProvider(p.name, false));
    }
  });

  it('registers and retrieves a provider by name', () => {
    const p = fakeProvider('mock-a', true);
    registerProvider(p);
    const got = getProvider('mock-a');
    expect(got.name).toBe('mock-a');
  });

  it('throws ForgeRuntimeError for an unknown provider', () => {
    expect(() => getProvider('does-not-exist')).toThrow(ForgeRuntimeError);
  });

  it('listProviders returns every registered one', () => {
    registerProvider(fakeProvider('mock-b', true));
    const names = listProviders().map((p) => p.name);
    expect(names).toContain('mock-b');
  });

  it('firstAvailableProvider returns the first provider that reports available', async () => {
    registerProvider(fakeProvider('mock-x', false));
    registerProvider(fakeProvider('mock-y', true));
    const p = await firstAvailableProvider();
    expect(p?.name).toBe('mock-y');
  });

  it('firstAvailableProvider returns null when none are up', async () => {
    registerProvider(fakeProvider('mock-z', false));
    const p = await firstAvailableProvider();
    expect(p).toBeNull();
  });

  it('firstAvailableProvider ignores providers whose probe throws', async () => {
    const boom = fakeProvider('boom', false);
    boom.isAvailable = vi.fn(async () => {
      throw new Error('network');
    });
    registerProvider(boom);
    registerProvider(fakeProvider('up', true));
    const p = await firstAvailableProvider();
    expect(p?.name).toBe('up');
  });
});
