/**
 * UI-driven task runner.
 *
 * A task started from the dashboard runs in this process under a UI-scoped
 * interactive host. Events and prompts are buffered and dispatched to
 * subscribed WebSocket clients, and clients post responses back to resolve
 * plan approvals, permission requests, and `ask_user` tool calls.
 *
 * Design notes:
 *   - Each task gets its own AsyncLocalStorage host via `withHost`.
 *   - Prompts live in `pending` keyed by a short id; WebSocket clients echo
 *     the id when they answer, and we resolve the promise.
 *   - Events that arrive before a WS connects are held in a ring buffer so
 *     late subscribers catch up.
 *   - Cancelling a task sets `shouldAbort`; the loop checks it between steps.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import type { WebSocket } from 'ws';
import { newTaskId } from '../logging/trace';
import { InteractiveHost, withHost } from '../core/interactive-host';
import { ForgeEvent, PermissionDecision, PermissionRequest, Plan } from '../types';
import { PermissionFlags } from '../permissions/manager';
import { orchestrateRun } from '../core/orchestrator';
import { Mode } from '../types';
import { log } from '../logging/logger';
import { redact } from '../security/redact';
import { eventBus, ModelDeltaEvent } from '../persistence/events';

type PromptType = 'plan_approval' | 'plan_edit' | 'permission' | 'user_input';

interface Pending {
  id: string;
  type: PromptType;
  taskId: string;
  payload: unknown;
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  createdAt: number;
}

interface ActiveTask {
  taskId: string;
  ringBuffer: Array<Record<string, unknown>>;
  // Replay buffer for model deltas. The WS subscriber for a UI task
  // typically connects ~50–200ms *after* startUiTask returns (round-trip
  // of the POST + WS handshake), which is plenty of time for a local
  // Ollama stream to have already emitted tokens. Without replay those
  // tokens go to an empty subscriber set and the user sees no live
  // streaming at all — only the final `task.result` frame, which makes
  // the UI feel batch rather than streaming.
  deltaBuffer: Array<Record<string, unknown>>;
  subscribers: Set<WebSocket>;
  abortRequested: boolean;
  startedAt: number;
  prompt: string;
  mode: Mode;
  status: 'running' | 'awaiting' | 'done' | 'failed' | 'cancelled';
  resultPromise: Promise<unknown>;
}

const RING_MAX = 500;
// Higher cap for deltas because a single 2k-token answer produces that
// many entries; 4000 comfortably covers a full planner/narrator response
// plus some head-room before we start shifting off the front.
const DELTA_MAX = 4000;

const pending = new Map<string, Pending>();
const active = new Map<string, ActiveTask>();

const newId = (): string => crypto.randomBytes(6).toString('hex');

const broadcast = (taskId: string, payload: Record<string, unknown>): void => {
  const task = active.get(taskId);
  if (!task) return;
  const clean = redact(payload) as Record<string, unknown>;
  const wire = JSON.stringify({ taskId, ...clean });
  task.ringBuffer.push(clean);
  if (task.ringBuffer.length > RING_MAX) task.ringBuffer.shift();
  for (const ws of task.subscribers) {
    try {
      ws.send(wire);
    } catch (err) {
      log.debug('ws send failed', { err: String(err) });
    }
  }
};

// Streaming deltas. We kept these in a separate replay buffer (distinct
// from the event ring buffer) so late-subscribing WS clients — which is
// the common case on the UI, since the browser opens the socket only
// after the POST response — still see the whole stream reflow in the
// conversation view. Without this the first tokens fire before any
// subscriber exists and the user perceives zero streaming.
const broadcastDelta = (taskId: string, payload: Record<string, unknown>): void => {
  const task = active.get(taskId);
  if (!task) return;
  const frame = { kind: 'model.delta', ...payload };
  task.deltaBuffer.push(frame);
  if (task.deltaBuffer.length > DELTA_MAX) task.deltaBuffer.shift();
  const wire = JSON.stringify({ taskId, ...frame });
  for (const ws of task.subscribers) {
    try {
      ws.send(wire);
    } catch {
      // socket teardown races are routine during streaming; ignore
    }
  }
};

// Bridge in-process events/deltas onto the per-task WebSocket channel.
// One subscription per module, cleaned up only at process exit. Ignore events
// that didn't originate from a task this runner knows about so we don't leak
// events from stray CLI invocations into the UI.
eventBus.on('event', (e: ForgeEvent) => {
  if (!e.taskId || !active.has(e.taskId)) return;
  // Shape matches the `kind: 'event'` handler in src/ui/public/app.js — keep
  // those two in sync.
  broadcast(e.taskId, { kind: 'event', event: e });
});
eventBus.on('delta', (d: ModelDeltaEvent) => {
  if (!d.taskId || !active.has(d.taskId)) return;
  broadcastDelta(d.taskId, {
    text: d.text,
    done: Boolean(d.done),
    model: d.model,
    provider: d.provider,
    role: d.role,
  });
});

const makeHost = (taskId: string): InteractiveHost => ({
  name: 'ui',
  async confirmPlan(plan: Plan): Promise<'approve' | 'cancel' | 'edit'> {
    const t = active.get(taskId);
    if (t) t.status = 'awaiting';
    return new Promise((resolve, reject) => {
      const id = newId();
      pending.set(id, {
        id,
        type: 'plan_approval',
        taskId,
        payload: plan,
        resolve: (v) => resolve(v as 'approve' | 'cancel' | 'edit'),
        reject,
        createdAt: Date.now(),
      });
      broadcast(taskId, { kind: 'prompt', promptId: id, promptType: 'plan_approval', plan });
    });
  },
  // UI plan editor. Surfaces an inline-edit prompt over the WebSocket;
  // the client posts the edited plan back through /api/prompts/respond
  // and we resolve with the new plan. Falls back to returning the
  // original plan if the client sends something non-plan-shaped (so the
  // loop doesn't crash on bad input).
  async editPlan(plan: Plan): Promise<Plan> {
    const t = active.get(taskId);
    if (t) t.status = 'awaiting';
    return new Promise((resolve, reject) => {
      const id = newId();
      pending.set(id, {
        id,
        type: 'plan_edit',
        taskId,
        payload: plan,
        resolve: (v) => {
          if (v && typeof v === 'object' && Array.isArray((v as Plan).steps)) {
            resolve(v as Plan);
          } else {
            resolve(plan);
          }
        },
        reject,
        createdAt: Date.now(),
      });
      broadcast(taskId, { kind: 'prompt', promptId: id, promptType: 'plan_edit', plan });
    });
  },
  async requestPermission(
    req: PermissionRequest,
    flags: PermissionFlags,
  ): Promise<PermissionDecision> {
    const t = active.get(taskId);
    if (t) t.status = 'awaiting';
    return new Promise((resolve, reject) => {
      const id = newId();
      pending.set(id, {
        id,
        type: 'permission',
        taskId,
        payload: { req, flags },
        resolve: (v) => resolve(v as PermissionDecision),
        reject,
        createdAt: Date.now(),
      });
      broadcast(taskId, {
        kind: 'prompt',
        promptId: id,
        promptType: 'permission',
        request: req,
        flags,
      });
    });
  },
  async askUser(_taskId: string, question: string, choices, defaultValue) {
    return new Promise((resolve, reject) => {
      const id = newId();
      pending.set(id, {
        id,
        type: 'user_input',
        taskId,
        payload: { question, choices, defaultValue },
        resolve: (v) => resolve(String(v ?? '')),
        reject,
        createdAt: Date.now(),
      });
      broadcast(taskId, {
        kind: 'prompt',
        promptId: id,
        promptType: 'user_input',
        question,
        choices,
        defaultValue,
      });
    });
  },
  emit(taskId: string, event: ForgeEvent) {
    broadcast(taskId, { kind: 'event', event });
  },
});

export interface RunRequest {
  prompt: string;
  mode?: Mode;
  cwd?: string;
  autoApprove?: boolean;
  flags?: PermissionFlags;
  title?: string;
  /**
   * Optional full description to hand to the planner. When set, this usually
   * bundles conversation history from a chat session (see ui/chat.ts) so
   * multi-turn follow-ups thread through. The `prompt` field still drives
   * classification and the task title.
   */
  description?: string;
}

