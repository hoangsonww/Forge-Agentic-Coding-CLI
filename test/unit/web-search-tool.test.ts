/**
 * Web Search Tool Tests.
 *
 * The tool layer is a thin wrapper; these tests verify success/error
 * translation and the provider-inference heuristic that reads env vars.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockWebSearch = vi.fn();
vi.mock('../../src/web/search', () => ({
  webSearch: (opts: unknown) => mockWebSearch(opts),
}));

import { webSearchTool } from '../../src/tools/web-search';

const ctx = {
  taskId: 't',
  projectId: 'p',
  projectRoot: '/tmp/fake',
  traceId: 'r',
  runId: 'r',
};

describe('web.search tool', () => {
  let oldEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    mockWebSearch.mockReset();
    oldEnv = { ...process.env };
    delete process.env.TAVILY_API_KEY;
    delete process.env.BRAVE_SEARCH_API_KEY;
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  it('returns results with the duckduckgo provider when no keys are set', async () => {
    mockWebSearch.mockResolvedValueOnce([{ title: 'A', url: 'https://a.example', snippet: 's' }]);
    const r = await webSearchTool.execute({ query: 'foo' }, ctx);
    expect(r.success).toBe(true);
    expect(r.output?.provider).toBe('duckduckgo');
    expect(r.output?.results.length).toBe(1);
  });

  it('picks tavily when TAVILY_API_KEY is set', async () => {
    process.env.TAVILY_API_KEY = 'key';
    mockWebSearch.mockResolvedValueOnce([]);
    const r = await webSearchTool.execute({ query: 'q' }, ctx);
    expect(r.output?.provider).toBe('tavily');
  });

  it('picks brave when only BRAVE_SEARCH_API_KEY is set', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'key';
    mockWebSearch.mockResolvedValueOnce([]);
    const r = await webSearchTool.execute({ query: 'q' }, ctx);
    expect(r.output?.provider).toBe('brave');
  });

  it('surfaces errors as retryable tool_error', async () => {
    mockWebSearch.mockRejectedValueOnce(new Error('rate limit'));
    const r = await webSearchTool.execute({ query: 'q' }, ctx);
    expect(r.success).toBe(false);
    expect(r.error?.retryable).toBe(true);
  });
});
