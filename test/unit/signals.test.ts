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
