/**
 * Format Tool Tests.
 *
 * The formatter groups files by extension and dispatches to the matching
 * external formatter (prettier / black / gofmt / rustfmt). Tests mock
 * runCommand so we exercise grouping and probe-skipping without needing
 * any of those binaries.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunCommand = vi.fn();
vi.mock('../../src/sandbox/shell', () => ({
  runCommand: (cmd: string, opts: unknown) => mockRunCommand(cmd, opts),
}));

import { formatTouchedFiles } from '../../src/tools/format';

describe('formatTouchedFiles', () => {
  beforeEach(() => mockRunCommand.mockReset());

  it('returns zeros for an empty file list', async () => {
    const r = await formatTouchedFiles('/tmp/x', []);
    expect(r).toEqual({ formatted: 0, skipped: 0 });
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it('skips files when the probe fails', async () => {
    // All probe runs return exitCode=1 (binary not found)
    mockRunCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 1,
      signal: null,
      timedOut: false,
    });
    const r = await formatTouchedFiles('/tmp/x', ['a.ts', 'b.py']);
    expect(r.formatted).toBe(0);
    expect(r.skipped).toBe(2);
  });

  it('skips files with unknown extensions', async () => {
    const r = await formatTouchedFiles('/tmp/x', ['binary.bin']);
    expect(r.skipped).toBe(1);
    expect(r.formatted).toBe(0);
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it('formats files when the probe succeeds', async () => {
    // Probe succeeds, format succeeds
    mockRunCommand
      .mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
        signal: null,
        timedOut: false,
      })
      .mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
        signal: null,
        timedOut: false,
      });
    const r = await formatTouchedFiles('/tmp/x', ['a.ts']);
    expect(r.formatted).toBe(1);
    expect(mockRunCommand.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
