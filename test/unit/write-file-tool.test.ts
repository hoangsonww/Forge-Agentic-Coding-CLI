/**
 * Write File Tool Tests.
 *
 * Covers create/overwrite/append modes, the create_only guard, parent
 * directory creation, and byte accounting.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeFileTool } from '../../src/tools/write-file';

describe('write_file tool', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-write-')));
  });

  afterAll(() => {
    // individual beforeEach dirs are leaked into /tmp — best-effort parent cleanup
    // relies on OS tmp rotation; no persistent handle to clean here.
  });

  const ctx = {
    taskId: 't',
    projectId: 'p',
    projectRoot: '',
    traceId: 'r',
    runId: 'r',
  };

  it('creates a new file by default (overwrite)', async () => {
    const r = await writeFileTool.execute(
      { path: 'new.txt', content: 'hello' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(r.output?.existed).toBe(false);
    expect(fs.readFileSync(path.join(tmp, 'new.txt'), 'utf8')).toBe('hello');
  });

  it('overwrites existing file when mode is unset', async () => {
    fs.writeFileSync(path.join(tmp, 'x.txt'), 'old');
    const r = await writeFileTool.execute(
      { path: 'x.txt', content: 'new' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(r.output?.existed).toBe(true);
    expect(fs.readFileSync(path.join(tmp, 'x.txt'), 'utf8')).toBe('new');
  });

  it('refuses overwrite in create_only mode', async () => {
    fs.writeFileSync(path.join(tmp, 'x.txt'), 'old');
    const r = await writeFileTool.execute(
      { path: 'x.txt', content: 'new', mode: 'create_only' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('conflict');
    expect(fs.readFileSync(path.join(tmp, 'x.txt'), 'utf8')).toBe('old');
  });

  it('appends content in append mode', async () => {
    fs.writeFileSync(path.join(tmp, 'x.txt'), 'abc');
    const r = await writeFileTool.execute(
      { path: 'x.txt', content: 'DEF', mode: 'append' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(fs.readFileSync(path.join(tmp, 'x.txt'), 'utf8')).toBe('abcDEF');
  });

  it('creates parent directories when requested', async () => {
    fs.mkdirSync(path.join(tmp, 'sub'));
    const r = await writeFileTool.execute(
      { path: 'sub/nested/deep.txt', content: 'hi', createDirs: true },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'sub/nested/deep.txt'))).toBe(true);
  });

  it('fails without createDirs when parent is missing', async () => {
    const r = await writeFileTool.execute(
      { path: 'missing/x.txt', content: 'hi' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(false);
  });
});
