/**
 * Glob Tool Tests.
 *
 * Covers the glob tool's command shape, result slicing, and truncation
 * behavior. The shell command runner is mocked so we are exercising
 * parsing/slicing and not the host's bash configuration.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunCommand = vi.fn();
vi.mock('../../src/sandbox/shell', () => ({
  runCommand: (cmd: string, opts: unknown) => mockRunCommand(cmd, opts),
}));

import { globTool } from '../../src/tools/glob';

const ctx = {
  taskId: 't',
  projectId: 'p',
  projectRoot: '/tmp/fake',
  traceId: 'r',
  runId: 'r',
};

describe('glob tool', () => {
  beforeEach(() => mockRunCommand.mockReset());

  it('returns the trimmed list of files', async () => {
    mockRunCommand.mockResolvedValueOnce({
      stdout: 'src/a.ts\nsrc/b.ts\n\n',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    const r = await globTool.execute({ pattern: '**/*.ts' }, ctx);
    expect(r.success).toBe(true);
    expect(r.output?.files).toEqual(['src/a.ts', 'src/b.ts']);
    expect(r.output?.truncated).toBe(false);
  });

  it('includes the pattern in the invoked command', async () => {
    mockRunCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    await globTool.execute({ pattern: '*.md', path: 'docs' }, ctx);
    const [cmd] = mockRunCommand.mock.calls[0];
    expect(cmd).toContain('*.md');
    expect(cmd).toContain('docs/');
  });

  it('reports truncated when hitting the max', async () => {
    const stdout = Array.from({ length: 3 }, (_, i) => `f${i}.ts`).join('\n');
    mockRunCommand.mockResolvedValueOnce({
      stdout,
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    const r = await globTool.execute({ pattern: '*', maxResults: 3 }, ctx);
    expect(r.success).toBe(true);
    expect(r.output?.files.length).toBe(3);
    expect(r.output?.truncated).toBe(true);
  });
});
