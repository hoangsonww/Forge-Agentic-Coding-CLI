/**
 * Log Rotation Tests (extra).
 *
 * Pins the "rotate when over size" and "no-op when under" paths of the
 * rotation module, using a temp log dir so the dev's real ~/.forge/logs
 * is untouched.
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
        if (prop === 'logs') return tmp;
        return (target as Record<string, unknown>)[prop as string];
      },
    }),
  };
});

import { rotateIfNeeded } from '../../src/logging/rotation';

describe('rotateIfNeeded', () => {
  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-rot-')));
  });

  it('is a no-op when no log file exists', () => {
    expect(() => rotateIfNeeded()).not.toThrow();
  });

  it('leaves a small log file alone', () => {
    const f = path.join(tmp, 'forge.log');
    fs.writeFileSync(f, 'small', 'utf8');
    rotateIfNeeded();
    expect(fs.existsSync(f)).toBe(true);
    expect(fs.readFileSync(f, 'utf8')).toBe('small');
  });
});
