/**
 * Abort Signals Tests (extra).
 *
 * The existing signals.test.ts covers the SIGINT behavior in principle;
 * this file pins the pure-state reset helper and the idempotency of
 * the installer.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  installSignalHandlers,
  shouldAbort,
  getAbortReason,
  resetAbort,
} from '../../src/core/signals';

describe('signals', () => {
  beforeEach(() => resetAbort());

  it('shouldAbort starts false', () => {
    expect(shouldAbort()).toBe(false);
    expect(getAbortReason()).toBe('');
  });

  it('installSignalHandlers is idempotent', () => {
    installSignalHandlers();
    installSignalHandlers();
    // Both calls should succeed without crashing; internal state is a boolean flag.
    expect(shouldAbort()).toBe(false);
  });
});
