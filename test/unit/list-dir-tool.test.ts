/**
 * List Dir Tool Tests.
 *
 * Covers directory listing, non-directory rejection, and truncation when
 * more entries exist than maxEntries.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listDirTool } from '../../src/tools/list-dir';

describe('list_dir tool', () => {
  let tmp: string;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-list-'));
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'x');
    fs.writeFileSync(path.join(tmp, 'b.txt'), 'yy');
    fs.mkdirSync(path.join(tmp, 'sub'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  const ctx = {
    taskId: 't',
    projectId: 'p',
    projectRoot: '',
    traceId: 'r',
    runId: 'r',
  };

  it('lists directory entries with types', async () => {
    const r = await listDirTool.execute({ path: '.' }, { ...ctx, projectRoot: tmp });
    expect(r.success).toBe(true);
    const names = (r.output?.entries ?? []).map((e) => e.name).sort();
    expect(names).toContain('a.txt');
    expect(names).toContain('sub');
    const a = r.output?.entries.find((e) => e.name === 'a.txt');
    expect(a?.type).toBe('file');
    const sub = r.output?.entries.find((e) => e.name === 'sub');
    expect(sub?.type).toBe('dir');
  });

  it('truncates when maxEntries is smaller than the count', async () => {
    const r = await listDirTool.execute({ path: '.', maxEntries: 1 }, { ...ctx, projectRoot: tmp });
    expect(r.success).toBe(true);
    expect(r.output?.truncated).toBe(true);
    expect(r.output?.entries.length).toBe(1);
  });

  it('rejects a file path', async () => {
    const r = await listDirTool.execute({ path: 'a.txt' }, { ...ctx, projectRoot: tmp });
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('tool_error');
  });
});
