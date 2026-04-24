/**
 * Per-process file mutex + atomic write primitives.
 *
 * File-editing tools (write_file, edit_file) are otherwise a naive
 * read-modify-write: two concurrent tool calls on the same path would race
 * — one edit silently overwrites the other. We also want writes to be
 * *atomic* from the perspective of any reader (no half-written bytes).
 *
 * Scope:
 *   - Serializes ONLY within this forge process. Two separate `forge run`
 *     invocations are already extremely unusual against the same working
 *     tree and are left to OS-level semantics (POSIX rename is atomic, so
 *     concurrent readers never observe a torn write even cross-process).
 *   - Writes go through a `{dir}/.{basename}.forge-tmp.{pid}.{rand}` temp
 *     file and then `fs.renameSync` onto the final path — POSIX guarantees
 *     rename-within-a-filesystem is atomic.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Per-path mutex. Each entry is a Promise chain; new callers `await` the
// previous tail and append themselves. The map entry is cleared when the
// chain drains so we don't leak memory for files touched once and never again.
const inflight = new Map<string, Promise<unknown>>();

/**
 * Run `fn` with exclusive access to `absPath` within this process. Serializes
 * all callers that hand in the same path. The function is re-entrant-unsafe:
 * do NOT call `withFileLock` recursively on the same path from within `fn`
 * or you will deadlock.
 */
export const withFileLock = async <T>(absPath: string, fn: () => Promise<T>): Promise<T> => {
  const key = path.resolve(absPath);
  const prev = inflight.get(key) ?? Promise.resolve();
  // The next holder waits on the previous tail.
  const run = prev.catch(() => undefined).then(fn);
  // Chain cleanup so we don't leak the last holder.
  const cleanup = run
    .catch(() => undefined)
    .finally(() => {
      if (inflight.get(key) === cleanup) inflight.delete(key);
    });
  inflight.set(key, cleanup);
  return run;
};

/**
 * Atomic write: writes `content` to a sibling temp file in the same directory
 * (rename-within-fs is atomic on POSIX; cross-fs rename on Windows is too,
 * though not technically crash-atomic there). Concurrent readers either see
 * the pre-write content or the full post-write content — never a torn read.
 *
 * NB: intentionally synchronous to match the existing fs.*Sync usage in
 * edit_file / write_file. Switching to async would ripple through both tools
 * and their tests; not worth it for the microsecond-scale difference.
 */
export const writeAtomic = (absPath: string, content: string): void => {
  const dir = path.dirname(absPath);
  const base = path.basename(absPath);
  const tmp = path.join(
    dir,
    `.${base}.forge-tmp.${process.pid}.${crypto.randomBytes(6).toString('hex')}`,
  );
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, absPath);
  } catch (err) {
    // Best-effort cleanup: if rename failed the temp file is orphaned.
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
    throw err;
  }
};

/** Exposed for tests — wipes the per-path mutex map. */
export const _resetFileLocksForTest = (): void => inflight.clear();
