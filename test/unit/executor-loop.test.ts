/**
 * Integration tests for the iterative executor loop.
 *
 * The real model provider is replaced with a scripted stub so each test can
 * assert exactly how the loop reacts to tool results — iteration, failure
 * recovery, validation-gate feedback, and turn-cap enforcement.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const modelCalls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
let scriptedResponses: string[] = [];
let responseIndex = 0;

vi.mock('../../src/models/router', () => ({
  callModel: vi.fn(async (_role: string, _mode: string, messages: unknown[]) => {
    // Deep-clone the messages array — the loop mutates it across turns and
    // we want to snapshot what the model actually saw on each call.
    modelCalls.push({ messages: JSON.parse(JSON.stringify(messages)) });
    const content =
      scriptedResponses[responseIndex] ?? '{"actions":[],"summary":"oops","done":true}';
    responseIndex++;
    return {
      response: {
        content,
        model: 'stub',
        provider: 'stub',
        durationMs: 1,
        finishReason: 'stop',
      },
      decision: { provider: 'stub', model: 'stub', reason: 'test' },
      cached: false,
      costUsd: 0,
    };
  }),
}));

vi.mock('../../src/permissions/manager', () => ({
  requestPermission: vi.fn(async () => 'allow'),
}));

vi.mock('../../src/config/loader', () => ({
  loadGlobalInstructions: vi.fn(() => ''),
  loadProjectInstructions: vi.fn(() => ''),
  loadGlobalConfig: vi.fn(() => ({
    limits: { maxRetries: 3, maxRuntimeSeconds: 60, maxSteps: 20 },
    completion: { requireReview: false },
    memory: { learningEnabled: false },
  })),
}));

import { runStep } from '../../src/agents/executor';
import { clearTools, registerTool } from '../../src/tools/registry';
import { Tool } from '../../src/types';

const makeEchoTool = (name: string, alwaysFail = false): Tool<any, any> => ({
  schema: {
    name,
    description: `echo ${name}`,
    sideEffect: 'readonly',
    risk: 'low',
    permissionDefault: 'allow',
    sensitivity: 'low',
    timeoutMs: 1_000,
    inputSchema: { type: 'object', properties: {} },
  },
  async execute(args: unknown) {
    if (alwaysFail) {
      return {
        success: false,
        error: { class: 'tool_error', message: `${name} blew up`, retryable: true },
        durationMs: 1,
      };
    }
    return { success: true, output: { echoed: args }, durationMs: 1 };
  },
});

const makeWriteTool = (name: string): Tool<any, any> => ({
  schema: {
    name,
    description: `write ${name}`,
    sideEffect: 'write',
    risk: 'medium',
    permissionDefault: 'allow',
    sensitivity: 'medium',
    timeoutMs: 1_000,
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
  },
  async execute() {
    return { success: true, output: {}, durationMs: 1 };
  },
});

beforeEach(() => {
  clearTools();
  modelCalls.length = 0;
  scriptedResponses = [];
  responseIndex = 0;
});

afterEach(() => {
  clearTools();
});

const baseParams = () => ({
  step: { id: 'step_001', type: 'analyze' as const, description: 'demo' },
  projectRoot: '/tmp',
  taskId: 'task_test',
  projectId: 'proj_test',
  mode: 'balanced' as const,
  flags: {},
});

describe('executor loop — happy path', () => {
  it('stops as soon as the model signals done', async () => {
    registerTool(makeEchoTool('read_file'));
    scriptedResponses = [
      '{"actions":[{"tool":"read_file","args":{"path":"a.ts"}}],"summary":"read a"}',
      '{"actions":[],"summary":"all good","done":true}',
    ];

    const out = await runStep(baseParams());

    expect(out.completed).toBe(true);
    expect(out.turns).toBe(2);
    expect(out.toolResults).toHaveLength(1);
    expect(out.toolResults[0].tool).toBe('read_file');
    expect(out.summary).toBe('all good');
  });
});

describe('executor loop — failure recovery', () => {
  it('feeds tool failures back so the model can try a different approach', async () => {
    registerTool(makeEchoTool('grep', true));
    registerTool(makeEchoTool('read_file'));
    scriptedResponses = [
      '{"actions":[{"tool":"grep","args":{"q":"foo"}}],"summary":"search"}',
      '{"actions":[{"tool":"read_file","args":{"path":"b.ts"}}],"summary":"read instead"}',
      '{"actions":[],"summary":"recovered","done":true}',
    ];

    const out = await runStep(baseParams());

    expect(out.completed).toBe(true);
    expect(out.toolResults.map((r) => r.tool)).toEqual(['grep', 'read_file']);
    expect(out.toolResults[0].result.success).toBe(false);
    expect(out.toolResults[1].result.success).toBe(true);
    // The second model call must have been told about the first failure.
    const recoveryPrompt = modelCalls[1].messages[modelCalls[1].messages.length - 1].content;
    expect(recoveryPrompt).toContain('TOOL_RESULTS');
    expect(recoveryPrompt).toContain('grep');
  });
});

describe('executor loop — turn cap', () => {
  it('stops at the mode cap even if the model never signals done', async () => {
    registerTool(makeEchoTool('read_file'));
    // Keep producing actions forever — the loop must still halt.
    const chatter = '{"actions":[{"tool":"read_file","args":{}}],"summary":"keep going"}';
    scriptedResponses = [chatter, chatter, chatter, chatter, chatter, chatter];

    const out = await runStep({ ...baseParams(), mode: 'balanced' });

    // Balanced mode caps executor turns at 4.
    expect(out.turns).toBeLessThanOrEqual(4);
    expect(out.completed).toBe(false);
  });
});

describe('executor loop — validation gate', () => {
  it('surfaces validation failure as a tool result and marks the step incomplete', async () => {
    registerTool(makeWriteTool('write_file'));
    scriptedResponses = [
      '{"actions":[{"tool":"write_file","args":{"path":"out.ts"}}],"summary":"wrote"}',
      '{"actions":[],"summary":"done","done":true}',
      // Retry turn(s) after validation failure
      '{"actions":[],"summary":"giving up","done":true}',
    ];

    const out = await runStep({
      ...baseParams(),
      mode: 'balanced',
      validate: async () => ({
        ok: false,
        ran: ['npm run -s typecheck'],
        message: 'TS2322: Type string is not assignable to number.',
      }),
    });

    expect(out.completed).toBe(false);
    const last = out.toolResults[out.toolResults.length - 1];
    expect(last.tool).toBe('validation_gate');
    expect(last.result.success).toBe(false);
    expect(last.result.error?.message).toContain('TS2322');
  });

  it('passes through when validation succeeds', async () => {
    registerTool(makeWriteTool('write_file'));
    scriptedResponses = [
      '{"actions":[{"tool":"write_file","args":{"path":"out.ts"}}],"summary":"wrote","done":true}',
    ];

    const out = await runStep({
      ...baseParams(),
      mode: 'balanced',
      validate: async () => ({ ok: true, ran: ['typecheck'] }),
    });

    expect(out.completed).toBe(true);
    expect(out.filesChanged).toContain('out.ts');
    expect(out.toolResults.every((r) => r.tool !== 'validation_gate')).toBe(true);
  });
});

describe('executor loop — read-only modes', () => {
  it('blocks mutation tools in plan mode even if the model requests them', async () => {
    registerTool(makeWriteTool('write_file'));
    scriptedResponses = [
      '{"actions":[{"tool":"write_file","args":{"path":"out.ts"}}],"summary":"try write"}',
      '{"actions":[],"summary":"stopped","done":true}',
    ];

    const out = await runStep({ ...baseParams(), mode: 'plan' });

    // maxExecutorTurns is 0 for plan mode → clamped to 1, single call, blocked.
    const writeResult = out.toolResults.find((r) => r.tool === 'write_file');
    expect(writeResult?.result.success).toBe(false);
    expect(writeResult?.result.error?.class).toBe('permission_denied');
  });
});
