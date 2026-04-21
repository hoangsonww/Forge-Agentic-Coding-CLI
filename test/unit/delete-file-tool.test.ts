/**
 * Delete File Tool Tests.
 *
 * Covers file deletion, directory deletion with and without the recursive
 * flag, and not-found error classification.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deleteFileTool } from '../../src/tools/delete-file';

describe('delete_file tool', () => {
  let tmp: string;
  const ctx = {
    taskId: 't',
    projectId: 'p',
    projectRoot: '',
    traceId: 'r',
    runId: 'r',
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-delete-'));
  });

  it('deletes a regular file', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'x');
    const r = await deleteFileTool.execute({ path: 'a.txt' }, { ...ctx, projectRoot: tmp });
    expect(r.success).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'a.txt'))).toBe(false);
  });

  it('refuses to delete a directory without recursive=true', async () => {
    fs.mkdirSync(path.join(tmp, 'd'));
    fs.writeFileSync(path.join(tmp, 'd', 'nested.txt'), 'x');
    const r = await deleteFileTool.execute({ path: 'd' }, { ...ctx, projectRoot: tmp });
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('user_input');
    expect(fs.existsSync(path.join(tmp, 'd', 'nested.txt'))).toBe(true);
  });

  it('deletes a directory recursively when flagged', async () => {
    fs.mkdirSync(path.join(tmp, 'd'));
    fs.writeFileSync(path.join(tmp, 'd', 'nested.txt'), 'x');
    const r = await deleteFileTool.execute(
      { path: 'd', recursive: true },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'd'))).toBe(false);
  });

  it('reports not_found when the path does not exist', async () => {
    const r = await deleteFileTool.execute({ path: 'missing' }, { ...ctx, projectRoot: tmp });
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('not_found');
  });
});
