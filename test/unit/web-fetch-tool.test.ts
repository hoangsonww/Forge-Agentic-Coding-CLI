/**
 * Web Fetch Tool Tests.
 *
 * The underlying `webFetch` helper is already covered by
 * web-fetch-guard.test.ts; this suite verifies the outer Tool wrapper
 * translates success and failure into ToolResult shape and preserves
 * ForgeRuntimeError semantics.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWebFetch = vi.fn();
vi.mock('../../src/web/fetch', () => ({
  webFetch: (opts: unknown) => mockWebFetch(opts),
}));

import { webFetchTool } from '../../src/tools/web-fetch';
import { ForgeRuntimeError } from '../../src/types/errors';

const ctx = {
  taskId: 't',
  projectId: 'p',
  projectRoot: '/tmp/fake',
  traceId: 'r',
  runId: 'r',
};

describe('web.fetch tool', () => {
  beforeEach(() => mockWebFetch.mockReset());

  it('wraps a successful fetch result', async () => {
    const fakeResult = {
      url: 'https://example.com',
      finalUrl: 'https://example.com/',
      status: 200,
      contentType: 'text/html',
      title: 'Example',
      text: 'Hello',
      bytesReceived: 100,
      flaggedInjection: false,
    };
    mockWebFetch.mockResolvedValueOnce(fakeResult);
    const r = await webFetchTool.execute({ url: 'https://example.com' }, ctx);
    expect(r.success).toBe(true);
    expect(r.output).toEqual(fakeResult);
  });

  it('surfaces ForgeRuntimeError details on failure', async () => {
    mockWebFetch.mockRejectedValueOnce(
      new ForgeRuntimeError({
        class: 'sandbox_violation',
        message: 'SSRF guard triggered',
        retryable: false,
      }),
    );
    const r = await webFetchTool.execute({ url: 'http://127.0.0.1/' }, ctx);
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('sandbox_violation');
  });

  it('wraps unknown errors as retryable tool_error', async () => {
    mockWebFetch.mockRejectedValueOnce(new Error('network blip'));
    const r = await webFetchTool.execute({ url: 'https://example.com' }, ctx);
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('tool_error');
    expect(r.error?.retryable).toBe(true);
  });
});
