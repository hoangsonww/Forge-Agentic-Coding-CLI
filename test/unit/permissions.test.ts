/**
 * Permissions risk helper tests for shouldAlwaysAsk, requiresExplicitApproval, and mergeRisk functions.
 *
 * These tests verify that the risk assessment logic correctly determines when to prompt for user approval based on the tool's risk level and side effects. The tests cover:
 *   High-risk tools always requiring user confirmation.
 *   Low-risk, read-only tools being allowed without confirmation.
 *   Tools with execute side effects always requiring explicit approval regardless of risk level.
 *   The mergeRisk function correctly returning the higher of two risk levels.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import { shouldAlwaysAsk, requiresExplicitApproval, mergeRisk } from '../../src/permissions/risk';

describe('risk helpers', () => {
  it('high-risk tools always ask', () => {
    expect(shouldAlwaysAsk({ risk: 'high', sideEffect: 'execute' }, true)).toBe(true);
  });

  it('low-risk readonly tools are routine', () => {
    expect(shouldAlwaysAsk({ risk: 'low', sideEffect: 'readonly' }, true)).toBe(false);
  });

  it('execute side-effect always requires approval', () => {
    expect(
      requiresExplicitApproval({
        name: 'x',
        description: '',
        sideEffect: 'execute',
        risk: 'low',
        permissionDefault: 'allow',
        sensitivity: 'low',
        timeoutMs: 0,
        inputSchema: {},
      }),
    ).toBe(true);
  });

  it('merges risks by max', () => {
    expect(mergeRisk('low', 'high')).toBe('high');
    expect(mergeRisk('critical', 'medium')).toBe('critical');
  });
});
