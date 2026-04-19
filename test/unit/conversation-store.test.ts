import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  acquireLock,
  atomicAppendLine,
  atomicAppendLineSync,
  readAllLines,
  readSince,
  watchConversation,
} from '../../src/persistence/conversation-store';

let tmp = '';
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-convstore-'));
});
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('conversation-store — atomic append', () => {
  it('round-trips a single JSON line', async () => {
    const file = path.join(tmp, 'a.jsonl');
    await atomicAppendLine(file, JSON.stringify({ n: 1 }));
    expect(readAllLines(file)).toEqual([{ n: 1 }]);
  });

  it('preserves event order across many sequential appends', async () => {
    const file = path.join(tmp, 'a.jsonl');
    for (let i = 0; i < 200; i++) {
      await atomicAppendLine(file, JSON.stringify({ n: i }));
    }
    const items = readAllLines<{ n: number }>(file);
    expect(items).toHaveLength(200);
    for (let i = 0; i < 200; i++) expect(items[i].n).toBe(i);
  });

  it('accepts lines with embedded JSON special chars', async () => {
    const file = path.join(tmp, 'a.jsonl');
    const payload = { s: '"quoted"\nnewline\t\\backslash' };
    await atomicAppendLine(file, JSON.stringify(payload));
    expect(readAllLines(file)).toEqual([payload]);
  });

  it('auto-adds a trailing newline if missing', async () => {
    const file = path.join(tmp, 'a.jsonl');
    await atomicAppendLine(file, '{"a":1}'); // no \n
    await atomicAppendLine(file, '{"b":2}');
    expect(readAllLines(file)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('works for large lines (> 4 KiB) via lockfile path', async () => {
    const file = path.join(tmp, 'a.jsonl');
    const big = { s: 'x'.repeat(8192) };
    await atomicAppendLine(file, JSON.stringify(big));
    await atomicAppendLine(file, JSON.stringify({ tail: true }));
    const items = readAllLines<Record<string, unknown>>(file);
    expect(items).toHaveLength(2);
    expect((items[0] as { s: string }).s).toHaveLength(8192);
    expect(items[1]).toEqual({ tail: true });
  });

  it('sync variant produces identical results', () => {
    const file = path.join(tmp, 'a.jsonl');
    atomicAppendLineSync(file, JSON.stringify({ n: 1 }));
    atomicAppendLineSync(file, JSON.stringify({ n: 2 }));
    expect(readAllLines(file)).toEqual([{ n: 1 }, { n: 2 }]);
  });
});

describe('conversation-store — concurrent appends', () => {
  it('serializes 50 concurrent writers without loss or corruption', async () => {
    const file = path.join(tmp, 'concurrent.jsonl');
    const writers = Array.from({ length: 50 }, (_, i) =>
      atomicAppendLine(file, JSON.stringify({ id: i, payload: 'x'.repeat(256) })),
    );
    await Promise.all(writers);
    const items = readAllLines<{ id: number }>(file);
    expect(items).toHaveLength(50);
    const ids = new Set(items.map((x) => x.id));
    expect(ids.size).toBe(50);
  });

  it('handles a burst of large lines under the lock without truncation', async () => {
    const file = path.join(tmp, 'big-burst.jsonl');
    const writers = Array.from({ length: 20 }, (_, i) =>
      atomicAppendLine(file, JSON.stringify({ id: i, bulk: 'y'.repeat(6000) })),
    );
    await Promise.all(writers);
    const items = readAllLines<{ id: number; bulk: string }>(file);
    expect(items).toHaveLength(20);
    for (const item of items) expect(item.bulk).toHaveLength(6000);
  });
});

describe('conversation-store — locking', () => {
  it('acquire + release lets a second acquirer proceed', async () => {
    const file = path.join(tmp, 'l.jsonl');
    const first = await acquireLock(file);
    let secondAcquired = false;
    const promise = acquireLock(file).then((lock) => {
      secondAcquired = true;
      return lock;
    });
    await wait(50);
    expect(secondAcquired).toBe(false);
    await first.release();
    const second = await promise;
    expect(secondAcquired).toBe(true);
    await second.release();
  });

  it('recovers a stale lock after the configured timeout', async () => {
    const file = path.join(tmp, 'stale.jsonl');
    // Simulate a crashed writer that left the lock dir behind.
    fs.mkdirSync(`${file}.lock`);
    // Backdate its mtime far past the timeout.
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(`${file}.lock`, old, old);
    const lock = await acquireLock(file, 500);
    await lock.release();
  });
});

describe('conversation-store — reads', () => {
  it('skips malformed lines without failing the whole read', () => {
    const file = path.join(tmp, 'bad.jsonl');
    fs.writeFileSync(file, '{"ok":1}\nnot-json\n{"ok":2}\n');
    const items = readAllLines<{ ok: number }>(file);
    expect(items).toEqual([{ ok: 1 }, { ok: 2 }]);
  });

  it('handles a writer in-progress (trailing partial line)', () => {
    const file = path.join(tmp, 'partial.jsonl');
    fs.writeFileSync(file, '{"ok":1}\n{"inc'); // unterminated
    expect(readAllLines(file)).toEqual([{ ok: 1 }]);
  });

  it('returns [] for missing files', () => {
    expect(readAllLines(path.join(tmp, 'never.jsonl'))).toEqual([]);
  });
});

describe('conversation-store — delta reads', () => {
  it('only parses complete lines since the given offset', async () => {
    const file = path.join(tmp, 'delta.jsonl');
    await atomicAppendLine(file, JSON.stringify({ n: 1 }));
    const first = readSince<{ n: number }>(file, 0);
    expect(first.items).toEqual([{ n: 1 }]);
    expect(first.offset).toBeGreaterThan(0);

    await atomicAppendLine(file, JSON.stringify({ n: 2 }));
    const second = readSince<{ n: number }>(file, first.offset);
    expect(second.items).toEqual([{ n: 2 }]);
    expect(second.offset).toBeGreaterThan(first.offset);

    // No new data.
    const third = readSince<{ n: number }>(file, second.offset);
    expect(third.items).toEqual([]);
    expect(third.offset).toBe(second.offset);
  });

  it('never returns a partial line (half-written tail is buffered)', () => {
    const file = path.join(tmp, 'delta-partial.jsonl');
    fs.writeFileSync(file, '{"a":1}\n{"b":');
    const r = readSince<Record<string, number>>(file, 0);
    expect(r.items).toEqual([{ a: 1 }]);
    // Offset advances only past the completed line so we re-read the tail next time.
    expect(r.offset).toBe(Buffer.byteLength('{"a":1}\n'));
  });
});

describe('conversation-store — watcher', () => {
  it('fires on append and returns the new events', async () => {
    const file = path.join(tmp, 'watch.jsonl');
    fs.writeFileSync(file, '');
    const seen: Record<string, number>[] = [];
    const watcher = watchConversation<Record<string, number>>(file, (items) => {
      seen.push(...items);
    });
    await wait(50);
    await atomicAppendLine(file, JSON.stringify({ x: 1 }));
    // Wait for fs.watch + debounce.
    for (let i = 0; i < 40 && seen.length === 0; i++) await wait(25);
    expect(seen).toContainEqual({ x: 1 });
    watcher.close();
  });

  it('dedupes events across multiple appends (delta read)', async () => {
    const file = path.join(tmp, 'watch2.jsonl');
    fs.writeFileSync(file, '');
    const seen: Record<string, number>[] = [];
    const watcher = watchConversation<Record<string, number>>(file, (items) => {
      seen.push(...items);
    });
    await wait(50);
    await atomicAppendLine(file, JSON.stringify({ n: 1 }));
    await wait(80);
    await atomicAppendLine(file, JSON.stringify({ n: 2 }));
    for (let i = 0; i < 40 && seen.length < 2; i++) await wait(25);
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
    watcher.close();
  });

  it('stops firing after close', async () => {
    const file = path.join(tmp, 'watch3.jsonl');
    fs.writeFileSync(file, '');
    let count = 0;
    const watcher = watchConversation(file, () => (count += 1));
    watcher.close();
    await atomicAppendLine(file, JSON.stringify({ n: 1 }));
    await wait(150);
    expect(count).toBe(0);
  });
});
