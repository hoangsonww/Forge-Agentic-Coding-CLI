import * as path from 'path';
import { ensureProjectDir } from '../config/paths';
import { appendJsonl, streamJsonl } from './jsonl';
import { ForgeEvent } from '../types';

const eventFile = (projectRoot: string): string => {
  const sub = ensureProjectDir(projectRoot);
  return path.join(sub.logs, 'events.jsonl');
};

export const emit = (projectRoot: string, event: ForgeEvent): void => {
  appendJsonl(eventFile(projectRoot), event);
};

export const streamEvents = (projectRoot: string): AsyncGenerator<ForgeEvent, void, void> =>
  streamJsonl<ForgeEvent>(eventFile(projectRoot));
