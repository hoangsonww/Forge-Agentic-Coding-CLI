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
});
