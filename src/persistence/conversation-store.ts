/**
 * Concurrency-safe JSONL store for conversation files.
 *
 * Shared between the CLI REPL and the UI chat surfaces so multiple writers
 * (multiple terminals, multiple browser tabs, a browser tab + a CLI REPL,
 * tasks spawned by subagents, etc.) can safely append to the same file and
 * observe each other's writes in near real-time.
 *
 * Safety model:
 *   • Appends under PIPE_BUF (4 KiB on Linux/macOS) are guaranteed atomic by
 *     POSIX O_APPEND: the kernel updates the offset and writes the bytes as
 *     one operation, so interleaved writers never corrupt each other's lines.
 *   • Larger lines acquire a cooperative lock (mkdir-based, works across
 *     processes) before appending.
 *   • Readers never acquire locks. They open, read-to-EOF, split on '\n',
 *     and skip malformed lines. A writer half-way through writing produces
 *     at worst a trailing line without '\n' that is skipped until the next
 *     read.
 *   • Stale locks (process crashed with lock held) are detected by mtime and
 *     recovered automatically.
 *
 * The module has no knowledge of domain types — it deals in strings and
 * `Record<string, unknown>` events. Domain typing lives in
 * src/core/conversation.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------- Constants ----------

/** POSIX atomic write size (PIPE_BUF). Lines up to this many bytes can be
 * appended without a lock; larger lines take the lock path. */
const ATOMIC_APPEND_LIMIT = 4096;

/** Default lock acquisition timeout. After this, we assume the lock is stale. */
const LOCK_TIMEOUT_MS = 5_000;

/** Debounce window for the watcher so a burst of appends coalesces. */
const WATCH_DEBOUNCE_MS = 40;

// ---------- Low-level: locking ----------

export interface Lock {
  release(): Promise<void>;
}

/**
 * Acquire a cooperative lock on `target` using an adjacent `<target>.lock`
 * directory. Atomic `mkdir` is the only POSIX primitive we need. If the lock
 * has been held longer than `timeoutMs`, treat it as stale and steal it.
 */
export const acquireLock = async (target: string, timeoutMs = LOCK_TIMEOUT_MS): Promise<Lock> => {
  const lockDir = `${target}.lock`;
  const start = Date.now();
  // random small sleep to reduce herd contention
  const backoff = () => new Promise<void>((r) => setTimeout(r, 8 + Math.random() * 32));
  for (;;) {
    try {
      await fs.promises.mkdir(lockDir);
      return {
        release: async () => {
          try {
            await fs.promises.rmdir(lockDir);
          } catch {
            /* best effort */
          }
        },
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw err;
      // Someone holds the lock. Check if it's stale.
      try {
        const stat = await fs.promises.stat(lockDir);
        if (Date.now() - stat.mtimeMs > timeoutMs) {
          // Stale — try to remove. Racy with the original holder coming back,
          // but safer than blocking forever.
          await fs.promises.rmdir(lockDir).catch(() => undefined);
          continue;
        }
      } catch {
        // lock vanished between our mkdir attempt and stat; loop retries
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(`conversation-store: timeout acquiring lock on ${target}`);
      }
      await backoff();
    }
  }
};

// ---------- Low-level: append ----------

/** Append a single line (newline added if absent). Safe under concurrent
 * writers. Small lines use POSIX atomic append; large lines take a lock. */
export const atomicAppendLine = async (filePath: string, line: string): Promise<void> => {
  const body = line.endsWith('\n') ? line : line + '\n';
  const bytes = Buffer.byteLength(body, 'utf8');
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  if (bytes <= ATOMIC_APPEND_LIMIT) {
    // O_APPEND + single write is atomic up to PIPE_BUF on all modern POSIX
    // filesystems. Node's fs.appendFile uses O_APPEND under the hood.
    await fs.promises.appendFile(filePath, body, 'utf8');
    return;
  }
  // Large line → take the lock.
  const lock = await acquireLock(filePath);
  try {
    await fs.promises.appendFile(filePath, body, 'utf8');
  } finally {
    await lock.release();
  }
};

/** Sync version for code paths that cannot await (e.g. task-runner callbacks
 * on task completion). Same semantics; uses sync fs. */
export const atomicAppendLineSync = (filePath: string, line: string): void => {
  const body = line.endsWith('\n') ? line : line + '\n';
  const bytes = Buffer.byteLength(body, 'utf8');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (bytes <= ATOMIC_APPEND_LIMIT) {
    fs.appendFileSync(filePath, body, { encoding: 'utf8' });
    return;
  }
  // For the sync path we accept a short busy-spin rather than shelling out a
  // Promise to stay call-site-cheap. Large events are rare on this path.
  const lockDir = `${filePath}.lock`;
  const start = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      try {
        const stat = fs.statSync(lockDir);
        if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) {
          fs.rmdirSync(lockDir);
          continue;
        }
      } catch {
        /* vanished, retry */
      }
      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        throw new Error(`conversation-store: sync lock timeout on ${filePath}`);
      }
      // tiny spin — no setTimeout in sync context
      const tgt = Date.now() + 10;
      while (Date.now() < tgt) {
        /* spin */
      }
    }
  }
  try {
    fs.appendFileSync(filePath, body, { encoding: 'utf8' });
  } finally {
    try {
      fs.rmdirSync(lockDir);
    } catch {
      /* best effort */
    }
  }
};

