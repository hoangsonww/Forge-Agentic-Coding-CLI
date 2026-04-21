/**
 * Session Compression Tests.
 *
 * The compressor summarizes aged JSONL sessions into SQLite and then
 * deletes the raw file. Because it touches the SQLite index, we mock
 * getDb with a stub that captures the recorded synopsis.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const execMock = vi.fn();
const runMock = vi.fn();
const allMock = vi.fn(() => [] as unknown[]);

vi.mock('../../src/persistence/index-db', () => ({
  getDb: () => ({
    exec: execMock,
    prepare: (_sql: string) => ({ run: runMock, all: allMock, get: () => null }),
    transaction: (fn: () => void) => () => fn(),
  }),
}));

let projectRoot: string;
vi.mock('../../src/config/paths', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/config/paths')>('../../src/config/paths');
  return {
    ...actual,
    ensureProjectDir: (_root: string) => ({
      root: projectRoot,
      tasks: path.join(projectRoot, 'tasks'),
      sessions: path.join(projectRoot, 'sessions'),
      logs: path.join(projectRoot, 'logs'),
      memory: path.join(projectRoot, 'memory'),
      metadata: path.join(projectRoot, 'metadata.json'),
    }),
  };
});

import { compressAgedSessions } from '../../src/persistence/compression';

describe('compressAgedSessions', () => {
  beforeEach(() => {
    execMock.mockReset();
    runMock.mockReset();
    allMock.mockReset();
    allMock.mockReturnValue([]);
    projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-compress-')));
    fs.mkdirSync(path.join(projectRoot, 'sessions'), { recursive: true });
  });

  it('returns zeros when the sessions dir is empty', () => {
    // Remove sessions dir so compressAgedSessions takes the early-return branch.
    fs.rmSync(path.join(projectRoot, 'sessions'), { recursive: true, force: true });
    const r = compressAgedSessions(projectRoot);
    expect(r).toEqual({ compressed: 0, bytesReclaimed: 0 });
  });

  it('compresses aged sessions and deletes the raw file', () => {
    const sessFile = path.join(projectRoot, 'sessions', 'old.jsonl');
    fs.writeFileSync(
      sessFile,
      [
        JSON.stringify({ type: 'user', content: 'please' }),
        JSON.stringify({ type: 'assistant', content: 'ok' }),
        JSON.stringify({ type: 'result', content: { summary: 'done' } }),
      ].join('\n') + '\n',
      'utf8',
    );
    // Age the file by 30 days.
    const past = new Date(Date.now() - 30 * 86_400_000);
    fs.utimesSync(sessFile, past, past);

    const r = compressAgedSessions(projectRoot, { olderThanDays: 14 });
    expect(r.compressed).toBe(1);
    expect(r.bytesReclaimed).toBeGreaterThan(0);
    expect(fs.existsSync(sessFile)).toBe(false);
    expect(runMock).toHaveBeenCalled();
  });

  it('leaves fresh sessions alone', () => {
    const sessFile = path.join(projectRoot, 'sessions', 'fresh.jsonl');
    fs.writeFileSync(sessFile, JSON.stringify({ type: 'user' }) + '\n', 'utf8');
    const r = compressAgedSessions(projectRoot, { olderThanDays: 14 });
    expect(r.compressed).toBe(0);
    expect(fs.existsSync(sessFile)).toBe(true);
  });
});