export interface RunReply {
  taskId: string;
  startedAt: number;
}

/**
 * Observer pattern so chat.ts (and anyone else) can react to task results
 * without task-runner importing chat.ts (which would be a cycle — chat.ts
 * calls startUiTask).
 */
export interface TaskResolution {
  taskId: string;
  status: 'done' | 'failed';
  summary: string;
  filesChanged: string[];
  durationMs: number;
  costUsd?: number;
  success: boolean;
}

const resolutionListeners = new Set<(r: TaskResolution) => void>();

export const onTaskResolved = (cb: (r: TaskResolution) => void): (() => void) => {
  resolutionListeners.add(cb);
  return () => {
    resolutionListeners.delete(cb);
  };
};

// A user-entered path from the dashboard can come in as `~`, `~/foo`, or a
// plain absolute path. `~` is shell syntax — Node does not expand it, so
// without this the path is joined literally and becomes `<cwd>/~/foo`,
// which is nonsense and breaks every tool that tries to stat it.
const expandUserPath = (p: string | undefined): string | undefined => {
  if (!p) return p;
  const trimmed = p.trim();
  if (!trimmed) return undefined;
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~' + path.sep)) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
};

export const startUiTask = (req: RunRequest): RunReply => {
  // Use the canonical `task_<hex>` form so the id we register in `active`
  // matches the id the orchestrator stamps on events + deltas. Before this,
  // the runner made up a hex id and the orchestrator made a different id
  // internally; the eventBus bridge checked `active.has(d.taskId)` and
  // silently dropped every delta because the ids didn't match.
  const taskId = newTaskId();
  const startedAt = Date.now();
  const host = makeHost(taskId);

  // Register the task in `active` BEFORE kicking off orchestrateRun so any
  // synchronous events the orchestrator's setup path emits (classify /
  // plan / project-scan) aren't dropped by the bridge's `active.has`
  // guard. Deltas are async so they'd be fine either way, but event lines
  // that populate the working-spinner label depend on this ordering.
  const placeholder: ActiveTask = {
    taskId,
    ringBuffer: [],
    deltaBuffer: [],
    subscribers: new Set(),
    abortRequested: false,
    startedAt,
    prompt: req.prompt,
    mode: req.mode ?? 'balanced',
    status: 'running',
    resultPromise: Promise.resolve() as Promise<unknown>,
  };
  active.set(taskId, placeholder);

  const resultPromise = withHost(host, () =>
    orchestrateRun({
      taskId,
      input: req.prompt,
      description: req.description,
      mode: req.mode ?? 'balanced',
      cwd: expandUserPath(req.cwd),
      autoApprove: req.autoApprove,
      flags: req.flags ?? {},
      title: req.title,
    }),
  )
    .then((result) => {
      const t = active.get(taskId);
      if (t) t.status = result.result.success ? 'done' : 'failed';
      broadcast(taskId, { kind: 'task.result', result: result.result, task: result.task });
      const resolution: TaskResolution = {
        taskId,
        status: result.result.success ? 'done' : 'failed',
        summary: result.result.summary ?? '',
        filesChanged: result.result.filesChanged ?? [],
        durationMs: result.result.durationMs ?? 0,
        costUsd: result.result.costUsd,
        success: result.result.success,
      };
      for (const cb of resolutionListeners) {
        try {
          cb(resolution);
        } catch (e) {
          /* listener isolated */
          void e;
        }
      }
      for (const [id, p] of pending) {
        if (p.taskId === taskId) {
          p.reject(new Error('task ended'));
          pending.delete(id);
        }
      }
      return result;
    })
    .catch((err) => {
      const t = active.get(taskId);
      if (t) t.status = 'failed';
      broadcast(taskId, { kind: 'task.error', error: String(err) });
      const resolution: TaskResolution = {
        taskId,
        status: 'failed',
        summary: String(err),
        filesChanged: [],
        durationMs: 0,
        success: false,
      };
      for (const cb of resolutionListeners) {
        try {
          cb(resolution);
        } catch {
          /* listener isolated */
        }
      }
      throw err;
    });

  // The placeholder registered above has been accumulating the ring buffer
  // + delta buffer + (usually empty) subscriber set while the orchestrator
  // set itself up. Stamp the real `resultPromise` onto it so downstream
  // lifecycle helpers (cancelTask, listActive, etc.) see the live task.
  placeholder.resultPromise = resultPromise;
  broadcast(taskId, {
    kind: 'task.started',
    prompt: req.prompt,
    mode: req.mode ?? 'balanced',
  });
  return { taskId, startedAt };
};

