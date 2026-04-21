/**
 * State machine tests for task lifecycle transitions. These ensure that the defined legal transitions between task states are correctly enforced by the isLegalTransition function. The tests cover:
 *   - Valid transitions like draft → planned and running → verifying.
 *   - Resetting completed, failed, and cancelled tasks back to draft for operator intervention.
 *   - Rejection of illegal transitions that skip lifecycle stages or move backwards inappropriately.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import { isLegalTransition } from '../../src/persistence/tasks';

describe('task state machine', () => {
  it('draft → planned allowed', () => {
    expect(isLegalTransition('draft', 'planned')).toBe(true);
  });
  it('running → verifying allowed', () => {
    expect(isLegalTransition('running', 'verifying')).toBe(true);
  });
  it('completed can be reset to draft (operator resume)', () => {
    // `completed → draft` is the single legal move; it lets the agentic
    // loop re-enter at the top (draft → planned → …).
    expect(isLegalTransition('completed', 'draft')).toBe(true);
    // Skipping straight into mid-lifecycle states remains illegal.
    expect(isLegalTransition('completed', 'scheduled')).toBe(false);
    expect(isLegalTransition('completed', 'running')).toBe(false);
    expect(isLegalTransition('completed', 'cancelled')).toBe(false);
  });
  it('failed can be reset to draft (operator retry)', () => {
    expect(isLegalTransition('failed', 'draft')).toBe(true);
  });
  it('cancelled can be reset to draft (operator resume)', () => {
    expect(isLegalTransition('cancelled', 'draft')).toBe(true);
    expect(isLegalTransition('cancelled', 'running')).toBe(false);
  });
  it('illegal transitions are rejected', () => {
    expect(isLegalTransition('draft', 'running')).toBe(false);
  });
});
