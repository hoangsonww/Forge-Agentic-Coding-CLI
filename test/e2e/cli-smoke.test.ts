/**
 * End-to-end CLI smoke tests.
 *
 * These spawn the real `bin/forge.js` as a child process. They assert
 * that the binary starts, subcommands exist, error paths exit cleanly,
 * and deterministic commands produce recognisable output.
 *
 * No network, no model calls, no provider required. Every run points
 * FORGE_HOME at a fresh tmp dir so a user's real ~/.forge isn't touched.
 *
 * If `dist/` hasn't been built, we skip the whole suite rather than
 * fail — CI always builds first; `npm test` locally works after
 * `npm run build`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BIN = path.join(REPO_ROOT, 'bin', 'forge.js');
const DIST_ENTRY = path.join(REPO_ROOT, 'dist', 'cli', 'index.js');
const PKG_VERSION: string = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
).version;

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
}

const runCli = (args: string[], opts: { timeoutMs?: number } = {}): Promise<RunResult> => {
  return new Promise((resolve) => {
    const started = Date.now();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-e2e-home-'));
    const child = spawn('node', [BIN, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        FORGE_HOME: home,
        // Avoid the interactive banner's typewriter in tests.
        FORGE_LOG_STDOUT: '0',
        NO_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    const killer = setTimeout(() => {
      child.kill('SIGKILL');
    }, opts.timeoutMs ?? 15_000);
    child.on('close', (code, signal) => {
      clearTimeout(killer);
      try {
        fs.rmSync(home, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      resolve({ stdout, stderr, code, signal, durationMs: Date.now() - started });
    });
  });
};

const distBuilt = fs.existsSync(DIST_ENTRY);

describe.skipIf(!distBuilt)('e2e — CLI smoke (bin/forge.js)', () => {
  beforeAll(() => {
    // Belt + braces — this describe.skipIf should already have handled it,
    // but leave a helpful note if something lands here with no dist.
    if (!distBuilt) {
      console.warn(`[e2e] skipped — run \`npm run build\` first (missing ${DIST_ENTRY})`);
    }
  });

  it('--version prints the package.json version and exits 0', async () => {
    const res = await runCli(['--version']);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toContain(PKG_VERSION);
  });

  it('--help exits 0 and lists the core commands', async () => {
    const res = await runCli(['--help']);
    expect(res.code).toBe(0);
    const out = res.stdout + res.stderr;
    for (const cmd of ['run', 'doctor', 'status', 'task', 'model', 'config']) {
      expect(out).toContain(cmd);
    }
  });

  it('an unknown subcommand fails cleanly (non-zero, with a hint)', async () => {
    const res = await runCli(['definitely-not-a-command']);
    expect(res.code).not.toBe(0);
    const out = res.stdout + res.stderr;
    expect(out.length).toBeGreaterThan(0);
  });

  it('`doctor --no-banner` runs + emits the health-check header', async () => {
    const res = await runCli(['doctor', '--no-banner']);
    // Exit code is 0 when any provider is reachable, 1 when none are.
    // Either is acceptable; we only assert the command ran to completion
    // and produced its signature output.
    expect([0, 1]).toContain(res.code);
    const out = res.stdout + res.stderr;
    expect(out.toLowerCase()).toContain('health check');
    // Deterministic performance claim: doctor cold-start under 2s on CI
    // (we claim 173 ms — 2s is a generous cap for slow runners).
    expect(res.durationMs).toBeLessThan(2_000);
  });

  it('`config path` prints a directory under the tmp FORGE_HOME', async () => {
    const res = await runCli(['config', 'path']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/forge-e2e-home|\.forge/);
  });

  it('`task list` runs in an empty project without crashing', async () => {
    const res = await runCli(['task', 'list']);
    expect([0, 1]).toContain(res.code);
  });

  it('`model list` probes providers and exits even with none up', async () => {
    const res = await runCli(['model', 'list'], { timeoutMs: 10_000 });
    expect([0, 1]).toContain(res.code);
  });

  it('`run` with no prompt exits non-zero and tells the user what to do', async () => {
    const res = await runCli(['run']);
    expect(res.code).not.toBe(0);
    const out = (res.stdout + res.stderr).toLowerCase();
    expect(out).toMatch(/prompt|argument|missing|usage/);
  });
});
