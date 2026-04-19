import { loadGlobalConfig } from '../config/loader';

/**
 * In-process resource manager. Single-writer file locks, model GPU locks,
 * and per-task count limits. For a future multi-process daemon, this becomes
 * an IPC service; the API stays identical.
 */

type LockType = 'read' | 'write' | 'exclusive';

interface LockState {
  writers: number;
  readers: number;
  waiters: Array<{ type: LockType; resolve: () => void }>;
}

const locks = new Map<string, LockState>();

const ensure = (key: string): LockState => {
  let s = locks.get(key);
  if (!s) {
    s = { writers: 0, readers: 0, waiters: [] };
    locks.set(key, s);
  }
  return s;
};

const tryAcquire = (state: LockState, type: LockType): boolean => {
  if (type === 'read') {
    if (state.writers === 0) {
      state.readers++;
      return true;
    }
    return false;
  }
  if (state.writers === 0 && state.readers === 0) {
    state.writers++;
    return true;
  }
  return false;
};

export const acquire = async (key: string, type: LockType): Promise<() => void> => {
  const state = ensure(key);
  if (tryAcquire(state, type)) {
    return () => release(key, type);
  }
  return new Promise((resolve) => {
    state.waiters.push({
      type,
      resolve: () => {
        if (tryAcquire(state, type)) {
          resolve(() => release(key, type));
        } else {
          // Shouldn't happen but safe-guard: re-queue.
          state.waiters.push({ type, resolve: () => {} });
        }
      },
    });
  });
};

const release = (key: string, type: LockType): void => {
  const state = ensure(key);
  if (type === 'read') state.readers = Math.max(0, state.readers - 1);
  else state.writers = Math.max(0, state.writers - 1);

  // Wake waiters. Prefer writers first (to avoid writer starvation).
  const nextWriter = state.waiters.findIndex((w) => w.type === 'write' || w.type === 'exclusive');
  if (state.readers === 0 && state.writers === 0 && nextWriter >= 0) {
    const w = state.waiters.splice(nextWriter, 1)[0];
    w.resolve();
    return;
  }
  if (state.writers === 0) {
    // Drain readers
    const readers = state.waiters.filter((w) => w.type === 'read');
    state.waiters = state.waiters.filter((w) => w.type !== 'read');
    for (const r of readers) r.resolve();
  }
};

export interface SemaphoreState {
  permits: number;
  max: number;
  waiters: Array<() => void>;
}

export class Semaphore {
  private state: SemaphoreState;
  constructor(max: number) {
    this.state = { permits: max, max, waiters: [] };
  }
  async acquire(): Promise<() => void> {
    if (this.state.permits > 0) {
      this.state.permits--;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.state.waiters.push(() => {
        this.state.permits--;
        resolve(() => this.release());
      });
    });
  }
  private release(): void {
    this.state.permits++;
    const next = this.state.waiters.shift();
    if (next) next();
  }
}

const cfg = loadGlobalConfig();
export const concurrency = {
  maxTasks: new Semaphore(cfg.concurrency.maxTasks),
  maxGpuTasks: new Semaphore(cfg.concurrency.maxGpuTasks),
  maxFileWrites: new Semaphore(cfg.concurrency.maxFileWrites),
};
