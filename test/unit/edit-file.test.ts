/**
 * Edit File Tool Tests
 *
 * These tests cover the editFileTool's behavior in various scenarios, including:
 * - Replacing a single occurrence of text
 * - Handling ambiguous replacements without replaceAll flag
 * - Replacing all occurrences when replaceAll flag is set
 * - Erroring when the oldText is not found in the file
 *
 * The tests use a temporary directory to create and manipulate test files, ensuring that they do not affect the actual filesystem. Each test case sets up the necessary file content, executes the tool, and then asserts the expected outcomes.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { editFileTool } from '../../src/tools/edit-file';

describe('edit_file tool', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-edit-'));
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'hello world\nsecond hello\n');
  });
  afterAll(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  const ctx = {
    taskId: 't',
    projectId: 'p',
    projectRoot: '',
    traceId: 'r',
    runId: 'r',
  };

  it('replaces a single occurrence', async () => {
    const r = await editFileTool.execute(
      { path: 'a.txt', oldText: 'second hello', newText: 'second world' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(fs.readFileSync(path.join(tmp, 'a.txt'), 'utf8')).toContain('second world');
  });

  it('refuses ambiguous replace without replaceAll', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'hello hello hello');
    const r = await editFileTool.execute(
      { path: 'a.txt', oldText: 'hello', newText: 'hi' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('conflict');
  });

  it('replaces all when flagged', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'hello hello hello');
    const r = await editFileTool.execute(
      { path: 'a.txt', oldText: 'hello', newText: 'hi', replaceAll: true },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(fs.readFileSync(path.join(tmp, 'a.txt'), 'utf8')).toBe('hi hi hi');
  });

  it('errors when needle missing', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'something');
    const r = await editFileTool.execute(
      { path: 'a.txt', oldText: 'nope', newText: 'xx' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('not_found');
  });

  it('treats empty oldText on an empty file as a full-body write (planner pattern)', async () => {
    fs.writeFileSync(path.join(tmp, 'empty.js'), '');
    const body =
      '/** @param {number} n */\nexport const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));\n';
    const r = await editFileTool.execute(
      { path: 'empty.js', oldText: '', newText: body },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(fs.readFileSync(path.join(tmp, 'empty.js'), 'utf8')).toBe(body);
  });

  it('treats empty oldText on a missing file as a create', async () => {
    const r = await editFileTool.execute(
      { path: 'new.js', oldText: '', newText: 'export const x = 1;\n' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(true);
    expect(fs.readFileSync(path.join(tmp, 'new.js'), 'utf8')).toBe('export const x = 1;\n');
  });

  it('still rejects empty oldText on a non-empty file (ambiguous)', async () => {
    fs.writeFileSync(path.join(tmp, 'has-content.txt'), 'pre-existing');
    const r = await editFileTool.execute(
      { path: 'has-content.txt', oldText: '', newText: 'anything' },
      { ...ctx, projectRoot: tmp },
    );
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('user_input');
  });
});
