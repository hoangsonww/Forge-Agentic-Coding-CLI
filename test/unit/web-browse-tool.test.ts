/**
 * Web Browse Tool Tests.
 *
 * The browse tool wraps a Playwright-backed step runner. We only verify
 * the wrapper contract (success/error translation) — the runner itself
 * requires a browser install and is out of scope for unit tests.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBrowse = vi.fn();
vi.mock('../../src/web/browse', () => ({
  runBrowseSteps: (steps: unknown, opts: unknown) => mockBrowse(steps, opts),
}));

import { webBrowseTool } from '../../src/tools/web-browse';

const ctx = {
  taskId: 't',
  projectId: 'p',
  projectRoot: '/tmp/fake',
  traceId: 'r',
  runId: 'r',
};

describe('web.browse tool', () => {
  beforeEach(() => mockBrowse.mockReset());

  it('wraps a successful browse run', async () => {
    const fake = { steps: [], finalUrl: 'https://x/', extracts: {}, screenshots: [] };
    mockBrowse.mockResolvedValueOnce(fake);
    const r = await webBrowseTool.execute(
      { steps: [{ action: 'goto', url: 'https://x/' } as never] },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.output).toEqual(fake);
    const [steps, opts] = mockBrowse.mock.calls[0];
    expect(Array.isArray(steps)).toBe(true);
    expect(opts).toEqual({ headless: undefined, timeoutMs: undefined });
  });

  it('forwards headless and timeout through to the runner', async () => {
    mockBrowse.mockResolvedValueOnce({ steps: [], finalUrl: '', extracts: {}, screenshots: [] });
    await webBrowseTool.execute({ steps: [], headless: false, timeoutMs: 5000 }, ctx);
    const [, opts] = mockBrowse.mock.calls[0];
    expect(opts).toEqual({ headless: false, timeoutMs: 5000 });
  });

  it('reports retryable tool_error when the runner throws', async () => {
    mockBrowse.mockRejectedValueOnce(new Error('playwright not installed'));
    const r = await webBrowseTool.execute({ steps: [] }, ctx);
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('tool_error');
    expect(r.error?.retryable).toBe(true);
  });
});
