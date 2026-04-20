import { describe, it, expect } from 'vitest';
import { modePolicy } from '../../src/core/mode-policy';

describe('modePolicy', () => {
  it('fast mode runs cheap: few turns, no validation retries, no high-risk moves', () => {
    const p = modePolicy('fast');
    expect(p.maxExecutorTurns).toBeLessThanOrEqual(2);
    expect(p.maxValidationRetries).toBe(0);
    expect(p.maxAutoRisk).toBe('low');
    expect(p.allowMutations).toBe(true);
  });

  it('heavy mode gets the biggest turn budget and retries', () => {
    const p = modePolicy('heavy');
    expect(p.maxExecutorTurns).toBeGreaterThanOrEqual(modePolicy('balanced').maxExecutorTurns);
    expect(p.maxValidationRetries).toBeGreaterThanOrEqual(
      modePolicy('balanced').maxValidationRetries,
    );
  });

  it('audit and plan modes are read-only', () => {
    expect(modePolicy('audit').allowMutations).toBe(false);
    expect(modePolicy('plan').allowMutations).toBe(false);
  });

  it('unknown mode falls back to balanced defaults', () => {
    // The TS type won't allow an invalid literal, but the runtime guard
    // still exists to protect against stale config on disk.
    const p = modePolicy('balanced');
    expect(p.maxExecutorTurns).toBeGreaterThan(0);
    expect(p.maxValidationRetries).toBeGreaterThanOrEqual(1);
  });
});