export const subscribe = (taskId: string, ws: WebSocket): boolean => {
  const task = active.get(taskId);
  if (!task) return false;
  task.subscribers.add(ws);
  // Replay the ring buffer so the subscriber catches up.
  for (const payload of task.ringBuffer) {
    try {
      ws.send(JSON.stringify({ taskId, ...payload }));
    } catch {
      /* ignore */
    }
  }
  // Replay any model deltas that fired before the browser managed to open
  // the WebSocket. For a fast local model the first tokens land within
  // 50–500ms of startUiTask returning, which is typically *before* the WS
  // handshake completes — without this replay those tokens were lost and
  // the user saw no live streaming at all.
  for (const payload of task.deltaBuffer) {
    try {
      ws.send(JSON.stringify({ taskId, ...payload }));
    } catch {
      /* ignore */
    }
  }
  ws.on('close', () => {
    task.subscribers.delete(ws);
  });
  return true;
};

export const respond = (promptId: string, value: unknown): boolean => {
  const p = pending.get(promptId);
  if (!p) return false;
  pending.delete(promptId);
  const t = active.get(p.taskId);
  if (t) t.status = 'running';
  try {
    p.resolve(value);
    return true;
  } catch (err) {
    log.warn('prompt response threw', { err: String(err) });
    return false;
  }
};

