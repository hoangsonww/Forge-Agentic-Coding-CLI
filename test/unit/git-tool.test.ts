/**
 * Git Tool Tests.
 *
 * Covers gitStatus/gitDiff/gitBranch wrappers: argument plumbing to the
 * shell, porcelain vs plain status, staged vs unstaged diff, and error
 * surfacing when branch switch fails.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunCommand = vi.fn();
vi.mock('../../src/sandbox/shell', () => ({
  runCommand: (cmd: string, opts: unknown) => mockRunCommand(cmd, opts),
}));

import { gitStatusTool, gitDiffTool, gitBranchTool } from '../../src/tools/git';

const ctx = {
  taskId: 't',
  projectId: 'p',
  projectRoot: '/tmp/fake',
  traceId: 'r',
  runId: 'r',
};

describe('git tools', () => {
  beforeEach(() => mockRunCommand.mockReset());

  it('git_status passes porcelain flag when requested', async () => {
    mockRunCommand.mockResolvedValueOnce({
      stdout: ' M foo.ts',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    const r = await gitStatusTool.execute({ porcelain: true }, ctx);
    expect(r.success).toBe(true);
    expect(mockRunCommand.mock.calls[0][0]).toBe('git status --porcelain=v1');
    expect(r.output?.output).toContain('foo.ts');
  });

  it('git_status falls back to plain status without porcelain', async () => {
    mockRunCommand.mockResolvedValueOnce({
      stdout: 'On branch main',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    await gitStatusTool.execute({}, ctx);
    expect(mockRunCommand.mock.calls[0][0]).toBe('git status');
  });

  it('git_diff adds --staged when flagged', async () => {
    mockRunCommand.mockResolvedValueOnce({
      stdout: 'diff --git a/x b/x',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    const r = await gitDiffTool.execute({ staged: true, path: 'src' }, ctx);
    expect(r.success).toBe(true);
    expect(mockRunCommand.mock.calls[0][0]).toBe('git diff --staged src');
  });

  it('git_branch creates a new branch with switch -c', async () => {
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    const r = await gitBranchTool.execute({ name: 'feat/x', create: true }, ctx);
    expect(r.success).toBe(true);
    expect(mockRunCommand.mock.calls[0][0]).toBe("git switch -c 'feat/x'");
    expect(r.output?.created).toBe(true);
  });

  it('git_branch surfaces tool_error when switch fails', async () => {
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: 'already exists',
      exitCode: 1,
      signal: null,
      timedOut: false,
    });
    const r = await gitBranchTool.execute({ name: 'main' }, ctx);
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('tool_error');
    expect(r.error?.message).toContain('already exists');
  });
});
