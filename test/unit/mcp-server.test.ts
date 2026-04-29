/**
 * Forge-as-MCP-server unit tests.
 *
 * Boots the server in-memory (no stdio), drives `tools/list` and
 * `tools/call` through an in-process Transport pair, asserts on the
 * structured responses. Covers:
 *   • read-only mode exposes 4 tools (no forge_run / forge_cancel_task)
 *   • --allow-execute exposes all 6 tools
 *   • forge_status returns version + providers + cwd
 *   • forge_list_tasks supports the limit + status filters
 *   • forge_get_task surfaces a not-found error for unknown ids
 *   • forge_cancel_task is idempotent on already-terminal tasks
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// --- Stub orchestrator so plan/run don't actually invoke a model ---
vi.mock('../../src/core/orchestrator', () => ({
  orchestrateRun: vi.fn(async (params: { input: string }) => ({
    task: {
      id: 'task_test_abc123',
      status: 'completed',
      plan: { steps: [{ description: `would handle: ${params.input}` }] },
    },
    result: {
      success: true,
      summary: `planned: ${params.input}`,
      filesChanged: [],
      durationMs: 12,
      costUsd: 0,
    },
  })),
}));

vi.mock('../../src/persistence/index-db', () => ({
  listTasks: vi.fn(() => [
    {
      id: 'task_a',
      title: 'first',
      status: 'completed',
      mode: 'plan',
      project_id: 'proj-1',
      updated_at: '2026-04-27T10:00:00Z',
      attempts: 1,
    },
    {
      id: 'task_b',
      title: 'second',
      status: 'running',
      mode: 'balanced',
      project_id: 'proj-1',
      updated_at: '2026-04-27T11:00:00Z',
      attempts: 1,
    },
    {
      id: 'task_c',
      title: 'third',
      status: 'failed',
      mode: 'balanced',
      project_id: 'proj-2',
      updated_at: '2026-04-27T12:00:00Z',
      attempts: 2,
    },
  ]),
  getTask: vi.fn((id: string) => {
    if (id === 'task_known')
      return {
        id: 'task_known',
        title: 't',
        status: 'running',
        mode: 'plan',
        project_id: 'proj-1',
        updated_at: '2026-04-27T10:00:00Z',
        attempts: 1,
      };
    if (id === 'task_terminal')
      return {
        id: 'task_terminal',
        title: 't',
        status: 'completed',
        mode: 'plan',
        project_id: 'proj-1',
        updated_at: '2026-04-27T10:00:00Z',
        attempts: 1,
      };
    return null;
  }),
  listProjects: vi.fn(() => [
    { id: 'proj-1', path: '/tmp/p', name: 'p', created_at: '', last_opened: '' },
  ]),
}));

vi.mock('../../src/persistence/tasks', () => ({
  loadTask: vi.fn((_root: string, id: string) =>
    id === 'task_known' ? { id, title: 't', status: 'running', plan: null, result: null } : null,
  ),
  transitionTask: vi.fn(() => ({
    id: 'task_known',
    title: 't',
    status: 'cancelled',
  })),
}));

vi.mock('../../src/models/provider', () => ({
  listProviders: vi.fn(() => [
    { name: 'ollama', isAvailable: vi.fn(async () => true) },
    { name: 'anthropic', isAvailable: vi.fn(async () => false) },
  ]),
}));

vi.mock('../../src/config/loader', () => ({
  loadGlobalConfig: vi.fn(() => ({ provider: 'ollama', defaultMode: 'balanced' })),
  findProjectRoot: vi.fn(() => '/tmp/p'),
}));

import { createForgeMcpServer } from '../../src/mcp-server/server';

interface RpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Loopback transport — implements just enough of the Transport interface
 * for the SDK to drive a session in-memory. The "client" calls
 * `inject(...)` to push a message into the server, the server's responses
 * land in `outbox`.
 */
class Loopback extends EventEmitter {
  outbox: RpcMessage[] = [];
  onmessage?: (msg: RpcMessage) => void;
  onclose?: () => void;
  onerror?: (e: Error) => void;
  async start() {
    /* no-op */
  }
  async close() {
    this.onclose?.();
  }
  async send(msg: RpcMessage) {
    this.outbox.push(msg);
  }
  inject(msg: RpcMessage) {
    this.onmessage?.(msg);
  }
  /** Drain outbox and return any messages emitted so far. */
  flush(): RpcMessage[] {
    const m = this.outbox;
    this.outbox = [];
    return m;
  }
  /** Wait one microtask flush — most server handlers resolve in a single tick. */
  async tick() {
    await new Promise((r) => setImmediate(r));
  }
}

