/**
 * Cold memory: persistent keyword+BM25-ish text index over the codebase
 * (and past session summaries) backed by SQLite FTS5.
 *
 * We deliberately avoid shipping a heavy embedding model in v1. FTS5 provides
 * competitive recall for code search; an embedding-based retriever can be
 * swapped in behind the same interface.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getDb } from '../persistence/index-db';
import { log } from '../logging/logger';
import { projectId as computeProjectId } from '../config/paths';

const BINARY_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.xz',
  '.wasm',
  '.so',
  '.dylib',
  '.dll',
  '.exe',
  '.class',
  '.jar',
  '.o',
  '.a',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.wav',
  '.ttf',
  '.woff',
  '.woff2',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.next',
  '.nuxt',
  '.cache',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  'vendor',
  '.forge',
]);

const migrate = (): void => {
  const db = getDb();
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
      project_id UNINDEXED,
      path UNINDEXED,
      content,
      kind UNINDEXED,
      updated_at UNINDEXED,
      tokenize='unicode61 remove_diacritics 1'
    );

    CREATE TABLE IF NOT EXISTS doc_meta (
      project_id TEXT NOT NULL,
      path TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime INTEGER NOT NULL,
      hash TEXT NOT NULL,
      PRIMARY KEY (project_id, path)
    );
  `);
};

const walk = (root: string): string[] => {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(fp);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (BINARY_EXT.has(ext)) continue;
        try {
          const st = fs.statSync(fp);
          if (st.size > 1 * 1024 * 1024) continue; // skip >1MB
          out.push(fp);
        } catch {
          /* ignore */
        }
      }
    }
  }
  return out;
};

export interface IndexStats {
  scanned: number;
  indexed: number;
  unchanged: number;
  removed: number;
  durationMs: number;
}

export const indexProject = (projectRoot: string): IndexStats => {
  migrate();
  const db = getDb();
  const pid = computeProjectId(projectRoot);
  const started = Date.now();
  const files = walk(projectRoot);
  const fresh = new Set(files.map((f) => path.relative(projectRoot, f)));

  const existing = db
    .prepare('SELECT path, mtime, size FROM doc_meta WHERE project_id = ?')
    .all(pid) as Array<{ path: string; mtime: number; size: number }>;
  const existingMap = new Map(existing.map((r) => [r.path, r]));

  let indexed = 0;
  let unchanged = 0;
  const upsertMeta = db.prepare(
    'INSERT INTO doc_meta (project_id, path, size, mtime, hash) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(project_id, path) DO UPDATE SET size=excluded.size, mtime=excluded.mtime, hash=excluded.hash',
  );
  const insertFts = db.prepare(
    'INSERT INTO docs_fts (project_id, path, content, kind, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  const deleteFts = db.prepare('DELETE FROM docs_fts WHERE project_id = ? AND path = ?');

  const tx = db.transaction((batch: string[]) => {
    for (const abs of batch) {
      const rel = path.relative(projectRoot, abs);
      try {
        const st = fs.statSync(abs);
        const prev = existingMap.get(rel);
        if (prev && prev.mtime === st.mtimeMs && prev.size === st.size) {
          unchanged++;
          continue;
        }
        const buf = fs.readFileSync(abs);
        const content = buf.toString('utf8');
        deleteFts.run(pid, rel);
        insertFts.run(pid, rel, content, path.extname(rel), String(st.mtimeMs));
        upsertMeta.run(pid, rel, st.size, Math.floor(st.mtimeMs), '');
        indexed++;
      } catch (err) {
        log.debug('index skip', { file: rel, err: String(err) });
      }
    }
  });
  tx(files);

  // Remove files that disappeared.
  let removed = 0;
  for (const e of existing) {
    if (!fresh.has(e.path)) {
      deleteFts.run(pid, e.path);
      db.prepare('DELETE FROM doc_meta WHERE project_id = ? AND path = ?').run(pid, e.path);
      removed++;
    }
  }

  return { scanned: files.length, indexed, unchanged, removed, durationMs: Date.now() - started };
};

export interface SearchHit {
  path: string;
  snippet: string;
  score: number;
}

const sanitizeQuery = (q: string): string => {
  // FTS5 MATCH is column:'term' or raw tokens; strip special chars that break syntax.
  const cleaned = q
    .replace(/[^A-Za-z0-9_\s\-.]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => `"${t.replace(/"/g, '')}"`)
    .join(' ');
  return cleaned || `"${q.replace(/"/g, '')}"`;
};

export const search = (projectRoot: string, query: string, limit = 10): SearchHit[] => {
  migrate();
  const db = getDb();
  const pid = computeProjectId(projectRoot);
  try {
    const rows = db
      .prepare(
        `SELECT path, snippet(docs_fts, 2, '«', '»', '…', 16) AS snippet, bm25(docs_fts) AS score
         FROM docs_fts
         WHERE project_id = ? AND docs_fts MATCH ?
         ORDER BY score
         LIMIT ?`,
      )
      .all(pid, sanitizeQuery(query), limit) as SearchHit[];
    return rows.map((r) => ({ ...r, score: -r.score })); // bm25 is negative; invert for display
  } catch (err) {
    log.debug('cold search failed', { err: String(err) });
    return [];
  }
};

export const forgetProject = (projectRoot: string): void => {
  migrate();
  const db = getDb();
  const pid = computeProjectId(projectRoot);
  db.prepare('DELETE FROM docs_fts WHERE project_id = ?').run(pid);
  db.prepare('DELETE FROM doc_meta WHERE project_id = ?').run(pid);
};
