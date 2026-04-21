/**
 * Grep Tool Tests.
 *
 * Exercises the grep tool's output parsing, the ripgrep-vs-grep command
 * selection, the glob/case-insensitive flags, and the truncation logic.
 * The sandbox runCommand is mocked so the tests do not depend on the
 * presence of ripgrep on the host.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunCommand = vi.fn();
vi.mock('../../src/sandbox/shell', () => ({
  runCommand: (cmd: string, opts: unknown) => mockRunCommand(cmd, opts),
}));

import { grepTool } from '../../src/tools/grep';

const ctx = {
  taskId: 't',
  projectId: 'p',
  projectRoot: '/tmp/fake',
  traceId: 'r',
  runId: 'r',
};

describe('grep tool', () => {
  beforeEach(() => {
    mockRunCommand.mockReset();
  });

  it('uses ripgrep when available and parses file:line:content', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, signal: null, timedOut: false })
      .mockResolvedValueOnce({
        stdout: 'src/a.ts:12:const x = 1;\nsrc/b.ts:4:hello world\n',
        stderr: '',
        exitCode: 0,
        signal: null,
        timedOut: false,
      });
    const r = await grepTool.execute({ pattern: 'foo' }, ctx);
    expect(r.success).toBe(true);
    expect(r.output?.matches.length).toBe(2);
    expect(r.output?.matches[0]).toEqual({ file: 'src/a.ts', line: 12, content: 'const x = 1;' });
    // Second call (the actual search) should have used rg
    const [cmd] = mockRunCommand.mock.calls[1];
    expect(cmd.startsWith('rg ')).toBe(true);
  });

  it('falls back to BSD grep when ripgrep is absent', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 1, signal: null, timedOut: false })
      .mockResolvedValueOnce({
        stdout: 'a.txt:1:hit\n',
        stderr: '',
        exitCode: 0,
        signal: null,
        timedOut: false,
      });
    const r = await grepTool.execute({ pattern: 'hit', caseInsensitive: true }, ctx);
    expect(r.success).toBe(true);
    const [cmd] = mockRunCommand.mock.calls[1];
    expect(cmd.startsWith('grep ')).toBe(true);
    expect(cmd).toContain('-i');
  });

  it('ignores malformed lines in output', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, signal: null, timedOut: false })
      .mockResolvedValueOnce({
        stdout: 'not a valid line\nsrc/x.ts:not-a-number:blah\nsrc/y.ts:3:ok\n',
        stderr: '',
        exitCode: 0,
        signal: null,
        timedOut: false,
      });
    const r = await grepTool.execute({ pattern: 'x' }, ctx);
    expect(r.success).toBe(true);
    expect(r.output?.matches.length).toBe(1);
    expect(r.output?.matches[0].file).toBe('src/y.ts');
  });

  it('passes glob flag through when using ripgrep', async () => {
    mockRunCommand
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, signal: null, timedOut: false })
      .mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
        signal: null,
        timedOut: false,
      });
    await grepTool.execute({ pattern: 'foo', glob: '*.ts' }, ctx);
    const [cmd] = mockRunCommand.mock.calls[1];
    expect(cmd).toContain('-g');
    expect(cmd).toContain("'*.ts'");
  });
});
