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
