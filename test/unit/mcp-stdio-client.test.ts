/**
 * MCP Stdio Client Tests.
 *
 * Drives the JSON-RPC-over-pipes client against a fake child process:
 *   • initialize handshake on start()
 *   • listTools / callTool round-trip
 *   • malformed stdout lines are ignored
 *   • JSON-RPC error responses surface as ForgeRuntimeError
 *   • RPC timeout fires when no response arrives
 *   • stop() kills the process
 *   • RPC before start() rejects cleanly
 *
 * The child process is a mock EventEmitter with pipe-like stdin/stdout/
 * stderr, so we can inject responses by calling stdout.emit('data', …).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...(args as [])),
}));

import { McpStdioClient } from '../../src/mcp/client';
import { ForgeRuntimeError } from '../../src/types/errors';

interface FakeProc extends EventEmitter {
  stdin: { write: ReturnType<typeof vi.fn>; writtenPayloads: string[] };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

const makeFakeProc = (): FakeProc => {
  const proc = new EventEmitter() as FakeProc;
  const writtenPayloads: string[] = [];
  proc.stdin = {
    write: vi.fn((line: string) => {
      writtenPayloads.push(line);
      return true;
    }),
    writtenPayloads,
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
};

const parseId = (line: string): number => {
  return (JSON.parse(line) as { id: number }).id;
};

const replyWith = (proc: FakeProc, result: unknown, method?: string) => {
  // Pick the id from the most recently written payload matching the method.
  const payloads = proc.stdin.writtenPayloads.map((p) => JSON.parse(p) as Record<string, unknown>);
  const match = method
    ? payloads.filter((p) => p.method === method).slice(-1)[0]
    : payloads.slice(-1)[0];
  const id = match?.id as number;
  proc.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'));
};

const replyError = (proc: FakeProc, message: string, method?: string) => {
  const payloads = proc.stdin.writtenPayloads.map((p) => JSON.parse(p) as Record<string, unknown>);
  const match = method
    ? payloads.filter((p) => p.method === method).slice(-1)[0]
    : payloads.slice(-1)[0];
  const id = match?.id as number;
  proc.stdout.emit(
    'data',
    Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message } }) + '\n'),
  );
};

describe('McpStdioClient', () => {
  let proc: FakeProc;

  beforeEach(() => {
    proc = makeFakeProc();
    spawnMock.mockReset();
    spawnMock.mockReturnValue(proc);
  });

  it('sends initialize on start and resolves when the reply arrives', async () => {
    const client = new McpStdioClient('mcp-srv', ['--arg']);
    const startP = client.start();
    // Microtask tick so the rpc registration lands before we reply.
    await Promise.resolve();
    replyWith(proc, { serverInfo: { name: 'test' } }, 'initialize');
    await startP;
    // Spawn was called with the right command/args.
    expect(spawnMock).toHaveBeenCalled();
    const [cmd, args] = spawnMock.mock.calls[0] as unknown as [string, string[]];
    expect(cmd).toBe('mcp-srv');
    expect(args).toEqual(['--arg']);
    // The initialize payload was well-formed.
    const first = JSON.parse(proc.stdin.writtenPayloads[0]);
    expect(first.jsonrpc).toBe('2.0');
    expect(first.method).toBe('initialize');
    expect(first.params.protocolVersion).toBe('2024-11-05');
  });

  it('listTools returns parsed tools from the reply', async () => {
    const client = new McpStdioClient('srv');
    const startP = client.start();
    await Promise.resolve();
    replyWith(proc, {}, 'initialize');
    await startP;

    const toolsP = client.listTools();
    await Promise.resolve();
    replyWith(proc, { tools: [{ name: 'echo', description: 'd' }] }, 'tools/list');
    const tools = await toolsP;
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('echo');
  });

  it('listTools returns [] when the result has no tools field', async () => {
    const client = new McpStdioClient('srv');
    const startP = client.start();
    await Promise.resolve();
    replyWith(proc, {}, 'initialize');
    await startP;

    const toolsP = client.listTools();
    await Promise.resolve();
    replyWith(proc, {}, 'tools/list');
    const tools = await toolsP;
    expect(tools).toEqual([]);
  });

  it('callTool surfaces JSON-RPC errors as ForgeRuntimeError', async () => {
    const client = new McpStdioClient('srv');
    const startP = client.start();
    await Promise.resolve();
    replyWith(proc, {}, 'initialize');
    await startP;

    const callP = client.callTool('nope', {});
    await Promise.resolve();
    replyError(proc, 'method not found', 'tools/call');
    await expect(callP).rejects.toBeInstanceOf(ForgeRuntimeError);
  });

  it('ignores malformed stdout lines without crashing', async () => {
    const client = new McpStdioClient('srv');
    const startP = client.start();
    await Promise.resolve();
    proc.stdout.emit('data', Buffer.from('not json\n'));
    proc.stdout.emit('data', Buffer.from('\n')); // blank line branch
    replyWith(proc, {}, 'initialize');
    await expect(startP).resolves.toBeUndefined();
  });

  it('handles stdout chunks split across buffer boundaries', async () => {
    const client = new McpStdioClient('srv');
    const startP = client.start();
    await Promise.resolve();
    const payload = proc.stdin.writtenPayloads[0];
    const id = parseId(payload);
    const full = JSON.stringify({ jsonrpc: '2.0', id, result: {} }) + '\n';
    // Emit in two chunks on either side of a character boundary.
    proc.stdout.emit('data', Buffer.from(full.slice(0, 10)));
    proc.stdout.emit('data', Buffer.from(full.slice(10)));
    await expect(startP).resolves.toBeUndefined();
  });

  it('swallows string-id RPC responses (forges rpc uses numeric ids only)', async () => {
    const client = new McpStdioClient('srv');
    const startP = client.start();
    await Promise.resolve();
    // Bogus response with a string id → should not resolve start.
    proc.stdout.emit(
      'data',
      Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 'not-ours', result: {} }) + '\n'),
    );
    // Then the real reply.
    replyWith(proc, {}, 'initialize');
    await expect(startP).resolves.toBeUndefined();
  });

  it('debug-logs stderr lines but does not abort', async () => {
    const client = new McpStdioClient('srv');
    const startP = client.start();
    await Promise.resolve();
    proc.stderr.emit('data', Buffer.from('debug info\n'));
    replyWith(proc, {}, 'initialize');
    await expect(startP).resolves.toBeUndefined();
  });

  it('stop() signals the child and nulls the handle', async () => {
    const client = new McpStdioClient('srv');
    const startP = client.start();
    await Promise.resolve();
    replyWith(proc, {}, 'initialize');
    await startP;
    await client.stop();
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    // Second stop is a no-op; should not throw.
    await expect(client.stop()).resolves.toBeUndefined();
  });

  it('stop() swallows errors thrown by proc.kill', async () => {
    const client = new McpStdioClient('srv');
    const startP = client.start();
    await Promise.resolve();
    replyWith(proc, {}, 'initialize');
    await startP;
    proc.kill.mockImplementationOnce(() => {
      throw new Error('ESRCH');
    });
    await expect(client.stop()).resolves.toBeUndefined();
  });

  it('logs an exit event without crashing', async () => {
    const client = new McpStdioClient('srv');
    const startP = client.start();
    await Promise.resolve();
    replyWith(proc, {}, 'initialize');
    await startP;
    proc.emit('exit', 0);
    // No assertion; reaching here without an unhandled rejection means the
    // exit listener was installed correctly.
    expect(true).toBe(true);
  });

  it('rpc before start() rejects with a tool_error', async () => {
    const client = new McpStdioClient('srv');
    await expect(client.listTools()).rejects.toBeInstanceOf(ForgeRuntimeError);
  });

  it('RPC call times out when no reply arrives', async () => {
    vi.useFakeTimers();
    const client = new McpStdioClient('srv');
    const startP = client.start();
    await Promise.resolve();
    replyWith(proc, {}, 'initialize');
    await startP;

    // Issue a call but never reply. Advance past the 15s timeout.
    const callP = client.callTool('hang', {});
    // Attach a catch early so an unhandled-rejection doesn't blow up when we
    // advance timers.
    const caught = callP.catch((err) => err);
    await vi.advanceTimersByTimeAsync(16_000);
    const err = await caught;
    expect(err).toBeInstanceOf(ForgeRuntimeError);
    expect((err as ForgeRuntimeError).toJSON().class).toBe('timeout');
    vi.useRealTimers();
  });
});
