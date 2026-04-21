/**
 * Provider registry tests. These are mostly to ensure that all providers are registered and that the registry is idempotent.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { listProviders } from '../../src/models/provider';
import { initProviders } from '../../src/models/registry';

describe('provider registry', () => {
  beforeEach(() => {
    initProviders();
  });

  it('registers every supported provider', () => {
    const names = listProviders().map((p) => p.name);
    for (const expected of ['ollama', 'anthropic', 'openai', 'llamacpp', 'vllm', 'lmstudio']) {
      expect(names).toContain(expected);
    }
  });

  it('initProviders is idempotent', () => {
    const beforeCount = listProviders().length;
    initProviders();
    initProviders();
    expect(listProviders().length).toBe(beforeCount);
  });
});
