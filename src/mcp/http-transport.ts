/**
 * HTTP-streaming MCP client. Carries JSON-RPC messages over an HTTP request
 * (request body: framed messages; response body: server-sent events). Good
 * enough for connectors that expose MCP-over-HTTP. For long-running tools
 * we establish a separate streaming channel per `tools/call`.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { request } from 'undici';
import { ForgeRuntimeError } from '../types/errors';
import { log } from '../logging/logger';

export interface McpRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface HttpTransportOptions {
  endpoint: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export class McpHttpClient {
  private id = 1;
  constructor(private opts: HttpTransportOptions) {}

  async start(): Promise<void> {
    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'forge', version: '0.1.0' },
    });
  }

  private async rpc(method: string, params: unknown): Promise<unknown> {
    const id = this.id++;
    const payload = { jsonrpc: '2.0', id, method, params };
    const res = await request(this.opts.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(this.opts.headers ?? {}),
      },
      body: JSON.stringify(payload),
      bodyTimeout: this.opts.timeoutMs ?? 30_000,
      headersTimeout: this.opts.timeoutMs ?? 30_000,
    });
    const contentType = (res.headers['content-type'] ?? '').toString();
    if (contentType.includes('text/event-stream')) {
      // Reduce SSE stream to the single response matching our id.
      let buffer = '';
      for await (const chunk of res.body) {
        buffer += chunk.toString('utf8');
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const ev of events) {
          const dataLines = ev.split('\n').filter((l) => l.startsWith('data:'));
          if (!dataLines.length) continue;
          const data = dataLines.map((l) => l.slice(5).trim()).join('');
          try {
            const msg = JSON.parse(data) as McpRpcResponse;
            if (msg.id === id) {
              if (msg.error) {
                throw new ForgeRuntimeError({
                  class: 'tool_error',
                  message: `MCP ${method}: ${msg.error.message}`,
                  retryable: false,
                });
              }
              return msg.result;
            }
          } catch (err) {
            if (err instanceof ForgeRuntimeError) throw err;
            log.debug('mcp sse parse error', { line: data });
          }
        }
      }
      throw new ForgeRuntimeError({
        class: 'tool_error',
        message: `MCP ${method}: stream ended without matching response`,
        retryable: true,
      });
    }
    if (res.statusCode !== 200) {
      const txt = await res.body.text();
      throw new ForgeRuntimeError({
        class: 'tool_error',
        message: `MCP ${method} ${res.statusCode}: ${txt.slice(0, 300)}`,
        retryable: res.statusCode >= 500,
      });
    }
    const body = (await res.body.json()) as McpRpcResponse;
    if (body.error) {
      throw new ForgeRuntimeError({
        class: 'tool_error',
        message: `MCP ${method}: ${body.error.message}`,
        retryable: false,
      });
    }
    return body.result;
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: unknown }>> {
    const res = (await this.rpc('tools/list', {})) as {
      tools?: Array<{ name: string; description?: string; inputSchema?: unknown }>;
    };
    return res?.tools ?? [];
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    return this.rpc('tools/call', { name, arguments: args });
  }

  async stop(): Promise<void> {
    // HTTP is stateless; nothing to tear down.
  }
}