// ---------- Reading ----------

/** Read every complete JSON line from a file. Missing file → []. Corrupted
 * lines are skipped with no error. Safe to run while another process is
 * appending. */
export const readAllLines = <T = unknown>(filePath: string): T[] => {
  if (!fs.existsSync(filePath)) return [];
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const out: T[] = [];
  // Split on \n — an unterminated trailing line is dropped (likely a writer
  // half-way through). On the next read we'll see the completed line.
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      /* skip malformed */
    }
  }
  return out;
};

/** Delta read: given a previous offset, return only NEW complete lines since
 * that offset plus the updated offset. Used by watchers to avoid re-parsing
 * the entire file on every change. */
export const readSince = <T = unknown>(
  filePath: string,
  offset: number,
): { items: T[]; offset: number } => {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { items: [], offset: 0 };
  }
  if (stat.size <= offset) return { items: [], offset: stat.size };
  let text = '';
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(stat.size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset);
    text = buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
  // If the last chunk doesn't end in '\n', back off to the last newline so
  // we don't parse a half-written line. The unread tail stays for next call.
  const lastNl = text.lastIndexOf('\n');
  let endBoundary = stat.size;
  if (lastNl === -1) {
    // No newline in the delta — nothing parsable yet.
    return { items: [], offset };
  }
  if (lastNl !== text.length - 1) {
    text = text.slice(0, lastNl + 1);
    endBoundary = offset + Buffer.byteLength(text, 'utf8');
  }
  const items: T[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      items.push(JSON.parse(line) as T);
    } catch {
      /* skip malformed */
    }
  }
  return { items, offset: endBoundary };
};

// ---------- Watching ----------

export interface ConversationWatcher {
  close(): void;
}

/**
 * Watch `filePath` for appended lines. Callback fires with the new events
 * decoded from JSON. Re-entrant: the callback may trigger further writes to
 * the same file without causing reentrancy bugs (the watcher dedupes based
 * on byte offset, not event count).
 *
 * Uses fs.watch with a fs.watchFile fallback — on some network filesystems
 * (and inside Docker mounts on macOS) fs.watch does not fire reliably.
 */
export const watchConversation = <T = unknown>(
  filePath: string,
  onAppend: (items: T[]) => void,
): ConversationWatcher => {
  let offset = 0;
  try {
    offset = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  } catch {
    offset = 0;
  }

  let timer: NodeJS.Timeout | null = null;
  const trigger = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        const { items, offset: next } = readSince<T>(filePath, offset);
        offset = next;
        if (items.length) onAppend(items);
      } catch {
        /* swallow — better silence than crash for a watcher */
      }
    }, WATCH_DEBOUNCE_MS);
  };

  // Ensure the file exists so fs.watch doesn't throw ENOENT on some platforms.
  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '', { flag: 'a' });
    }
  } catch {
    /* non-fatal */
  }

  let watcher: fs.FSWatcher | null = null;
  try {
    watcher = fs.watch(filePath, { persistent: false }, trigger);
    watcher.on('error', () => {
      // Fall back to polling below — error once means fs.watch is unreliable
      // for this file (network fs, deleted, etc).
      if (watcher) {
        watcher.close();
        watcher = null;
      }
      fs.watchFile(filePath, { persistent: false, interval: 200 }, trigger);
    });
  } catch {
    fs.watchFile(filePath, { persistent: false, interval: 200 }, trigger);
  }

  return {
    close() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (watcher) {
        try {
          watcher.close();
        } catch {
          /* ignore */
        }
      } else {
        fs.unwatchFile(filePath);
      }
    },
  };
};

// ---------- Utilities useful to callers ----------

/** Return the current byte-length of the file, or 0 if missing. */
export const fileSize = (filePath: string): number => {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
};
