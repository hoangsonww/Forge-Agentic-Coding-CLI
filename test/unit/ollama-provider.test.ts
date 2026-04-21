/**
 * Ollama Provider Tests.
 *
 * We stub `undici.request` so the provider's happy-path and error-path
 * branches can be exercised without a running Ollama server.
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
    ollama: { endpoint: 'http://localhost:11434' },
    permissions: { trust: { autoAllowAfter: 3 } },
  }),
}));

import { OllamaProvider } from '../../src/models/ollama';
import { ForgeRuntimeError } from '../../src/types/errors';

const jsonBody = (obj: unknown, status = 200) => ({
  statusCode: status,
  body: {
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  },
});

describe('OllamaProvider', () => {
  beforeEach(() => mockRequest.mockReset());

  it('reports available on HTTP 200', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: { json: async () => ({}), text: async () => '' },
    });
    const p = new OllamaProvider('http://localhost:11434');
    expect(await p.isAvailable()).toBe(true);
  });

  it('reports unavailable on network error', async () => {
    mockRequest.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const p = new OllamaProvider('http://localhost:11434');
    expect(await p.isAvailable()).toBe(false);
  });

  it('lists models and classifies them', async () => {
    mockRequest.mockResolvedValueOnce(
      jsonBody({ models: [{ name: 'llama3.2:3b' }, { name: 'qwen2.5-coder:7b' }] }),
    );
    const p = new OllamaProvider('http://localhost:11434');
    const list = await p.listModels();
    expect(list.length).toBe(2);
    expect(list[0].provider).toBe('ollama');
    expect(list[0].id).toBe('llama3.2:3b');
  });

  it('returns [] when the endpoint is not ok for listModels', async () => {
    mockRequest.mockResolvedValueOnce(jsonBody({}, 500));
    const p = new OllamaProvider('http://localhost:11434');
    expect(await p.listModels()).toEqual([]);
  });

  it('complete() returns a ModelResponse on success', async () => {
    mockRequest.mockResolvedValueOnce(
      jsonBody({
        message: { content: 'hello' },
        prompt_eval_count: 4,
        eval_count: 2,
        done_reason: 'stop',
      }),
    );
    const p = new OllamaProvider('http://localhost:11434');
    const r = await p.complete('llama3.2:3b', [{ role: 'user', content: 'hi' }]);
    expect(r.content).toBe('hello');
    expect(r.inputTokens).toBe(4);
    expect(r.finishReason).toBe('stop');
  });

  it('complete() throws ForgeRuntimeError on non-200', async () => {
    mockRequest.mockResolvedValueOnce(jsonBody({ error: 'nope' }, 500));
    const p = new OllamaProvider('http://localhost:11434');
    await expect(
      p.complete('llama3.2:3b', [{ role: 'user', content: 'hi' }]),
    ).rejects.toBeInstanceOf(ForgeRuntimeError);
  });

  it('wraps network failures in ForgeRuntimeError', async () => {
    mockRequest.mockRejectedValueOnce(new Error('network'));
    const p = new OllamaProvider('http://localhost:11434');
    await expect(
      p.complete('llama3.2:3b', [{ role: 'user', content: 'hi' }]),
    ).rejects.toBeInstanceOf(ForgeRuntimeError);
  });
});
