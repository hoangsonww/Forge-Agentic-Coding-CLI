/**
 * Circuit breaker tests. These are not intended to be exhaustive, but rather to verify the core state transitions and timing logic of the circuit breaker implementation. The tests assert that:
 *   After the configured number of failures, the circuit opens and canTry returns false.
 *   After the reset timeout elapses, the circuit transitions to half-open and allows a probe attempt.
 *   If the probe attempt succeeds, the circuit closes and canTry returns true again.
 *   If the probe attempt fails, the circuit re-opens and canTry returns false again.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  configure,
  canTry,
  reportSuccess,
  reportFailure,
  reset,
} from '../../src/models/circuit-breaker';

describe('circuit-breaker', () => {
  beforeEach(() => reset('p'));

  it('opens after N failures and refuses until reset elapses', () => {
    configure('p', { failureThreshold: 2, resetMs: 10_000 });
    expect(canTry('p')).toBe(true);
    reportFailure('p');
    reportFailure('p');
    expect(canTry('p')).toBe(false);
  });

  it('closes after a successful probe', () => {
    configure('p', { failureThreshold: 1, resetMs: 1 });
    reportFailure('p');
    // wait to transition to half-open
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(canTry('p')).toBe(true);
        reportSuccess('p');
        expect(canTry('p')).toBe(true);
        resolve();
      }, 5);
    });
  });
});
