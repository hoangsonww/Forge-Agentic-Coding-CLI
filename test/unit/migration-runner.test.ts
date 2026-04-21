/**
 * Migration Runner Tests.
 *
 * Uses a stub SQLite-shaped object to verify that runMigrations applies
 * each unknown migration exactly once, records it in schema_migrations,
 * and reports the current latest version.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi } from 'vitest';

// Stub a minimal better-sqlite3 shape.
const createStubDb = (initialVersions: number[]) => {
  const applied = new Set(initialVersions);
  const exec = vi.fn();
  const prepare = vi.fn((sql: string) => {
    if (/SELECT version FROM schema_migrations/i.test(sql)) {
      return { all: () => Array.from(applied).map((version) => ({ version })) };
    }
    if (/INSERT OR IGNORE INTO schema_migrations/i.test(sql)) {
      return {
        run: (version: number) => {
          applied.add(version);
        },
      };
    }
    if (/SELECT MAX\(version\)/i.test(sql)) {
      return {
        get: () => ({ v: applied.size ? Math.max(...applied) : null }),
      };
    }
    return { run: vi.fn(), get: vi.fn(), all: () => [] };
  });
  const transaction = (fn: () => void) => () => fn();
  return { exec, prepare, transaction, _applied: applied };
};

const dbStub = createStubDb([1]);

vi.mock('../../src/persistence/index-db', () => ({
  getDb: () => dbStub,
}));

import { runMigrations } from '../../src/migrations/runner';

describe('runMigrations', () => {
  it('applies pending migrations and reports the latest version', () => {
    const first = runMigrations();
    expect(first.applied).toBeGreaterThanOrEqual(1);
    expect(first.latest).toBeGreaterThanOrEqual(3);
  });

  it('is idempotent when re-run', () => {
    const second = runMigrations();
    expect(second.applied).toBe(0);
    expect(second.latest).toBeGreaterThanOrEqual(3);
  });
});
