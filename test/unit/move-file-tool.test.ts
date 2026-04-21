/**
 * Move File Tool Tests.
 *
 * Covers move/rename behavior, overwrite safety, parent-directory
 * creation, and missing-source handling.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { moveFileTool } from '../../src/tools/move-file';

describe('move_file tool', () => {
  let tmp: string;
  const ctx = {
    taskId: 't',
    projectId: 'p',
    projectRoot: '',
    traceId: 'r',
    runId: 'r',
  };

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-move-')));
  });

  it('renames a file', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'hi');
    const r = await moveFileTool.execute(
      { from: 'a.txt', to: 'b.txt' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'a.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(tmp, 'b.txt'), 'utf8')).toBe('hi');
  });

  it('refuses overwrite unless explicit', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'src');
    fs.writeFileSync(path.join(tmp, 'b.txt'), 'dst');
    const r = await moveFileTool.execute(
      { from: 'a.txt', to: 'b.txt' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('conflict');
    expect(fs.readFileSync(path.join(tmp, 'b.txt'), 'utf8')).toBe('dst');
  });

  it('overwrites when overwrite=true', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'src');
    fs.writeFileSync(path.join(tmp, 'b.txt'), 'dst');
    const r = await moveFileTool.execute(
      { from: 'a.txt', to: 'b.txt', overwrite: true },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(fs.readFileSync(path.join(tmp, 'b.txt'), 'utf8')).toBe('src');
  });

  it('creates parent directories with createDirs', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'src');
    fs.mkdirSync(path.join(tmp, 'nested'));
    const r = await moveFileTool.execute(
      { from: 'a.txt', to: 'nested/dir/out.txt', createDirs: true },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'nested/dir/out.txt'))).toBe(true);
  });

  it('reports not_found when source is missing', async () => {
    const r = await moveFileTool.execute(
      { from: 'nope.txt', to: 'b.txt' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('not_found');
  });
});
