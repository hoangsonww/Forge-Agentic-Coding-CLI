import { describe, it, expect } from 'vitest';
import { isLegalTransition } from '../../src/persistence/tasks';

describe('task state machine', () => {
  it('draft → planned allowed', () => {
    expect(isLegalTransition('draft', 'planned')).toBe(true);
  });
  it('running → verifying allowed', () => {
    expect(isLegalTransition('running', 'verifying')).toBe(true);
  });
  it('completed can only be rescheduled (operator resume)', () => {
    // `completed → scheduled` is the single legal move (for `forge resume`).
    expect(isLegalTransition('completed', 'scheduled')).toBe(true);
    // Everything else from a terminal state remains illegal.
    expect(isLegalTransition('completed', 'running')).toBe(false);
    expect(isLegalTransition('completed', 'cancelled')).toBe(false);
  });
  it('failed can be rescheduled (operator retry)', () => {
    expect(isLegalTransition('failed', 'scheduled')).toBe(true);
  });
  it('cancelled can be rescheduled (operator resume)', () => {
    expect(isLegalTransition('cancelled', 'scheduled')).toBe(true);
    expect(isLegalTransition('cancelled', 'running')).toBe(false);
  });
  it('illegal transitions are rejected', () => {
    expect(isLegalTransition('draft', 'running')).toBe(false);
  });
});
