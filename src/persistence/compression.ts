/**
 * Session compression / summarization. Periodically (from the daemon) aged
 * JSONL sessions are summarized into a one-line synopsis so we can drop the
 * raw file. The synopsis goes into the SQLite `sessions` table for fast
 * lookup and cross-project search without paying full replay cost.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import { ensureProjectDir } from '../config/paths';
import { getDb } from '../persistence/index-db';
import { redactString } from '../security/redact';
import { log } from '../logging/logger';

export interface CompressionResult {
  compressed: number;
  bytesReclaimed: number;
}

const migrate = (): void => {
  // Base `sessions` table exists already.
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS session_archive (
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      synopsis TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      PRIMARY KEY (project_id, session_id)
    );
  `);
};

const summarize = (entries: string[]): string => {
  const types = new Map<string, number>();
  let firstUser = '';
  let lastResult = '';
  for (const line of entries) {
    try {
      const obj = JSON.parse(line);
      types.set(obj.type, (types.get(obj.type) ?? 0) + 1);
      if (obj.type === 'user' && !firstUser)
        firstUser = String(obj.content?.title ?? obj.content ?? '').slice(0, 200);
      if (obj.type === 'result') lastResult = String(obj.content?.summary ?? '').slice(0, 200);
    } catch {
      /* skip */
    }
  }
  const typeSummary = [...types.entries()].map(([k, v]) => `${k}=${v}`).join(' ');
  return redactString(`"${firstUser}" → ${lastResult} · ${typeSummary}`);
};

export const compressAgedSessions = (
  projectRoot: string,
  options: { olderThanDays?: number } = {},
): CompressionResult => {
  migrate();
  const sub = ensureProjectDir(projectRoot);
  const days = options.olderThanDays ?? 14;
  const cutoff = Date.now() - days * 86_400_000;
  const db = getDb();
  let compressed = 0;
  let reclaimed = 0;
  if (!fs.existsSync(sub.sessions)) return { compressed: 0, bytesReclaimed: 0 };
  for (const file of fs.readdirSync(sub.sessions)) {
    if (!file.endsWith('.jsonl')) continue;
    const fp = path.join(sub.sessions, file);
    try {
      const stat = fs.statSync(fp);
      if (stat.mtimeMs > cutoff) continue;
      const entries = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean);
      if (entries.length === 0) continue;
      const synopsis = summarize(entries);
      const pid = path.basename(projectRoot); // project identity uses hash elsewhere; not needed here for archive
      const sessionId = path.basename(file, '.jsonl');
      db.prepare(
        `INSERT INTO session_archive (project_id, session_id, synopsis, archived_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id, session_id) DO UPDATE SET synopsis = excluded.synopsis, archived_at = excluded.archived_at`,
      ).run(pid, sessionId, synopsis, new Date().toISOString());
      reclaimed += stat.size;
      fs.unlinkSync(fp);
      compressed++;
    } catch (err) {
      log.debug('session compress skip', { file, err: String(err) });
    }
  }
  return { compressed, bytesReclaimed: reclaimed };
};

export const listArchived = (limit = 50) => {
  migrate();
  return getDb()
    .prepare(
      'SELECT session_id, project_id, synopsis, archived_at FROM session_archive ORDER BY archived_at DESC LIMIT ?',
    )
    .all(limit);
};
