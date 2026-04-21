/**
 * Per-provider token-bucket rate limiter. Keeps the model router from
 * hammering a provider past its documented rate limit, especially in the
 * retry loop where backoff + retry can pile up fast.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

export interface BucketConfig {
  capacity: number;
  refillPerSec: number;
}

interface BucketState {
  tokens: number;
  lastRefill: number;
  cfg: BucketConfig;
}

const buckets = new Map<string, BucketState>();

export const configure = (provider: string, cfg: BucketConfig): void => {
  buckets.set(provider, { tokens: cfg.capacity, lastRefill: Date.now(), cfg });
};

const refill = (state: BucketState): void => {
  const now = Date.now();
  const elapsed = (now - state.lastRefill) / 1000;
  state.tokens = Math.min(state.cfg.capacity, state.tokens + elapsed * state.cfg.refillPerSec);
  state.lastRefill = now;
};

export const acquire = async (provider: string): Promise<void> => {
  const state = buckets.get(provider);
  if (!state) return; // no limit configured
  refill(state);
  if (state.tokens >= 1) {
    state.tokens -= 1;
    return;
  }
  const waitMs = Math.ceil(((1 - state.tokens) / state.cfg.refillPerSec) * 1000);
  await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 30_000)));
  refill(state);
  state.tokens = Math.max(0, state.tokens - 1);
};

export const reset = (provider?: string): void => {
  if (provider) buckets.delete(provider);
  else buckets.clear();
};
