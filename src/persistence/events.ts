import * as path from 'path';
import { ensureProjectDir } from '../config/paths';
import { appendJsonl, streamJsonl } from './jsonl';
import { ForgeEvent } from '../types';

/**
 * Event persistence module.
 *
 * This module provides functionality for emitting and streaming events related to the Forge system. Events are stored in a JSON Lines format in a project-specific logs directory. The `emit` function allows adding new events, while the `streamEvents` function provides an asynchronous generator to read events in a streaming fashion, which is useful for real-time monitoring or processing of events as they occur.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const eventFile = (projectRoot: string): string => {
  const sub = ensureProjectDir(projectRoot);
  return path.join(sub.logs, 'events.jsonl');
};

export const emit = (projectRoot: string, event: ForgeEvent): void => {
  appendJsonl(eventFile(projectRoot), event);
};

export const streamEvents = (projectRoot: string): AsyncGenerator<ForgeEvent, void, void> =>
  streamJsonl<ForgeEvent>(eventFile(projectRoot));
