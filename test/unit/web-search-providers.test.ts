/**
 * Web Search Providers Tests.
 *
 * Covers the webSearch router in src/web/search.ts: the provider
 * precedence (tavily → brave → duckduckgo), fallthrough on empty or
 * failing providers, and body-shape handling for Tavily/Brave.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRequest = vi.fn();
vi.mock('undici', () => ({
  request: (url: string, opts: unknown) => mockRequest(url, opts),
}));

import { webSearch } from '../../src/web/search';

describe('webSearch provider fallthrough', () => {
  const oldEnv = { ...process.env };

  beforeEach(() => {
    mockRequest.mockReset();
    delete process.env.TAVILY_API_KEY;
    delete process.env.BRAVE_SEARCH_API_KEY;
  });

  afterEach(() => {
    process.env = { ...oldEnv };
  });

  it('uses tavily when TAVILY_API_KEY is set and the call succeeds', async () => {
    process.env.TAVILY_API_KEY = 'tk';
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({
          results: [{ title: 'A', url: 'https://a', content: 'snip' }],
        }),
        text: async () => '',
      },
    });
    const r = await webSearch({ query: 'q' });
    expect(r.length).toBe(1);
    expect(r[0].url).toBe('https://a');
    expect(mockRequest.mock.calls[0][0]).toBe('https://api.tavily.com/search');
  });

  it('falls through from tavily (non-200) to brave', async () => {
    process.env.TAVILY_API_KEY = 'tk';
    process.env.BRAVE_SEARCH_API_KEY = 'bk';
    mockRequest
      .mockResolvedValueOnce({
        statusCode: 500,
        body: { json: async () => ({}), text: async () => '' },
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            web: { results: [{ title: 'B', url: 'https://b', description: 'desc' }] },
          }),
          text: async () => '',
        },
      });
    const r = await webSearch({ query: 'q' });
    expect(r.length).toBe(1);
    expect(r[0].url).toBe('https://b');
  });

  it('falls through to duckduckgo HTML when no keys are set', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({}),
        text: async () =>
          '<a class="result__a" href="https://ex">Title</a><a class="result__snippet">Snippet</a>',
      },
    });
    const r = await webSearch({ query: 'q' });
    expect(r.length).toBe(1);
    expect(r[0].url).toBe('https://ex');
    expect(r[0].title).toContain('Title');
  });

  it('returns [] when everything fails', async () => {
    mockRequest.mockRejectedValue(new Error('network'));
    const r = await webSearch({ query: 'q' });
    expect(r).toEqual([]);
  });
});
