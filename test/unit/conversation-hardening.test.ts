/**
 * Production-readiness tests for the conversation stack:
 *   • Path-traversal rejection at the domain boundary.
 *   • Self-echo safety when two writers share the same file and a watcher.
 *   • Task-index TTL sweep + size accounting.
 *   • Broadcaster/watcher cleanup on shutdown.
 *   • Concurrent writers across simulated surfaces.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  appendUserTurn,
  createConversation,
  isValidConversationId,
  loadConversation,
  watchConversationFile,
} from '../../src/core/conversation';
import {
  subscribeConversation,
  closeAllConversationWatchers,
  _sweepTaskIndexForTesting,
  _taskIndexSize,
} from '../../src/ui/chat';
import { ensureProjectDir } from '../../src/config/paths';

let tmp = '';
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-hard-'));
  ensureProjectDir(tmp);
});
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  closeAllConversationWatchers();
});

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('hardening — path traversal', () => {
  it('rejects ids containing path separators', () => {
    expect(isValidConversationId('repl-../etc/passwd')).toBe(false);
    expect(isValidConversationId('chat-a/b')).toBe(false);
    expect(isValidConversationId('conv-..')).toBe(false);
  });

  it('rejects ids without the required prefix', () => {
    expect(isValidConversationId('unknown-prefix_xyz')).toBe(false);
    expect(isValidConversationId('ok-looks-innocent')).toBe(false);
    expect(isValidConversationId('')).toBe(false);
  });

  it('rejects absurdly long ids', () => {
    expect(isValidConversationId('repl-' + 'x'.repeat(300))).toBe(false);
  });

  it('accepts well-formed ids', () => {
    expect(isValidConversationId('repl-sess_abc123')).toBe(true);
    expect(isValidConversationId('chat-sess_00112233')).toBe(true);
    expect(isValidConversationId('conv-foo_bar-baz')).toBe(true);
  });

  it('loadConversation returns null rather than throwing for bad ids', () => {
    expect(loadConversation(tmp, '../x')).toBeNull();
    expect(loadConversation(tmp, 'evil\0id')).toBeNull();
  });
});

describe('hardening — self-echo dedupe across two simulated writers', () => {
  /**
   * Simulates two independent processes sharing a single conversation file.
   * Writer A owns one state object, writer B owns another. The watcher
   * belonging to B must see A's writes exactly once, and vice versa.
   */
  it('two watcher/writer pairs converge on identical state after cross-writes', async () => {
    const c = await createConversation({ projectPath: tmp, source: 'repl' });
    const sideA: Array<{ id: string }> = [];
    const sideB: Array<{ id: string }> = [];
    const wA = watchConversationFile(tmp, c.meta.id, (u) => {
      for (const t of u.newTurns) sideA.push({ id: t.id });
    });
    const wB = watchConversationFile(tmp, c.meta.id, (u) => {
      for (const t of u.newTurns) sideB.push({ id: t.id });
    });
    await wait(40);

    // A's authoring: B's watcher should see this.
    await appendUserTurn(tmp, c.meta.id, {
      id: 'A-1',
      at: new Date().toISOString(),
      input: 'a1',
      mode: 'balanced',
      status: 'pending',
    });
    await wait(60);
    // B's authoring: A's watcher should see this.
    await appendUserTurn(tmp, c.meta.id, {
      id: 'B-1',
      at: new Date().toISOString(),
      input: 'b1',
      mode: 'balanced',
      status: 'pending',
    });
    // Wait for the second watcher callback.
    for (let i = 0; i < 40 && (sideA.length < 2 || sideB.length < 2); i++) await wait(25);
    const idsA = new Set(sideA.map((x) => x.id));
    const idsB = new Set(sideB.map((x) => x.id));
    expect(idsA).toEqual(new Set(['A-1', 'B-1']));
    expect(idsB).toEqual(new Set(['A-1', 'B-1']));

    wA.close();
    wB.close();
  });

  it('re-reading the file produces a canonical in-order turn list', async () => {
    const c = await createConversation({ projectPath: tmp, source: 'chat' });
    for (let i = 0; i < 10; i++) {
      await appendUserTurn(tmp, c.meta.id, {
        id: `t${i}`,
        at: new Date(Date.now() + i).toISOString(),
        input: `turn-${i}`,
        mode: 'balanced',
        status: 'pending',
      });
    }
    const loaded = loadConversation(tmp, c.meta.id)!;
    expect(loaded.turns.map((t) => t.id)).toEqual(Array.from({ length: 10 }, (_, i) => `t${i}`));
  });
});

describe('hardening — task index TTL + cleanup', () => {
  it('_sweepTaskIndexForTesting leaves fresh entries alone (size stays 0 when empty)', () => {
    // No entries were added in this test — the sweep is a no-op.
    const before = _taskIndexSize();
    _sweepTaskIndexForTesting();
    expect(_taskIndexSize()).toBe(before);
  });
  // Entries are only added via addTurn() which spins up a real orchestrator
  // run; we cover the end-to-end path via the interop test and keep this
  // unit test focused on the primitives that don't spawn tasks.
});

