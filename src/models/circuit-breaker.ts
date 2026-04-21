/**
 * Minimal circuit breaker per provider. Opens after `failureThreshold`
 * consecutive failures, waits `resetMs` before allowing a single probe, and
 * closes on a successful probe. Half-open state is tracked but the public
 * surface only distinguishes "can try" from "blocked".
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

export type BreakerState = 'closed' | 'open' | 'half_open';

interface State {
  state: BreakerState;
  failures: number;
  opened: number;
  lastFailure: number;
  cfg: BreakerConfig;
}

export interface BreakerConfig {
  failureThreshold: number;
  resetMs: number;
}

const DEFAULTS: BreakerConfig = { failureThreshold: 5, resetMs: 60_000 };

const state = new Map<string, State>();

const get = (provider: string): State => {
  let s = state.get(provider);
  if (!s) {
    s = { state: 'closed', failures: 0, opened: 0, lastFailure: 0, cfg: DEFAULTS };
    state.set(provider, s);
  }
  return s;
};

export const configure = (provider: string, cfg: Partial<BreakerConfig>): void => {
  const s = get(provider);
  s.cfg = { ...s.cfg, ...cfg };
};

export const canTry = (provider: string): boolean => {
  const s = get(provider);
  if (s.state === 'closed') return true;
  if (s.state === 'open') {
    if (Date.now() - s.opened >= s.cfg.resetMs) {
      s.state = 'half_open';
      return true;
    }
    return false;
  }
  return true; // half_open: allow the probe
};

export const reportSuccess = (provider: string): void => {
  const s = get(provider);
  s.failures = 0;
  s.state = 'closed';
};

export const reportFailure = (provider: string): void => {
  const s = get(provider);
  s.failures++;
  s.lastFailure = Date.now();
  if (s.failures >= s.cfg.failureThreshold) {
    s.state = 'open';
    s.opened = Date.now();
  }
};

export const status = (): Record<string, BreakerState> => {
  const out: Record<string, BreakerState> = {};
  for (const [k, v] of state) out[k] = v.state;
  return out;
};

export const reset = (provider?: string): void => {
  if (provider) state.delete(provider);
  else state.clear();
};
