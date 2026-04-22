/**
 * Event persistence module.
 *
 * This module provides functionality for emitting and streaming events related to the Forge system. Events are stored in a JSON Lines format in a project-specific logs directory. The `emit` function allows adding new events, while the `streamEvents` function provides an asynchronous generator to read events in a streaming fashion, which is useful for real-time monitoring or processing of events as they occur.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as path from 'path';
import { EventEmitter } from 'node:events';
import { ensureProjectDir } from '../config/paths';
import { appendJsonl, streamJsonl } from './jsonl';
import { ForgeEvent } from '../types';

const eventFile = (projectRoot: string): string => {
  const sub = ensureProjectDir(projectRoot);
  return path.join(sub.logs, 'events.jsonl');
};

/**
 * In-process event bus. Fires synchronously after `emit()` appends to the
 * JSONL log so subscribers (CLI spinner, REPL, UI WebSocket bridge) can react
 * without tailing a file. Subscribers MUST not throw — a throwing listener
 * would tear down the agentic loop. We isolate them in a try/catch.
 *
 * The `'event'` channel fires for every ForgeEvent. The `'delta'` channel
 * fires for streaming model output and carries `{ taskId?, projectId?, text,
 * role?, model? }` — this is separate from `MODEL_DELTA` ForgeEvents because
 * streaming text is high-frequency and we don't want to fsync each chunk.
 */
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(100);

export interface ModelDeltaEvent {
  text: string;
  projectId?: string;
  taskId?: string;
  role?: string;
  model?: string;
  provider?: string;
  /** True on the final (done) frame. */
  done?: boolean;
}

export const emit = (projectRoot: string, event: ForgeEvent): void => {
  appendJsonl(eventFile(projectRoot), event);
  try {
    eventBus.emit('event', event);
  } catch {
    // Listener misbehaved; swallow so persistence is still king.
  }
};

/**
 * Emit a streaming-text delta. Not persisted to the JSONL log — that would
 * spam the file with per-token lines — but delivered to in-process listeners.
 */
export const emitDelta = (evt: ModelDeltaEvent): void => {
  try {
    eventBus.emit('delta', evt);
  } catch {
    // listener misbehaved; ignore
  }
};

export const streamEvents = (projectRoot: string): AsyncGenerator<ForgeEvent, void, void> =>
  streamJsonl<ForgeEvent>(eventFile(projectRoot));
