/**
 * Index database module.
 *
 * This module manages a global SQLite database that serves as an index for projects, tasks, permission grants, learning patterns, and MCP connections. It provides functions to initialize the database, perform migrations, and execute CRUD operations on the various entities. The database is stored in a location defined by the application's configuration paths.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import Database, { Database as DB } from 'better-sqlite3';
import { paths } from '../config/paths';

let db: DB | null = null;

const ensureDb = (): DB => {
  if (db) return db;
  fs.mkdirSync(path.dirname(paths.globalIndex), { recursive: true });
  db = new Database(paths.globalIndex);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  migrate(db);
  return db;
};

const migrate = (conn: DB): void => {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_opened TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      intent TEXT,
      complexity TEXT,
      risk TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      attempts INTEGER DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      summary TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS permission_grants (
      tool TEXT NOT NULL,
      project_id TEXT,
      scope TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      expires_at TEXT,
      PRIMARY KEY (tool, project_id, scope)
    );

    CREATE TABLE IF NOT EXISTS learning_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      context TEXT,
      fix TEXT,
      confidence REAL NOT NULL DEFAULT 0.5,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_patterns_ctx ON learning_patterns(context);

    CREATE TABLE IF NOT EXISTS mcp_connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL,
      endpoint TEXT,
      command TEXT,
      args TEXT,
      auth TEXT NOT NULL,
      status TEXT NOT NULL,
      last_used_at TEXT,
      tools TEXT
    );
  `);

  const row = conn.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as {
    v: number | null;
  };
  if (!row?.v) {
    conn
      .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(1, new Date().toISOString());
  }
};

export const getDb = (): DB => ensureDb();

export const closeDb = (): void => {
  if (db) {
    db.close();
    db = null;
  }
};

// ----------- Projects -----------
export const upsertProject = (id: string, projectPath: string, name: string): void => {
  const conn = ensureDb();
  const now = new Date().toISOString();
  conn
    .prepare(
      `INSERT INTO projects (id, path, name, created_at, last_opened)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_opened = excluded.last_opened`,
    )
    .run(id, projectPath, name, now, now);
};

export const listProjects = (): Array<{
  id: string;
  path: string;
  name: string;
  created_at: string;
  last_opened: string;
}> => {
  const conn = ensureDb();
  return conn.prepare('SELECT * FROM projects ORDER BY last_opened DESC').all() as Array<{
    id: string;
    path: string;
    name: string;
    created_at: string;
    last_opened: string;
  }>;
};

// ----------- Tasks index -----------
export interface TaskIndexRow {
  id: string;
  project_id: string;
  title: string;
  status: string;
  mode: string;
  intent: string | null;
  complexity: string | null;
  risk: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  attempts: number;
}

export const indexTask = (row: TaskIndexRow): void => {
  const conn = ensureDb();
  conn
    .prepare(
      `INSERT INTO tasks (id, project_id, title, status, mode, intent, complexity, risk,
                         created_at, updated_at, completed_at, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title,
         status=excluded.status,
         mode=excluded.mode,
         intent=excluded.intent,
         complexity=excluded.complexity,
         risk=excluded.risk,
         updated_at=excluded.updated_at,
         completed_at=excluded.completed_at,
         attempts=excluded.attempts`,
    )
    .run(
      row.id,
      row.project_id,
      row.title,
      row.status,
      row.mode,
      row.intent,
      row.complexity,
      row.risk,
      row.created_at,
      row.updated_at,
      row.completed_at,
      row.attempts,
    );
};

export const searchTasks = (query: string, limit = 50): TaskIndexRow[] => {
  const conn = ensureDb();
  const like = `%${query.replace(/%/g, '\\%')}%`;
  return conn
    .prepare(
      `SELECT * FROM tasks WHERE title LIKE ? OR intent LIKE ?
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(like, like, limit) as TaskIndexRow[];
};

export const listTasks = (projectId?: string, limit = 50): TaskIndexRow[] => {
  const conn = ensureDb();
  if (projectId) {
    return conn
      .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?')
      .all(projectId, limit) as TaskIndexRow[];
  }
  return conn
    .prepare('SELECT * FROM tasks ORDER BY updated_at DESC LIMIT ?')
    .all(limit) as TaskIndexRow[];
};

export const getTask = (id: string): TaskIndexRow | null => {
  const conn = ensureDb();
  return (conn.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskIndexRow) ?? null;
};

export const deleteTaskFromIndex = (id: string): { task: number; sessions: number } => {
  const conn = ensureDb();
  const sessions = conn.prepare('DELETE FROM sessions WHERE task_id = ?').run(id).changes;
  const task = conn.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes;
  return { task, sessions };
};

// ----------- Permission grants -----------
export interface PermissionRow {
  tool: string;
  project_id: string | null;
  scope: string;
  granted_at: string;
  expires_at: string | null;
}

export const savePermissionGrant = (row: PermissionRow): void => {
  const conn = ensureDb();
  conn
    .prepare(
      `INSERT INTO permission_grants (tool, project_id, scope, granted_at, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tool, project_id, scope) DO UPDATE SET
         granted_at = excluded.granted_at,
         expires_at = excluded.expires_at`,
    )
    .run(row.tool, row.project_id, row.scope, row.granted_at, row.expires_at);
};

export const loadPermissionGrants = (tool: string, projectId: string | null): PermissionRow[] => {
  const conn = ensureDb();
  return conn
    .prepare(
      `SELECT * FROM permission_grants
       WHERE tool = ? AND (project_id = ? OR project_id IS NULL)`,
    )
    .all(tool, projectId) as PermissionRow[];
};

// ----------- Learning patterns -----------
export interface LearningRow {
  id?: number;
  pattern: string;
  context: string;
  fix: string;
  confidence: number;
  success_count: number;
  failure_count: number;
  updated_at: string;
}

export const upsertLearning = (row: LearningRow): void => {
  const conn = ensureDb();
  const existing = conn
    .prepare('SELECT id, success_count, failure_count FROM learning_patterns WHERE pattern = ?')
    .get(row.pattern) as { id: number; success_count: number; failure_count: number } | undefined;
  if (existing) {
    conn
      .prepare(
        `UPDATE learning_patterns SET
           confidence = ?, success_count = ?, failure_count = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(row.confidence, row.success_count, row.failure_count, row.updated_at, existing.id);
  } else {
    conn
      .prepare(
        `INSERT INTO learning_patterns (pattern, context, fix, confidence, success_count, failure_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.pattern,
        row.context,
        row.fix,
        row.confidence,
        row.success_count,
        row.failure_count,
        row.updated_at,
      );
  }
};

export const loadLearning = (context: string, limit = 5): LearningRow[] => {
  const conn = ensureDb();
  return conn
    .prepare(
      `SELECT * FROM learning_patterns WHERE context LIKE ?
       ORDER BY confidence DESC LIMIT ?`,
    )
    .all(`%${context}%`, limit) as LearningRow[];
};

// ----------- MCP connections -----------
export interface McpRow {
  id: string;
  name: string;
  transport: string;
  endpoint: string | null;
  command: string | null;
  args: string | null;
  auth: string;
  status: string;
  last_used_at: string | null;
  tools: string | null;
}

export const upsertMcp = (row: McpRow): void => {
  const conn = ensureDb();
  conn
    .prepare(
      `INSERT INTO mcp_connections (id, name, transport, endpoint, command, args, auth, status, last_used_at, tools)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         transport = excluded.transport,
         endpoint = excluded.endpoint,
         command = excluded.command,
         args = excluded.args,
         auth = excluded.auth,
         status = excluded.status,
         last_used_at = excluded.last_used_at,
         tools = excluded.tools`,
    )
    .run(
      row.id,
      row.name,
      row.transport,
      row.endpoint,
      row.command,
      row.args,
      row.auth,
      row.status,
      row.last_used_at,
      row.tools,
    );
};

export const listMcp = (): McpRow[] => {
  const conn = ensureDb();
  return conn.prepare('SELECT * FROM mcp_connections ORDER BY name').all() as McpRow[];
};

export const deleteMcp = (id: string): void => {
  const conn = ensureDb();
  conn.prepare('DELETE FROM mcp_connections WHERE id = ?').run(id);
};
