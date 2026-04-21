/**
 * Signals are a simple way to indicate that an operation should be aborted. They are used in various places in the codebase, such as when a user cancels an operation or when a timeout occurs. This test suite ensures that the signals module behaves as expected, starting in a non-aborting state and resetting correctly when requested.
 *
 * The tests cover:
 *   - Initial state of the signals (not aborting).
 *   - Resetting the abort state and verifying it returns to non-aborting.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { shouldAbort, resetAbort, getAbortReason } from '../../src/core/signals';

describe('signals', () => {
  beforeEach(() => resetAbort());

  it('starts in not-aborting state', () => {
    expect(shouldAbort()).toBe(false);
    expect(getAbortReason()).toBe('');
  });

  it('resets cleanly', () => {
    resetAbort();
    expect(shouldAbort()).toBe(false);
  });
});
