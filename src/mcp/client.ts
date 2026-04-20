import { spawn, ChildProcess } from 'child_process';
import { ForgeRuntimeError } from '../types/errors';
import { log } from '../logging/logger';

/**
 * Minimal MCP stdio client. Implements the core JSON-RPC request/response
 * flow needed to: list tools, call tools, close cleanly. Deliberately does
 * NOT implement the full protocol — we add features as real connections
 * demand them. OAuth/HTTP transports come in a follow-up.
 */
export interface McpRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class McpStdioClient {
  private proc: ChildProcess | null = null;
  private buffer = '';
  private pending: Map<number, (r: McpRpcResponse) => void> = new Map();
  private id = 1;

  constructor(
    private command: string,
    private args: string[] = [],
    private env: NodeJS.ProcessEnv = process.env,
  ) {}

  async start(): Promise<void> {
    this.proc = spawn(this.command, this.args, {
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout?.on('data', (chunk) => this.onData(chunk.toString('utf8')));
    this.proc.stderr?.on('data', (chunk) =>
      log.debug('mcp stderr', { line: chunk.toString('utf8') }),
    );
    this.proc.on('exit', (code) => log.info('mcp server exited', { code }));

    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'forge', version: '0.1.0' },
    });
  }

  private onData(data: string): void {
    this.buffer += data;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as McpRpcResponse;
        if (typeof msg.id === 'number') {
          const handler = this.pending.get(msg.id);
          if (handler) {
            this.pending.delete(msg.id);
            handler(msg);
          }
        }
      } catch {
        log.debug('mcp: ignoring non-json line', { line });
      }
    }
  }

  private rpc(method: string, params: unknown, timeoutMs = 15_000): Promise<unknown> {
    if (!this.proc || !this.proc.stdin) {
      return Promise.reject(
        new ForgeRuntimeError({
          class: 'tool_error',
          message: 'MCP process not started',
          retryable: false,
        }),
      );
    }
    const id = this.id++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new ForgeRuntimeError({
            class: 'timeout',
            message: `MCP ${method} timed out`,
            retryable: true,
          }),
        );
      }, timeoutMs);
      this.pending.set(id, (r) => {
        clearTimeout(timer);
        if (r.error) {
          reject(
            new ForgeRuntimeError({
              class: 'tool_error',
              message: `MCP ${method}: ${r.error.message}`,
              retryable: false,
            }),
          );
          return;
        }
        resolve(r.result);
      });
      this.proc!.stdin!.write(JSON.stringify(payload) + '\n');
    });
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
    if (this.proc) {
      try {
        this.proc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      this.proc = null;
    }
  }
}
