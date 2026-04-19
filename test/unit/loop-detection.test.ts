import { describe, it, expect } from 'vitest';
import { LoopDetector } from '../../src/core/loop-detection';

describe('LoopDetector', () => {
  it('detects repeated identical failures on one step', () => {
    const d = new LoopDetector(6, 3);
    for (let i = 0; i < 3; i++) {
      d.record({ stepId: 'a', success: false, errorClass: 'tool_error', timestamp: Date.now() });
    }
    const state = d.isLooping();
    expect(state.looping).toBe(true);
    expect(state.reason).toContain('a');
  });

  it('does not flag when errors differ', () => {
    const d = new LoopDetector();
    d.record({ stepId: 'a', success: false, errorClass: 'tool_error', timestamp: Date.now() });
    d.record({ stepId: 'a', success: false, errorClass: 'timeout', timestamp: Date.now() });
    d.record({ stepId: 'a', success: false, errorClass: 'tool_error', timestamp: Date.now() });
    expect(d.isLooping().looping).toBe(false);
  });

  it('does not flag when some succeed', () => {
    const d = new LoopDetector();
    d.record({ stepId: 'a', success: true, timestamp: Date.now() });
    d.record({ stepId: 'a', success: false, errorClass: 'tool_error', timestamp: Date.now() });
    d.record({ stepId: 'a', success: false, errorClass: 'tool_error', timestamp: Date.now() });
    expect(d.isLooping().looping).toBe(false);
  });
});
