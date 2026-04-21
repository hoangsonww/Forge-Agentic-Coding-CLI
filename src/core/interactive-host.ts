import { AsyncLocalStorage } from 'async_hooks';
import type { ForgeEvent, PermissionDecision, PermissionRequest, Plan } from '../types';
import type { PermissionFlags } from '../permissions/manager';

/**
 * InteractiveHost lets the core loop surface decisions to whatever interface
 * is driving it. The CLI binds a terminal-prompt host; the UI server binds
 * one that routes through WebSocket. Each running task gets its own host
 * scope via AsyncLocalStorage so concurrent tasks from different surfaces
 * don't collide.
 *
 * A null host means "use the default CLI prompt" — keeps existing scripts
 * and direct `forge run` invocations unchanged.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
export interface InteractiveHost {
  /** Returns 'approve' (run the plan), 'cancel' (stop the task), 'edit' (open an editor — only CLI implements this). */
  confirmPlan(plan: Plan, taskId: string): Promise<'approve' | 'cancel' | 'edit'>;

  /** Decide whether a tool action is permitted. Honor flags (allow-files, strict, non-interactive, etc.). */
  requestPermission(req: PermissionRequest, flags: PermissionFlags): Promise<PermissionDecision>;

  /** Free-form question to the operator. Return empty string when the user skips. */
  askUser(
    taskId: string,
    question: string,
    choices?: string[],
    defaultValue?: string,
  ): Promise<string>;

  /** Side-channel event emission (streamed to whatever surface subscribed). */
  emit?(taskId: string, event: ForgeEvent): void;

  /** Unique label used by logs/metrics. */
  readonly name: string;
}

const storage = new AsyncLocalStorage<InteractiveHost>();
let fallback: InteractiveHost | null = null;

export const withHost = async <T>(host: InteractiveHost, fn: () => Promise<T>): Promise<T> => {
  return storage.run(host, fn);
};

export const setDefaultHost = (host: InteractiveHost | null): void => {
  fallback = host;
};

export const currentHost = (): InteractiveHost | null => {
  return storage.getStore() ?? fallback;
};