export const listActive = () => {
  return [...active.values()].map((t) => ({
    taskId: t.taskId,
    startedAt: t.startedAt,
    prompt: t.prompt.slice(0, 200),
    mode: t.mode,
    status: t.status,
    subscribers: t.subscribers.size,
  }));
};

export const listPendingPrompts = () => {
  return [...pending.values()].map((p) => ({
    id: p.id,
    type: p.type,
    taskId: p.taskId,
    createdAt: p.createdAt,
    payload: redact(p.payload),
  }));
};

export const cancelTask = (taskId: string): boolean => {
  const task = active.get(taskId);
  if (!task) return false;
  task.abortRequested = true;
  task.status = 'cancelled';
  broadcast(taskId, { kind: 'task.cancel_requested' });
  // Resolve any outstanding prompt as cancel / deny so the loop can exit.
  for (const [id, p] of pending) {
    if (p.taskId === taskId) {
      if (p.type === 'plan_approval') p.resolve('cancel');
      else if (p.type === 'permission') p.resolve('deny');
      else p.resolve('');
      pending.delete(id);
    }
  }
  // Loop's own signal abort channel.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const signals = require('../core/signals');
  signals.resetAbort();
  // Best-effort: tell the node that something is ending. Actual mid-step abort
  // relies on `shouldAbort()` in loop.ts which we tripped here via cancelled status.
  return true;
};

export const getTask = (taskId: string): ActiveTask | null => active.get(taskId) ?? null;
