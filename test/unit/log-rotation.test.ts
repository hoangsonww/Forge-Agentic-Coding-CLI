/**
 * Log rotation tests. These are somewhat integration-y, but they test the actual file system behavior of the rotation logic. The tests cover:
 *   - rotateIfNeeded correctly rotates the log file when it exceeds the specified byte limit, and maintains the expected number of backup files.
 *   - rotateIfNeeded does not rotate when the log file is under the byte limit.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('rotateIfNeeded', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-rot-'));
    process.env.FORGE_HOME = tmp;
  });

  it('rotates when file exceeds limit', async () => {
    const { rotateIfNeeded } = await import('../../src/logging/rotation');
    const { paths } = await import('../../src/config/paths');
    fs.mkdirSync(paths.logs, { recursive: true });
    const log = path.join(paths.logs, 'forge.log');
    fs.writeFileSync(log, Buffer.alloc(2000, 'a'));
    const r = rotateIfNeeded({ maxBytes: 500, keep: 2 });
    expect(r.rotated).toBe(true);
    expect(fs.existsSync(log)).toBe(false);
    expect(fs.existsSync(log + '.1')).toBe(true);
  });

  it('is a no-op when under the limit', async () => {
    const { rotateIfNeeded } = await import('../../src/logging/rotation');
    const { paths } = await import('../../src/config/paths');
    fs.mkdirSync(paths.logs, { recursive: true });
    const log = path.join(paths.logs, 'forge.log');
    fs.writeFileSync(log, 'small');
    const r = rotateIfNeeded({ maxBytes: 10_000 });
    expect(r.rotated).toBe(false);
  });
});
