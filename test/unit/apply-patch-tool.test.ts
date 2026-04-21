/**
 * Apply Patch Tool Tests.
 *
 * Exercises the unified-diff applier against real files on disk. Covers
 * additions, deletions, context mismatch detection, multi-file hunks,
 * and the empty-patch rejection path.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyPatchTool } from '../../src/tools/apply-patch';

const ctxFor = (root: string) => ({
  taskId: 't',
  projectId: 'p',
  projectRoot: root,
  traceId: 'r',
  runId: 'r',
});

describe('apply_patch tool', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-patch-')));
  });

  it('applies a simple add+delete hunk', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'one\ntwo\nthree\n');
    const patch = [
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,3 +1,3 @@',
      ' one',
      '-two',
      '+TWO',
      ' three',
      '',
    ].join('\n');
    const r = await applyPatchTool.execute({ patch }, ctxFor(tmp));
    expect(r.success).toBe(true);
    expect(r.output?.hunksApplied).toBe(1);
    expect(fs.readFileSync(path.join(tmp, 'a.txt'), 'utf8')).toBe('one\nTWO\nthree\n');
  });

  it('rejects a patch when context does not match', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'one\nDIFFERENT\nthree\n');
    const patch = [
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,3 +1,3 @@',
      ' one',
      '-two',
      '+TWO',
      ' three',
      '',
    ].join('\n');
    const r = await applyPatchTool.execute({ patch }, ctxFor(tmp));
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('conflict');
  });

  it('errors on an empty/unrecognized patch', async () => {
    const r = await applyPatchTool.execute({ patch: '' }, ctxFor(tmp));
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('user_input');
  });

  it('creates a new file when the patch targets one that does not exist', async () => {
    const patch = [
      '--- a/new.txt',
      '+++ b/new.txt',
      '@@ -0,0 +1,2 @@',
      '+hello',
      '+world',
      '',
    ].join('\n');
    const r = await applyPatchTool.execute({ patch }, ctxFor(tmp));
    expect(r.success).toBe(true);
    expect(fs.readFileSync(path.join(tmp, 'new.txt'), 'utf8')).toContain('hello');
  });

  it('applies multi-file patches', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'A\n');
    fs.writeFileSync(path.join(tmp, 'b.txt'), 'B\n');
    const patch = [
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,1 +1,1 @@',
      '-A',
      '+AA',
      '--- a/b.txt',
      '+++ b/b.txt',
      '@@ -1,1 +1,1 @@',
      '-B',
      '+BB',
      '',
    ].join('\n');
    const r = await applyPatchTool.execute({ patch }, ctxFor(tmp));
    expect(r.success).toBe(true);
    expect(r.output?.filesChanged.sort()).toEqual(['a.txt', 'b.txt']);
    expect(r.output?.hunksApplied).toBe(2);
  });
});
