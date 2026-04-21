/**
 * Vitest global setup. Runs BEFORE any test module is imported so we can set
 * environment variables that src/config/paths.ts captures at import time
 * (FORGE_HOME in particular — it resolves once and caches the value).
 *
 * Point FORGE_HOME at a disposable directory so tests don't pollute the
 * developer's real ~/.forge.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-home-'));
process.env.FORGE_HOME = testHome;

// Best-effort cleanup on normal exit so we don't accumulate dirs in /tmp.
process.on('exit', () => {
  try {
    fs.rmSync(testHome, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
