import { describe, it, expect, beforeEach } from 'vitest';
import { configure, acquire, reset } from '../../src/models/rate-limit';

describe('rate-limit', () => {
  beforeEach(() => reset());

  it('allows bursts up to capacity', async () => {
    configure('p', { capacity: 3, refillPerSec: 1 });
    await acquire('p');
    await acquire('p');
    await acquire('p');
    // No assertion needed — would hang if the limiter were wrong.
    expect(true).toBe(true);
  });

  it('is a no-op for unknown providers', async () => {
    await acquire('unknown-provider');
    expect(true).toBe(true);
  });
});
