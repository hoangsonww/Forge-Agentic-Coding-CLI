/**
 * Read File Tool Tests.
 *
 * Covers the read_file tool's sandboxed file-reading behavior, including
 * the truncation logic, line-range slicing, non-file rejection, and
 * error classification for missing paths.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readFileTool } from '../../src/tools/read-file';

describe('read_file tool', () => {
  let tmp: string;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-read-'));
    fs.writeFileSync(path.join(tmp, 'lines.txt'), 'alpha\nbeta\ngamma\ndelta\nepsilon\n');
    fs.writeFileSync(path.join(tmp, 'big.txt'), 'x'.repeat(8000));
    fs.mkdirSync(path.join(tmp, 'somedir'));
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

  it('reads a file and counts lines', async () => {
    const r = await readFileTool.execute({ path: 'lines.txt' }, { ...ctx, projectRoot: tmp });
    expect(r.success).toBe(true);
    expect(r.output?.content.startsWith('alpha')).toBe(true);
    expect(r.output?.truncated).toBe(false);
  });

  it('slices by startLine/endLine', async () => {
    const r = await readFileTool.execute(
      { path: 'lines.txt', startLine: 2, endLine: 3 },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(r.output?.content).toBe('beta\ngamma');
  });

  it('flags truncated when content exceeds maxBytes', async () => {
    const r = await readFileTool.execute(
      { path: 'big.txt', maxBytes: 100 },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(r.output?.truncated).toBe(true);
    expect(r.output?.content.length).toBe(100);
  });

  it('rejects reading a directory', async () => {
    const r = await readFileTool.execute({ path: 'somedir' }, { ...ctx, projectRoot: tmp });
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('tool_error');
  });

  it('surfaces an error for missing files', async () => {
    const r = await readFileTool.execute({ path: 'nope.txt' }, { ...ctx, projectRoot: tmp });
    expect(r.success).toBe(false);
    expect(r.error).toBeDefined();
  });
});
