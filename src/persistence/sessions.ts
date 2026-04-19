import * as path from 'path';
import { ensureProjectDir } from '../config/paths';
import { appendJsonl, readJsonl, streamJsonl } from './jsonl';
import { SessionEntry } from '../types';

const sessionFile = (projectRoot: string, sessionId: string): string => {
  const sub = ensureProjectDir(projectRoot);
  return path.join(sub.sessions, `${sessionId}.jsonl`);
};

export const appendSessionEntry = (
  projectRoot: string,
  sessionId: string,
  entry: SessionEntry,
): void => {
  appendJsonl(sessionFile(projectRoot, sessionId), entry);
};

export const loadSession = async (
  projectRoot: string,
  sessionId: string,
): Promise<SessionEntry[]> => {
  return readJsonl<SessionEntry>(sessionFile(projectRoot, sessionId));
};

export const streamSession = (
  projectRoot: string,
  sessionId: string,
): AsyncGenerator<SessionEntry, void, void> =>
  streamJsonl<SessionEntry>(sessionFile(projectRoot, sessionId));
