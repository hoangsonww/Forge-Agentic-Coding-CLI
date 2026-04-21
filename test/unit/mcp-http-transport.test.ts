/**
 * MCP HTTP Transport Tests.
 *
 * Mocks undici so we can exercise both response shapes the client has
 * to handle — plain JSON and SSE — plus error and non-200 paths. We
 * also verify the outgoing JSON-RPC envelope is well-formed.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequest = vi.fn();
vi.mock('undici', () => ({
  request: (url: string, opts: unknown) => mockRequest(url, opts),
}));

import { McpHttpClient } from '../../src/mcp/http-transport';
import { ForgeRuntimeError } from '../../src/types/errors';

const jsonResponse = (body: unknown, status = 200) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json' },
  body: {
    json: async () => body,
    text: async () => JSON.stringify(body),
  },
});

describe('McpHttpClient', () => {
  beforeEach(() => mockRequest.mockReset());

  it('sends a JSON-RPC initialize on start', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }));
    const c = new McpHttpClient({ endpoint: 'https://m.example/rpc' });
    await c.start();
    const [url, opts] = mockRequest.mock.calls[0];
    expect(url).toBe('https://m.example/rpc');
    const body = JSON.parse((opts as { body: string }).body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('initialize');
    expect(body.id).toBe(1);
  });

  it('parses tools/list response', async () => {
    mockRequest
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 2,
          result: {
            tools: [{ name: 'grep', description: 'search' }],
          },
        }),
      );
    const c = new McpHttpClient({ endpoint: 'https://m.example/rpc' });
    await c.start();
    const tools = await c.listTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('grep');
  });

  it('throws on JSON-RPC error responses', async () => {
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'method not found' },
      }),
    );
    const c = new McpHttpClient({ endpoint: 'https://m.example/rpc' });
    await expect(c.start()).rejects.toBeInstanceOf(ForgeRuntimeError);
  });

  it('throws on non-200 HTTP status', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 502,
      headers: { 'content-type': 'application/json' },
      body: { json: async () => ({}), text: async () => 'bad gateway' },
    });
    const c = new McpHttpClient({ endpoint: 'https://m.example/rpc' });
    await expect(c.start()).rejects.toBeInstanceOf(ForgeRuntimeError);
  });

  it('handles SSE responses that carry the JSON-RPC reply', async () => {
    const sseBody = `data: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } })}\n\n`;
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: (async function* () {
        yield Buffer.from(sseBody);
      })(),
    });
    const c = new McpHttpClient({ endpoint: 'https://m.example/rpc' });
    await c.start();
    // No assertion — reaching here means the SSE reply was parsed without throwing.
    expect(true).toBe(true);
  });

  it('stop() is a no-op for the HTTP transport', async () => {
    const c = new McpHttpClient({ endpoint: 'https://m.example/rpc' });
    await expect(c.stop()).resolves.toBeUndefined();
  });
});
