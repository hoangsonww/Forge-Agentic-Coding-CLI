/**
 * ForgeRuntimeError Tests.
 *
 * Pins the JSON wire shape (used by tools, persistence, and the UI) so
 * any future change is deliberate.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import { ForgeRuntimeError } from '../../src/types/errors';

describe('ForgeRuntimeError', () => {
  it('toJSON returns a stable shape', () => {
    const err = new ForgeRuntimeError({
      class: 'model_error',
      message: 'rate limited',
      retryable: true,
      recoveryHint: 'wait 30s',
    });
    const json = err.toJSON();
    expect(json).toEqual({
      class: 'model_error',
      message: 'rate limited',
      retryable: true,
      recoveryHint: 'wait 30s',
    });
  });

  it('omits recoveryHint from JSON when not provided', () => {
    const err = new ForgeRuntimeError({
      class: 'tool_error',
      message: 'fail',
      retryable: false,
    });
    const json = err.toJSON();
    expect(json.recoveryHint).toBeUndefined();
  });

  it('instanceof detection works through the prototype chain', () => {
    const err = new ForgeRuntimeError({ class: 'user_input', message: 'x', retryable: false });
    expect(err instanceof ForgeRuntimeError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('carries the original cause when provided', () => {
    const cause = new Error('underlying');
    const err = new ForgeRuntimeError({
      class: 'tool_error',
      message: 'wrapped',
      retryable: true,
      cause,
    });
    // cause may be on the Error via ES2022 semantics or as a member.
    const causeVal = (err as unknown as { cause?: unknown }).cause;
    expect(causeVal).toBe(cause);
  });
});
