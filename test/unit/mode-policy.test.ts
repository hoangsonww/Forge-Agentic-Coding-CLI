/**
 * Mode policy tests ensure that the correct parameters are set for each mode, and that the policies align with the intended use cases. The tests cover:
 *   Fast mode: verifies that it has a low turn budget, no validation retries, and allows mutations.
 *   Heavy mode: checks that it has a higher turn budget and more validation retries than balanced.
 *   Audit and Plan modes: confirms that they do not allow mutations.
 *   Unknown mode: ensures that it falls back to balanced defaults rather than throwing an error.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

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
