import * as path from 'path';
import { ensureProjectDir } from '../config/paths';
import { appendJsonl, readJsonl, streamJsonl } from './jsonl';
import { SessionEntry } from '../types';

/**
 * Session persistence module.
 *
 * This module provides functionality for appending entries to a session log, loading an entire session, and streaming session entries. Each session is stored as a JSON Lines file in a project-specific sessions directory. The `appendSessionEntry` function allows adding new entries to a session, while the `loadSession` function retrieves all entries for a given session. The `streamSession` function provides an asynchronous generator to read session entries in a streaming fashion, which is useful for processing large sessions without loading them entirely into memory.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

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
