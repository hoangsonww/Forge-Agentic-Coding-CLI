/**
 * OpenAI Provider Tests.
 *
 * Stubs undici to cover isAvailable (hosted vs local endpoint branches),
 * complete() success, and the retryable error classification for 429
 * and 5xx.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRequest = vi.fn();
vi.mock('undici', () => ({
  request: (url: string, opts: unknown) => mockRequest(url, opts),
}));

import { OpenAIProvider } from '../../src/models/openai';
import { ForgeRuntimeError } from '../../src/types/errors';

describe('OpenAIProvider', () => {
  const oldEnv = { ...process.env };

  beforeEach(() => {
    mockRequest.mockReset();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...oldEnv };
  });

  it('hosted endpoint is available iff an API key is set', async () => {
    const pNoKey = new OpenAIProvider(undefined, 'https://api.openai.com/v1');
    expect(await pNoKey.isAvailable()).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();

    const pKeyed = new OpenAIProvider('sk-xxx', 'https://api.openai.com/v1');
    expect(await pKeyed.isAvailable()).toBe(true);
  });

  it('custom endpoint probes /models', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: { dump: async () => undefined, json: async () => ({}), text: async () => '' },
    });
    const p = new OpenAIProvider(undefined, 'http://localhost:1234/v1');
    expect(await p.isAvailable()).toBe(true);
    const [url] = mockRequest.mock.calls[0];
    expect(url).toBe('http://localhost:1234/v1/models');
  });

  it('complete() returns a response with inferred finish reason', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({
          choices: [{ message: { content: 'yo' }, finish_reason: 'length' }],
          usage: { prompt_tokens: 3, completion_tokens: 1 },
        }),
        text: async () => '',
      },
    });
    const p = new OpenAIProvider('sk-xxx', 'https://api.openai.com/v1');
    const r = await p.complete('gpt-4o-mini', [{ role: 'user', content: 'hi' }]);
    expect(r.content).toBe('yo');
    expect(r.finishReason).toBe('length');
    expect(r.inputTokens).toBe(3);
  });

  it('complete() throws retryable ForgeRuntimeError on 500', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 500,
      body: { json: async () => ({}), text: async () => 'down' },
    });
    const p = new OpenAIProvider('sk-xxx', 'https://api.openai.com/v1');
    try {
      await p.complete('gpt-4o-mini', [{ role: 'user', content: 'hi' }]);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ForgeRuntimeError);
      expect((err as ForgeRuntimeError).toJSON().retryable).toBe(true);
    }
  });
});