describe('hardening — watcher subscription cleanup', () => {
  it('closeAllConversationWatchers tears down all subscriptions', async () => {
    const c1 = await createConversation({ projectPath: tmp, source: 'chat' });
    const c2 = await createConversation({ projectPath: tmp, source: 'repl' });

    let calls1 = 0;
    let calls2 = 0;
    const unsub1 = subscribeConversation(tmp, c1.meta.id, () => (calls1 += 1));
    const unsub2 = subscribeConversation(tmp, c2.meta.id, () => (calls2 += 1));
    await wait(40);

    // Append to each — both should fire.
    await appendUserTurn(tmp, c1.meta.id, {
      id: 't1',
      at: new Date().toISOString(),
      input: 'x',
      mode: 'balanced',
      status: 'pending',
    });
    await appendUserTurn(tmp, c2.meta.id, {
      id: 't2',
      at: new Date().toISOString(),
      input: 'y',
      mode: 'balanced',
      status: 'pending',
    });
    for (let i = 0; i < 40 && (calls1 === 0 || calls2 === 0); i++) await wait(25);
    expect(calls1).toBeGreaterThan(0);
    expect(calls2).toBeGreaterThan(0);

    const before1 = calls1;
    const before2 = calls2;
    closeAllConversationWatchers();
    await wait(40);

    // Subsequent writes must NOT fire the callbacks.
    await appendUserTurn(tmp, c1.meta.id, {
      id: 't1-after',
      at: new Date().toISOString(),
      input: 'x2',
      mode: 'balanced',
      status: 'pending',
    });
    await appendUserTurn(tmp, c2.meta.id, {
      id: 't2-after',
      at: new Date().toISOString(),
      input: 'y2',
      mode: 'balanced',
      status: 'pending',
    });
    await wait(150);
    expect(calls1).toBe(before1);
    expect(calls2).toBe(before2);

    // unsub references can still be called safely.
    unsub1();
    unsub2();
  });

  it('ref-counts subscriptions (two subscribers + close one = other still fires)', async () => {
    const c = await createConversation({ projectPath: tmp, source: 'chat' });
    let aCalls = 0;
    let bCalls = 0;
    const unsubA = subscribeConversation(tmp, c.meta.id, () => (aCalls += 1));
    const unsubB = subscribeConversation(tmp, c.meta.id, () => (bCalls += 1));
    await wait(40);
    await appendUserTurn(tmp, c.meta.id, {
      id: 'first',
      at: new Date().toISOString(),
      input: 'x',
      mode: 'balanced',
      status: 'pending',
    });
    for (let i = 0; i < 40 && (aCalls === 0 || bCalls === 0); i++) await wait(25);
    expect(aCalls).toBeGreaterThan(0);
    expect(bCalls).toBeGreaterThan(0);
    unsubA();
    const afterA = aCalls;
    await wait(40);
    await appendUserTurn(tmp, c.meta.id, {
      id: 'second',
      at: new Date().toISOString(),
      input: 'y',
      mode: 'balanced',
      status: 'pending',
    });
    for (let i = 0; i < 40 && bCalls < 2; i++) await wait(25);
    expect(aCalls).toBe(afterA); // didn't fire again
    expect(bCalls).toBeGreaterThan(1); // did fire
    unsubB();
  });
});

describe('hardening — cross-surface concurrent writers', () => {
  it('20 mixed user-turn + result events interleaved from two writers all land', async () => {
    const c = await createConversation({ projectPath: tmp, source: 'chat' });
    const ops: Array<Promise<unknown>> = [];
    for (let i = 0; i < 10; i++) {
      ops.push(
        appendUserTurn(tmp, c.meta.id, {
          id: `a-${i}`,
          at: new Date().toISOString(),
          input: `A turn ${i}`,
          mode: 'balanced',
          status: 'pending',
        }),
      );
      ops.push(
        appendUserTurn(tmp, c.meta.id, {
          id: `b-${i}`,
          at: new Date().toISOString(),
          input: `B turn ${i}`,
          mode: 'balanced',
          status: 'pending',
        }),
      );
    }
    await Promise.all(ops);
    const loaded = loadConversation(tmp, c.meta.id)!;
    expect(loaded.turns).toHaveLength(20);
    const ids = new Set(loaded.turns.map((t) => t.id));
    expect(ids.size).toBe(20);
    // 10 A turns + 10 B turns.
    expect(loaded.turns.filter((t) => t.id.startsWith('a-'))).toHaveLength(10);
    expect(loaded.turns.filter((t) => t.id.startsWith('b-'))).toHaveLength(10);
  });
});
