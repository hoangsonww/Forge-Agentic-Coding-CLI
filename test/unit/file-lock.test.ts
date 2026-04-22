/**
 * Concurrency guarantees for the edit_file / write_file tools.
 *
 * The bug these tests pin: a naive read-modify-write is a TOCTOU race. If
 * call A reads content X, call B reads content X, A writes X' and THEN B
 * writes X'' — A's change is silently lost. The fix serializes callers via
 * an in-process per-path mutex and commits via an atomic temp+rename.
 *
 * These tests fire off many concurrent tool calls against a single file
 * and assert that every intended change is present in the final content.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { editFileTool } from '../../src/tools/edit-file';
import { writeFileTool } from '../../src/tools/write-file';
import { withFileLock, writeAtomic, _resetFileLocksForTest } from '../../src/sandbox/file-lock';

const ctxFor = (root: string) => ({
  taskId: 't',
  projectId: 'p',
  projectRoot: root,
  traceId: 'r',
  runId: 'r',
});

describe('file-lock primitive', () => {
  beforeEach(() => _resetFileLocksForTest());

  it('serializes callers on the same path (observable order)', async () => {
    const order: number[] = [];
    const makeJob = (n: number, delayMs: number) => async () => {
      await new Promise((r) => setTimeout(r, delayMs));
      order.push(n);
    };
    // Kick off in reverse order but all lock the same path — despite the
    // first task sleeping longer, all three must still run one at a time
    // in submission order.
    await Promise.all([
      withFileLock('/tmp/lock-demo', makeJob(1, 30)),
      withFileLock('/tmp/lock-demo', makeJob(2, 10)),
      withFileLock('/tmp/lock-demo', makeJob(3, 0)),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('does NOT serialize callers on different paths', async () => {
    const order: string[] = [];
    await Promise.all([
      withFileLock('/tmp/path-a', async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push('a');
      }),
      withFileLock('/tmp/path-b', async () => {
        order.push('b');
      }),
    ]);
    // b is allowed to finish before a because they're on different paths.
    expect(order).toEqual(['b', 'a']);
  });

  it('propagates errors from the critical section', async () => {
    await expect(
      withFileLock('/tmp/lock-err', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // And the next acquirer still runs — the failure doesn't deadlock the key.
    let ran = false;
    await withFileLock('/tmp/lock-err', async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});

describe('writeAtomic', () => {
  it('leaves no orphan temp files on success', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-atomic-'));
    const target = path.join(tmp, 'out.txt');
    writeAtomic(target, 'hello');
    expect(fs.readFileSync(target, 'utf8')).toBe('hello');
    // Nothing matching the temp pattern should remain.
    const leftovers = fs.readdirSync(tmp).filter((f) => f.startsWith('.out.txt.forge-tmp.'));
    expect(leftovers).toEqual([]);
  });
});

describe('edit_file under concurrent load', () => {
  it('loses no replacements when 20 edits target disjoint snippets in parallel', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-concurrent-edit-'));
    const target = path.join(tmp, 'a.txt');
    // 20 unique sentinels — zero-padded ids so no sentinel is a substring
    // of another (a substring match would trip edit_file's ambiguity guard).
    const N = 20;
    const oldSentinel = (i: number) => `<<SLOT-${String(i).padStart(3, '0')}>>`;
    const newSentinel = (i: number) => `<<DONE-${String(i).padStart(3, '0')}>>`;
    const original = Array.from({ length: N }, (_, i) => oldSentinel(i)).join('\n') + '\n';
    fs.writeFileSync(target, original);

    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        editFileTool.execute(
          { path: 'a.txt', oldText: oldSentinel(i), newText: newSentinel(i) },
          ctxFor(tmp),
        ),
      ),
    );

    expect(results.every((r) => r.success)).toBe(true);
    const final = fs.readFileSync(target, 'utf8');
    for (let i = 0; i < N; i++) {
      expect(final).toContain(newSentinel(i));
      expect(final).not.toContain(oldSentinel(i));
    }
  });

  it('two concurrent writes to the same path land one-then-other, neither is lost', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-concurrent-write-'));
    const target = path.join(tmp, 'a.txt');
    const r1 = writeFileTool.execute({ path: 'a.txt', content: 'first' }, ctxFor(tmp));
    const r2 = writeFileTool.execute({ path: 'a.txt', content: 'second' }, ctxFor(tmp));
    const [a, b] = await Promise.all([r1, r2]);
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    // The second write wins because writes serialize in submission order.
    expect(fs.readFileSync(target, 'utf8')).toBe('second');
    // And critically: the file is never a torn mix of the two contents.
    expect(['first', 'second']).toContain(fs.readFileSync(target, 'utf8'));
  });
});
