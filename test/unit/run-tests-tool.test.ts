/**
 * Run Tests Tool Tests.
 *
 * Checks that the framework auto-detection picks the right runner for
 * the marker files present in the project root, that explicit overrides
 * take precedence, and that an unknown framework surfaces a not_found
 * error rather than silently succeeding.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockRunCommand = vi.fn();
vi.mock('../../src/sandbox/shell', () => ({
  runCommand: (cmd: string, opts: unknown) => mockRunCommand(cmd, opts),
}));

import { runTestsTool } from '../../src/tools/run-tests';

const mkdir = (): string => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-runt-')));

const ctxFor = (root: string) => ({
  taskId: 't',
  projectId: 'p',
  projectRoot: root,
  traceId: 'r',
  runId: 'r',
});

describe('run_tests tool', () => {
  beforeEach(() => mockRunCommand.mockReset());

  it('detects npm via package.json.scripts.test', async () => {
    const root = mkdir();
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest' } }),
    );
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    const r = await runTestsTool.execute({}, ctxFor(root));
    expect(r.success).toBe(true);
    expect(r.output?.framework).toBe('npm');
    expect(mockRunCommand.mock.calls[0][0]).toBe('npm test');
  });

  it('detects pytest from pyproject.toml', async () => {
    const root = mkdir();
    fs.writeFileSync(path.join(root, 'pyproject.toml'), '[project]\nname = "x"\n');
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    const r = await runTestsTool.execute({}, ctxFor(root));
    expect(r.output?.framework).toBe('pytest');
    expect(mockRunCommand.mock.calls[0][0]).toBe('pytest');
  });

  it('detects go via go.mod', async () => {
    const root = mkdir();
    fs.writeFileSync(path.join(root, 'go.mod'), 'module x\n');
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    const r = await runTestsTool.execute({}, ctxFor(root));
    expect(r.output?.framework).toBe('go');
    expect(mockRunCommand.mock.calls[0][0]).toBe('go test ./...');
  });

  it('detects cargo via Cargo.toml', async () => {
    const root = mkdir();
    fs.writeFileSync(path.join(root, 'Cargo.toml'), '[package]\nname = "x"\n');
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    const r = await runTestsTool.execute({}, ctxFor(root));
    expect(r.output?.framework).toBe('cargo');
  });

  it('honors an explicit framework override', async () => {
    const root = mkdir();
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    await runTestsTool.execute({ framework: 'pnpm', target: 'src' }, ctxFor(root));
    expect(mockRunCommand.mock.calls[0][0]).toBe('pnpm test -- src');
  });

  it('returns not_found when no framework is detected', async () => {
    const root = mkdir();
    const r = await runTestsTool.execute({}, ctxFor(root));
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('not_found');
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it('falls back to `node --test` when *.test.js files exist without a package.json', async () => {
    const root = mkdir();
    fs.mkdirSync(path.join(root, 'test'));
    fs.writeFileSync(path.join(root, 'test', 'fib.test.js'), "import test from 'node:test';\n");
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    const r = await runTestsTool.execute({}, ctxFor(root));
    expect(r.success).toBe(true);
    expect(r.output?.framework).toBe('node');
    expect(mockRunCommand.mock.calls[0][0]).toBe('node --test');
  });

  it('prefers npm over node:test when both are present', async () => {
    const root = mkdir();
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest' } }),
    );
    fs.mkdirSync(path.join(root, 'test'));
    fs.writeFileSync(path.join(root, 'test', 'x.test.js'), '');
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    const r = await runTestsTool.execute({}, ctxFor(root));
    expect(r.output?.framework).toBe('npm');
  });

  it('reports failure when exit code is non-zero', async () => {
    const root = mkdir();
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest' } }),
    );
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 1,
      signal: null,
      timedOut: false,
    });
    const r = await runTestsTool.execute({}, ctxFor(root));
    expect(r.success).toBe(false);
    expect(r.output?.passed).toBe(false);
  });
});
