/**
 * Resource Manager Tests.
 *
 * Read/write lock semantics and the Semaphore permit counter. These
 * drive the scheduler, so any reordering here is a scheduling bug.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import { acquire, Semaphore } from '../../src/scheduler/resource-manager';

describe('read/write locks', () => {
  it('allows multiple concurrent readers', async () => {
    const r1 = await acquire('file-a', 'read');
    const r2 = await acquire('file-a', 'read');
    r1();
    r2();
    // If we got here without the second acquire hanging, readers shared the lock.
    expect(true).toBe(true);
  });

  it('blocks a writer while readers hold the lock, then runs it after release', async () => {
    const r1 = await acquire('file-b', 'read');
    let writerRan = false;
    const writerPromise = acquire('file-b', 'write').then((release) => {
      writerRan = true;
      release();
    });
    // Give the scheduler a turn; the writer should still be waiting.
    await new Promise((r) => setImmediate(r));
    expect(writerRan).toBe(false);
    r1();
    await writerPromise;
    expect(writerRan).toBe(true);
  });

  it('serializes writers on the same key', async () => {
    const w1 = await acquire('file-c', 'write');
    let w2Ran = false;
    const w2Promise = acquire('file-c', 'write').then((release) => {
      w2Ran = true;
      release();
    });
    await new Promise((r) => setImmediate(r));
    expect(w2Ran).toBe(false);
    w1();
    await w2Promise;
    expect(w2Ran).toBe(true);
  });
});

describe('Semaphore', () => {
  it('grants up to max permits immediately', async () => {
    const s = new Semaphore(3);
    const r1 = await s.acquire();
    const r2 = await s.acquire();
    const r3 = await s.acquire();
    expect(typeof r1).toBe('function');
    r1();
    r2();
    r3();
  });

  it('blocks beyond max and wakes on release', async () => {
    const s = new Semaphore(1);
    const r1 = await s.acquire();
    let granted = false;
    const p = s.acquire().then((release) => {
      granted = true;
      release();
    });
    await new Promise((r) => setImmediate(r));
    expect(granted).toBe(false);
    r1();
    await p;
    expect(granted).toBe(true);
  });
});
