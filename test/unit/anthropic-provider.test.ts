/**
 * Anthropic Provider Tests.
 *
 * Uses a stubbed `undici.request` to verify the provider emits the
 * correct body shape (system/messages split, stop sequences), wraps
 * non-200 responses in ForgeRuntimeError, and handles the
 * missing-API-key branch.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequest = vi.fn();
vi.mock('undici', () => ({
  request: (url: string, opts: unknown) => mockRequest(url, opts),
}));

vi.mock('../../src/config/loader', () => ({
  loadGlobalConfig: () => ({
    anthropic: { apiKey: undefined, endpoint: 'https://api.anthropic.com' },
    permissions: { trust: { autoAllowAfter: 3 } },
  }),
}));

import { AnthropicProvider } from '../../src/models/anthropic';
import { ForgeRuntimeError } from '../../src/types/errors';

describe('AnthropicProvider', () => {
  beforeEach(() => mockRequest.mockReset());

  it('is unavailable without an API key', async () => {
    const p = new AnthropicProvider(undefined);
    expect(await p.isAvailable()).toBe(false);
  });

  it('lists three canonical models when keyed', async () => {
    const p = new AnthropicProvider('sk-xxx');
    const list = await p.listModels();
    expect(list.length).toBe(3);
    expect(list.map((m) => m.id)).toContain('claude-opus-4-7');
  });

  it('refuses complete() without a key', async () => {
    const p = new AnthropicProvider(undefined);
    await expect(
      p.complete('claude-sonnet-4-6', [{ role: 'user', content: 'hi' }]),
    ).rejects.toBeInstanceOf(ForgeRuntimeError);
  });

  it('calls the messages endpoint and splits system out', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({
          content: [{ type: 'text', text: 'hi' }],
          usage: { input_tokens: 3, output_tokens: 1 },
          stop_reason: 'end_turn',
        }),
        text: async () => '',
      },
    });
    const p = new AnthropicProvider('sk-xxx', 'https://api.anthropic.com');
    const r = await p.complete('claude-sonnet-4-6', [
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hi' },
    ]);
    expect(r.content).toBe('hi');
    expect(r.inputTokens).toBe(3);
    const [, opts] = mockRequest.mock.calls[0];
    const body = JSON.parse((opts as { body: string }).body);
    expect(body.system).toBe('be terse');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('marks 429 errors retryable', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 429,
      body: {
        json: async () => ({}),
        text: async () => 'rate limited',
      },
    });
    const p = new AnthropicProvider('sk-xxx');
    try {
      await p.complete('claude-sonnet-4-6', [{ role: 'user', content: 'hi' }]);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ForgeRuntimeError);
      expect((err as ForgeRuntimeError).toJSON().retryable).toBe(true);
    }
  });
});
