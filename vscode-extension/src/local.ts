/**
 * Read Forge stats straight out of `~/.forge/global/index.db` via the
 * `sqlite3` CLI. This means the sidebar shows numbers even when the
 * dashboard server isn't running — the source of truth is the DB,
 * not the UI server.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';

export interface LocalStats {
  calls: number;
  tokens: number;
  taskCount: number;
  todayCount: number;
  runningCount: number;
}

export interface LocalTask {
  id: string;
  title: string;
  status: string;
  mode: string;
  attempts: number;
  updated_at: string;
}

const FORGE_HOME = process.env.FORGE_HOME || path.join(os.homedir(), '.forge');
const DB_PATH = path.join(FORGE_HOME, 'global', 'index.db');

let sqlite3Available: boolean | undefined;

async function hasSqlite3(): Promise<boolean> {
  if (sqlite3Available !== undefined) return sqlite3Available;
  sqlite3Available = await new Promise<boolean>((resolve) => {
    const child = execFile('sqlite3', ['-version'], { timeout: 1500 }, (err) => {
      resolve(!err);
    });
    child.on('error', () => resolve(false));
  });
  return sqlite3Available;
}

function dbExists(): boolean {
  try {
    return fs.statSync(DB_PATH).isFile();
  } catch {
    return false;
  }
}

function runSql(sql: string, timeoutMs = 1500): Promise<string | null> {
  return new Promise((resolve) => {
    const child = execFile(
      'sqlite3',
      ['-readonly', '-separator', '', DB_PATH, sql],
      { timeout: timeoutMs },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        resolve(stdout.toString());
      },
    );
    child.on('error', () => resolve(null));
  });
}

export async function readLocalStats(): Promise<LocalStats | null> {
  if (!dbExists() || !(await hasSqlite3())) return null;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const t0 = todayStart.toISOString();

  const sql = [
    `SELECT 'cost', COUNT(*), COALESCE(SUM(input_tokens+output_tokens),0) FROM model_cost_ledger`,
    `SELECT 'tasks', COUNT(*), COALESCE(SUM(updated_at >= '${t0}'),0) FROM tasks`,
    `SELECT 'running', COUNT(*) FROM tasks WHERE status IN ('running','verifying')`,
  ].join(';\n');

  const out = await runSql(sql);
  if (out == null) return null;
  const lines = out.split('\n').filter(Boolean);

  let calls = 0,
    tokens = 0,
    taskCount = 0,
    todayCount = 0,
    runningCount = 0;
  for (const line of lines) {
    const cols = line.split('');
    if (cols[0] === 'cost') {
      calls = Number(cols[1] ?? 0);
      tokens = Number(cols[2] ?? 0);
    } else if (cols[0] === 'tasks') {
      taskCount = Number(cols[1] ?? 0);
      todayCount = Number(cols[2] ?? 0);
    } else if (cols[0] === 'running') {
      runningCount = Number(cols[1] ?? 0);
    }
  }
  return { calls, tokens, taskCount, todayCount, runningCount };
}

export async function readLocalTasks(limit = 8): Promise<LocalTask[] | null> {
  if (!dbExists() || !(await hasSqlite3())) return null;
  const sql = `SELECT id, title, status, mode, attempts, updated_at FROM tasks ORDER BY updated_at DESC LIMIT ${Number(limit) || 8}`;
  const out = await runSql(sql);
  if (out == null) return null;
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, title, status, mode, attempts, updated_at] = line.split('');
      return {
        id: id ?? '',
        title: title ?? '',
        status: status ?? 'draft',
        mode: mode ?? '',
        attempts: Number(attempts ?? 1),
        updated_at: updated_at ?? '',
      };
    });
}

export function forgeHome(): string {
  return FORGE_HOME;
}
