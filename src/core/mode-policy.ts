/**
 * Mode policy: per-mode runtime caps.
 *
 * These caps are read by the loop/executor at runtime (not just by the model
 * router). Keeping them in one table makes it obvious which knobs each mode
 * tightens and prevents a "fast" task from racking up ten executor turns.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { Mode } from '../types';

export interface ModePolicy {
  /**
   * Max tool-use turns inside a single executor step. Each turn is one
   * model call that may produce tool actions. `0` falls back to single-shot
   * (the legacy behavior); anything >1 enables iterative tool-use.
   */
  maxExecutorTurns: number;
  /**
   * When a step wrote files, run the project's validation gate and feed
   * failures back into the executor loop for up to N additional turns. `0`
   * disables the gate (e.g. `plan` or `fast`).
   */
  maxValidationRetries: number;
  /**
   * Allow file-mutating tools at all? `audit` and `offline-safe` stay
   * read-only even if the plan contains writes.
   */
  allowMutations: boolean;
  /**
   * Upper risk bound for steps this mode will run without explicit approval.
   */
  maxAutoRisk: 'low' | 'medium' | 'high' | 'critical';
}

const TABLE: Record<Mode, ModePolicy> = {
  fast: {
    maxExecutorTurns: 2,
    maxValidationRetries: 0,
    allowMutations: true,
    maxAutoRisk: 'low',
  },
  balanced: {
    maxExecutorTurns: 4,
    maxValidationRetries: 1,
    allowMutations: true,
    maxAutoRisk: 'medium',
  },
  heavy: {
    maxExecutorTurns: 8,
    maxValidationRetries: 2,
    allowMutations: true,
    maxAutoRisk: 'high',
  },
  plan: {
    maxExecutorTurns: 0,
    maxValidationRetries: 0,
    allowMutations: false,
    maxAutoRisk: 'low',
  },
  execute: {
    maxExecutorTurns: 4,
    maxValidationRetries: 1,
    allowMutations: true,
    maxAutoRisk: 'medium',
  },
  audit: {
    maxExecutorTurns: 3,
    maxValidationRetries: 0,
    allowMutations: false,
    maxAutoRisk: 'low',
  },
  debug: {
    maxExecutorTurns: 6,
    maxValidationRetries: 2,
    allowMutations: true,
    maxAutoRisk: 'medium',
  },
  architect: {
    maxExecutorTurns: 3,
    maxValidationRetries: 1,
    allowMutations: true,
    maxAutoRisk: 'medium',
  },
  'offline-safe': {
    maxExecutorTurns: 3,
    maxValidationRetries: 1,
    allowMutations: true,
    maxAutoRisk: 'medium',
  },
};

export const modePolicy = (mode: Mode): ModePolicy => TABLE[mode] ?? TABLE.balanced;
