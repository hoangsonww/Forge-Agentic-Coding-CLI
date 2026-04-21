/**
 * Run Command Tool Tests.
 *
 * Verifies that the run_command tool blocks critical-risk and
 * blocklisted commands before they reach the shell, and passes benign
 * commands through while propagating exit code and timing.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunCommand = vi.fn();
vi.mock('../../src/sandbox/shell', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/sandbox/shell')>('../../src/sandbox/shell');
  return {
    ...actual,
    runCommand: (cmd: string, opts: unknown) => mockRunCommand(cmd, opts),
  };
});

import { runCommandTool } from '../../src/tools/run-command';

const ctx = {
  taskId: 't',
  projectId: 'p',
  projectRoot: '/tmp/fake',
  traceId: 'r',
  runId: 'r',
};

describe('run_command tool', () => {
  beforeEach(() => mockRunCommand.mockReset());

  it('blocks a blocklisted command (rm -rf /)', async () => {
    const r = await runCommandTool.execute({ command: 'rm -rf /' }, ctx);
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('sandbox_violation');
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it('blocks a sudo command', async () => {
    const r = await runCommandTool.execute({ command: 'sudo make me a sandwich' }, ctx);
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('sandbox_violation');
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it('runs a benign command and reports success', async () => {
    mockRunCommand.mockResolvedValueOnce({
      stdout: 'hi',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    const r = await runCommandTool.execute({ command: 'echo hi' }, ctx);
    expect(r.success).toBe(true);
    expect(r.output?.stdout).toBe('hi');
    expect(r.output?.exitCode).toBe(0);
  });

  it('marks success=false when the command exits non-zero', async () => {
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: 'boom',
      exitCode: 2,
      signal: null,
      timedOut: false,
    });
    const r = await runCommandTool.execute({ command: 'false' }, ctx);
    expect(r.success).toBe(false);
    expect(r.output?.exitCode).toBe(2);
  });

  it('marks success=false when the command times out', async () => {
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: null,
      signal: 'SIGKILL',
      timedOut: true,
    });
    const r = await runCommandTool.execute({ command: 'sleep 9999' }, ctx);
    expect(r.success).toBe(false);
    expect(r.output?.timedOut).toBe(true);
  });
});