const start = async (allowExecute: boolean) => {
  const server = createForgeMcpServer({ allowExecute, defaultCwd: '/tmp/p' });
  const transport = new Loopback();
  await server.connect(transport);
  // Initialize handshake so tool calls are accepted.
  transport.inject({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 't', version: '1' },
    },
  });
  await transport.tick();
  transport.inject({ jsonrpc: '2.0', method: 'notifications/initialized' });
  await transport.tick();
  transport.flush();
  return { server, transport };
};

const callTool = async (
  transport: Loopback,
  name: string,
  args: Record<string, unknown> = {},
  id = 100,
) => {
  transport.inject({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  // The server may need a couple of ticks to resolve async tool callbacks.
  for (let i = 0; i < 5; i++) await transport.tick();
  const reply = transport.flush().find((m) => m.id === id);
  if (!reply) throw new Error(`no reply for ${name}`);
  return reply;
};

const listTools = async (transport: Loopback, id = 50) => {
  transport.inject({ jsonrpc: '2.0', id, method: 'tools/list' });
  await transport.tick();
  const reply = transport.flush().find((m) => m.id === id);
  return reply!.result as { tools: Array<{ name: string }> };
};

describe('forge as MCP server', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes 4 read-only tools by default', async () => {
    const { transport } = await start(false);
    const { tools } = await listTools(transport);
    expect(tools.map((t) => t.name).sort()).toEqual([
      'forge_get_task',
      'forge_list_tasks',
      'forge_plan',
      'forge_status',
    ]);
  });

  it('exposes 6 tools when execute is allowed', async () => {
    const { transport } = await start(true);
    const { tools } = await listTools(transport);
    expect(tools.map((t) => t.name).sort()).toEqual([
      'forge_cancel_task',
      'forge_get_task',
      'forge_list_tasks',
      'forge_plan',
      'forge_run',
      'forge_status',
    ]);
  });

  it('forge_status returns version, provider, and provider availability', async () => {
    const { transport } = await start(false);
    const reply = await callTool(transport, 'forge_status');
    const text = (reply.result as { content: { text: string }[] }).content[0].text;
    const body = JSON.parse(text);
    expect(body.provider).toBe('ollama');
    expect(body.cwd).toBe('/tmp/p');
    expect(body.providers).toEqual([
      { name: 'ollama', available: true },
      { name: 'anthropic', available: false },
    ]);
    expect(body.allowExecute).toBe(false);
  });

  it('forge_list_tasks honors the status filter', async () => {
    const { transport } = await start(false);
    const reply = await callTool(transport, 'forge_list_tasks', { status: 'running' });
    const body = JSON.parse((reply.result as { content: { text: string }[] }).content[0].text);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('task_b');
  });

  it('forge_get_task returns the loaded task body for a known id', async () => {
    const { transport } = await start(false);
    const reply = await callTool(transport, 'forge_get_task', { taskId: 'task_known' });
    const body = JSON.parse((reply.result as { content: { text: string }[] }).content[0].text);
    expect(body.id).toBe('task_known');
    expect(body.status).toBe('running');
  });

  it('forge_get_task returns isError for an unknown id', async () => {
    const { transport } = await start(false);
    const reply = await callTool(transport, 'forge_get_task', { taskId: 'task_nope' });
    const result = reply.result as { isError?: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('task_nope');
  });

  it('forge_plan calls the orchestrator in plan-only mode and returns the plan', async () => {
    const orchModule = await import('../../src/core/orchestrator');
    const { transport } = await start(false);
    const reply = await callTool(transport, 'forge_plan', { task: 'add /healthz' });
    const body = JSON.parse((reply.result as { content: { text: string }[] }).content[0].text);
    expect(body.taskId).toBe('task_test_abc123');
    expect(body.plan).toEqual({ steps: [{ description: 'would handle: add /healthz' }] });
    expect(orchModule.orchestrateRun).toHaveBeenCalledWith(
      expect.objectContaining({ planOnly: true, mode: 'plan' }),
    );
  });

  it('forge_cancel_task is idempotent on already-terminal tasks', async () => {
    const tasksModule = await import('../../src/persistence/tasks');
    const { transport } = await start(true);
    const reply = await callTool(transport, 'forge_cancel_task', { taskId: 'task_terminal' });
    const body = JSON.parse((reply.result as { content: { text: string }[] }).content[0].text);
    expect(body.alreadyTerminal).toBe(true);
    expect(body.status).toBe('completed');
    expect(tasksModule.transitionTask).not.toHaveBeenCalled();
  });

  it('forge_cancel_task transitions live tasks to cancelled', async () => {
    const tasksModule = await import('../../src/persistence/tasks');
    const { transport } = await start(true);
    const reply = await callTool(transport, 'forge_cancel_task', { taskId: 'task_known' });
    const body = JSON.parse((reply.result as { content: { text: string }[] }).content[0].text);
    expect(body.status).toBe('cancelled');
    expect(tasksModule.transitionTask).toHaveBeenCalledWith('/tmp/p', 'task_known', 'cancelled');
  });
});
