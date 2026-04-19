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
