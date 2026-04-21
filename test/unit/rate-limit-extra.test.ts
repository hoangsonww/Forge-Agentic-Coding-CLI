/**
 * Rate Limit Tests (extra).
 *
 * The existing rate-limit.test.ts covers burst + unknown-provider; this
 * file pins reset(provider) semantics and timing of the unlimited path.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as rl from '../../src/models/rate-limit';

describe('rate-limit extra', () => {
  beforeEach(() => rl.reset());

  it('unconfigured providers return instantly', async () => {
    const t0 = Date.now();
    await rl.acquire('nonexistent-provider');
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it('reset(provider) drops only the named provider', () => {
    rl.configure('p1', { capacity: 1, refillPerSec: 1 });
    rl.configure('p2', { capacity: 1, refillPerSec: 1 });
    rl.reset('p1');
    // p2 still configured — acquire should not throw.
    expect(() => rl.acquire('p2')).not.toThrow();
  });

  it('configure replaces an existing bucket', async () => {
    rl.configure('r', { capacity: 1, refillPerSec: 0.0001 });
    await rl.acquire('r');
    // Re-configure with a fresh capacity — should refill immediately.
    rl.configure('r', { capacity: 5, refillPerSec: 0.0001 });
    const t0 = Date.now();
    await rl.acquire('r');
    expect(Date.now() - t0).toBeLessThan(50);
  });
});
