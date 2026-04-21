/**
 * Risk Helper Tests.
 *
 * Exercises the pure risk-scoring utilities used by the permission
 * manager and the trust calibration path: riskRank ordering, maxRisk,
 * shouldAlwaysAsk's high-risk-always rule, and the describeSideEffect
 * label table.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import {
  riskRank,
  maxRisk,
  mergeRisk,
  requiresExplicitApproval,
  shouldAlwaysAsk,
  describeSideEffect,
  summarizeTool,
} from '../../src/permissions/risk';

describe('riskRank', () => {
  it('orders from low to critical', () => {
    expect(riskRank('low')).toBeLessThan(riskRank('medium'));
    expect(riskRank('medium')).toBeLessThan(riskRank('high'));
    expect(riskRank('high')).toBeLessThan(riskRank('critical'));
  });
});

describe('maxRisk', () => {
  it('returns the higher of two risks', () => {
    expect(maxRisk('low', 'high')).toBe('high');
    expect(maxRisk('critical', 'low')).toBe('critical');
    expect(maxRisk('medium', 'medium')).toBe('medium');
  });
});

describe('mergeRisk', () => {
  it('delegates to maxRisk', () => {
    expect(mergeRisk('low', 'medium')).toBe('medium');
  });
});

describe('requiresExplicitApproval', () => {
  it('requires approval for high/critical risk', () => {
    const schema = {
      name: 'x',
      description: '',
      sideEffect: 'readonly' as const,
      risk: 'high' as const,
      permissionDefault: 'ask' as const,
      sensitivity: 'low' as const,
      timeoutMs: 1000,
      inputSchema: {},
    };
    expect(requiresExplicitApproval(schema)).toBe(true);
  });

  it('requires approval for execute side-effects regardless of risk', () => {
    const schema = {
      name: 'x',
      description: '',
      sideEffect: 'execute' as const,
      risk: 'low' as const,
      permissionDefault: 'ask' as const,
      sensitivity: 'low' as const,
      timeoutMs: 1000,
      inputSchema: {},
    };
    expect(requiresExplicitApproval(schema)).toBe(true);
  });

  it('allows low-risk readonly tools without explicit approval', () => {
    const schema = {
      name: 'x',
      description: '',
      sideEffect: 'readonly' as const,
      risk: 'low' as const,
      permissionDefault: 'allow' as const,
      sensitivity: 'low' as const,
      timeoutMs: 1000,
      inputSchema: {},
    };
    expect(requiresExplicitApproval(schema)).toBe(false);
  });
});

describe('shouldAlwaysAsk', () => {
  it('always asks for critical/high regardless of skip', () => {
    expect(shouldAlwaysAsk({ risk: 'critical', sideEffect: 'readonly' }, true)).toBe(true);
    expect(shouldAlwaysAsk({ risk: 'high', sideEffect: 'readonly' }, true)).toBe(true);
  });

  it('always asks for execute/network regardless of skip', () => {
    expect(shouldAlwaysAsk({ risk: 'low', sideEffect: 'execute' }, true)).toBe(true);
    expect(shouldAlwaysAsk({ risk: 'low', sideEffect: 'network' }, true)).toBe(true);
  });

  it('respects skipRoutinePrompts for routine actions', () => {
    expect(shouldAlwaysAsk({ risk: 'low', sideEffect: 'readonly' }, true)).toBe(false);
    expect(shouldAlwaysAsk({ risk: 'low', sideEffect: 'readonly' }, false)).toBe(true);
  });
});

describe('describeSideEffect', () => {
  it('has a human label for every side effect', () => {
    expect(describeSideEffect('pure')).toBe('no side effect');
    expect(describeSideEffect('readonly')).toBe('reads only');
    expect(describeSideEffect('write')).toBe('writes files');
    expect(describeSideEffect('network')).toBe('makes network calls');
    expect(describeSideEffect('execute')).toBe('executes shell commands');
  });
});

describe('summarizeTool', () => {
  it('formats a tool summary with risk/side-effect badge', () => {
    const schema = {
      name: 'read_file',
      description: 'reads files',
      sideEffect: 'readonly' as const,
      risk: 'low' as const,
      permissionDefault: 'allow' as const,
      sensitivity: 'low' as const,
      timeoutMs: 1000,
      inputSchema: {},
    };
    const tool = { schema, execute: async () => ({ success: true, durationMs: 0 }) };
    expect(summarizeTool(tool as never)).toBe('read_file [low/readonly]: reads files');
  });
});
