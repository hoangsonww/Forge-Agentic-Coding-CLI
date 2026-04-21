/**
 * Loop detection tests. We want to detect when the same step is failing repeatedly with the same error, as this is a strong signal of a loop. We want to avoid false positives, so we require a certain number of consecutive failures with the same error before flagging a loop. The tests assert that:
 *   - When the same step fails with the same error class for the configured number of times, isLooping returns true with the appropriate reason.
 *   - If the errors differ (either different error classes or some successes in between), isLooping does not flag a loop.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

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
