/**
 * Explicit schema migration runner for the global SQLite index.
 *
 * index-db.ts creates the base tables on first use. This runner layers
 * numbered migrations on top (DDL only — no runtime mutation). Each
 * migration is idempotent and tracked in schema_migrations.
 */
import { getDb } from '../persistence/index-db';
import { log } from '../logging/logger';

export interface Migration {
  version: number;
  name: string;
  up: (db: ReturnType<typeof getDb>) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 2,
    name: 'add_tool_usage_counters',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tool_usage (
          tool TEXT NOT NULL,
          project_id TEXT NOT NULL,
          success_count INTEGER NOT NULL DEFAULT 0,
          failure_count INTEGER NOT NULL DEFAULT 0,
          last_used_at TEXT,
          PRIMARY KEY (tool, project_id)
        );
      `);
    },
  },
  {
    version: 3,
    name: 'indices',
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tool_usage_tool ON tool_usage(tool);
        CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
      `);
    },
  },
];

export const runMigrations = (): { applied: number; latest: number } => {
  const db = getDb();
  const rows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{
    version: number;
  }>;
  const applied = new Set(rows.map((r) => r.version));
  let count = 0;
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    log.info('applying migration', { version: m.version, name: m.name });
    const tx = db.transaction(() => {
      m.up(db);
      db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        m.version,
        new Date().toISOString(),
      );
    });
    tx();
    count++;
  }
  const latest =
    (db.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as { v: number | null })
      .v ?? 1;
  return { applied: count, latest };
};
