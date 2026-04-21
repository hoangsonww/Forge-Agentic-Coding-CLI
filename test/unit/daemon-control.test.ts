/**
 * Daemon Control Tests.
 *
 * Exercises daemonStatus against synthesized pid files. We don't
 * actually start the daemon — that needs a compiled server.js on disk
 * and was not a reliable unit-test target. Instead we patch the
 * exported `paths` module to point at a temp location and write pid
 * files by hand.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tmp: string;

vi.mock('../../src/config/paths', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/config/paths')>('../../src/config/paths');
  return {
    ...actual,
    paths: new Proxy(actual.paths, {
      get(target, prop) {
        if (prop === 'daemonPid') return path.join(tmp, 'daemon.pid');
        if (prop === 'daemonLog') return path.join(tmp, 'daemon.log');
        return (target as Record<string, unknown>)[prop as string];
      },
    }),
    ensureForgeHome: () => fs.mkdirSync(tmp, { recursive: true }),
  };
});

import { daemonStatus, stopDaemon } from '../../src/daemon/control';

describe('daemonStatus', () => {
  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-daemon-')));
  });

  it('returns running=false when no pid file exists', () => {
    expect(daemonStatus().running).toBe(false);
  });

  it('returns running=false when the pid file is malformed', () => {
    fs.writeFileSync(path.join(tmp, 'daemon.pid'), 'not-a-number', 'utf8');
    expect(daemonStatus().running).toBe(false);
  });

  it('returns running=true when the pid maps to a live process', () => {
    // Use our own pid — guaranteed live.
    fs.writeFileSync(path.join(tmp, 'daemon.pid'), String(process.pid), 'utf8');
    const status = daemonStatus();
    expect(status.running).toBe(true);
    expect(status.pid).toBe(process.pid);
  });

  it('returns running=false when the pid is dead', () => {
    // A pid that's extremely unlikely to exist.
    fs.writeFileSync(path.join(tmp, 'daemon.pid'), '999999', 'utf8');
    expect(daemonStatus().running).toBe(false);
  });
});

describe('stopDaemon', () => {
  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-daemon-')));
  });

  it('returns false when the daemon is not running', () => {
    expect(stopDaemon()).toBe(false);
  });
});
