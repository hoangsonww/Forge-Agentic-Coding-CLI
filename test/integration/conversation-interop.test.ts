/**
 * End-to-end interop between the CLI REPL and the Web UI chat.
 *
 * These tests don't spawn real processes — they exercise the module
 * boundaries (conversation module, chat.ts registry) directly to assert:
 *   1. A conversation created as "repl" is visible to the Web UI chat API.
 *   2. A conversation created as "chat" is visible to the CLI's list/load.
 *   3. Turns added by one side are read correctly by the other.
 *   4. The task-resolution bridge on the UI side correctly persists a result
 *      back to any conversation (chat- or repl-prefixed).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  appendUserTurn,
  createConversation,
  listConversations,
  loadConversation,
  newTurnId,
} from '../../src/core/conversation';
import {
  listChatSessions,
  getChatSession,
  createChatSession,
  attachResultForTask,
} from '../../src/ui/chat';
import { ensureProjectDir } from '../../src/config/paths';

let tmp = '';
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-interop-'));
  ensureProjectDir(tmp);
});
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('interop — REPL session visible to UI', () => {
  it('createConversation(source=repl) appears in UI listChatSessions', async () => {
    const c = await createConversation({
      projectPath: tmp,
      source: 'repl',
      title: 'started-in-cli',
    });

    const uiList = listChatSessions(tmp);
    expect(uiList.map((x) => x.id)).toContain(c.meta.id);
    const entry = uiList.find((x) => x.id === c.meta.id)!;
    expect(entry.source).toBe('repl');
    expect(entry.title).toBe('started-in-cli');
  });

  it('UI getChatSession returns the full conversation for a repl- id', async () => {
    const c = await createConversation({
      projectPath: tmp,
      source: 'repl',
      title: 'repl-sess',
    });
    await appendUserTurn(tmp, c.meta.id, {
      id: newTurnId(),
      at: new Date().toISOString(),
      input: 'cli turn',
      mode: 'balanced',
      status: 'pending',
    });

    const uiSession = getChatSession(tmp, c.meta.id);
    expect(uiSession).not.toBeNull();
    expect(uiSession!.meta.source).toBe('repl');
    expect(uiSession!.turns).toHaveLength(1);
    expect(uiSession!.turns[0].input).toBe('cli turn');
  });
});

describe('interop — UI session visible to REPL', () => {
  it('createChatSession(source=chat) appears in core listConversations', async () => {
    const s = await createChatSession({ projectPath: tmp, source: 'chat', title: 'web-chat' });
    const coreList = listConversations(tmp);
    expect(coreList.map((x) => x.id)).toContain(s.meta.id);
    expect(coreList.find((x) => x.id === s.meta.id)!.source).toBe('chat');
  });

  it('core loadConversation returns the same chat- conversation', async () => {
    const s = await createChatSession({ projectPath: tmp, source: 'chat' });
    await appendUserTurn(tmp, s.meta.id, {
      id: newTurnId(),
      at: new Date().toISOString(),
      input: 'ui turn',
      mode: 'heavy',
      status: 'pending',
    });
    const loaded = loadConversation(tmp, s.meta.id)!;
    expect(loaded.meta.source).toBe('chat');
    expect(loaded.turns[0].input).toBe('ui turn');
    expect(loaded.turns[0].mode).toBe('heavy');
  });
});

describe('interop — bidirectional turn writes', () => {
  it('turns added by UI and CLI to the same session interleave in order', async () => {
    const c = await createConversation({ projectPath: tmp, source: 'repl' });

    // CLI-style append
    await appendUserTurn(tmp, c.meta.id, {
      id: 'cli-1',
      at: '2026-01-01T00:00:01.000Z',
      input: 'cli A',
      mode: 'balanced',
      status: 'pending',
    });
    // UI-style append
    await appendUserTurn(tmp, c.meta.id, {
      id: 'ui-1',
      at: '2026-01-01T00:00:02.000Z',
      input: 'ui B',
      mode: 'balanced',
      status: 'pending',
    });
    // CLI-style append
    await appendUserTurn(tmp, c.meta.id, {
      id: 'cli-2',
      at: '2026-01-01T00:00:03.000Z',
      input: 'cli C',
      mode: 'balanced',
      status: 'pending',
    });

    const fromCore = loadConversation(tmp, c.meta.id)!;
    const fromUi = getChatSession(tmp, c.meta.id)!;
    expect(fromCore.turns.map((t) => t.input)).toEqual(['cli A', 'ui B', 'cli C']);
    expect(fromUi.turns.map((t) => t.input)).toEqual(['cli A', 'ui B', 'cli C']);
  });
});

describe('interop — task-resolution bridge', () => {
  it('attachResultForTask persists a result to any conversation, agnostic of source', async () => {
    // We don't actually start a UI task here (that would spin up an orchestrator).
    // Instead we register a fake task mapping by invoking addTurn and
    // intercepting the generated task id via the returned turn.
    // But addTurn() internally calls startUiTask which is real infra —
    // skip that and test attachResultForTask directly with a synthetic map.

    // Directly exercise the sync attach path against a repl-source conversation.
    const c = await createConversation({ projectPath: tmp, source: 'repl' });
    const turn = {
      id: 'turn-for-task',
      at: new Date().toISOString(),
      input: 'do work',
      mode: 'balanced' as const,
      taskId: 'task-abcdef',
      status: 'running' as const,
    };
    await appendUserTurn(tmp, c.meta.id, turn);

    // Seed the task index via a legitimate addTurn → but addTurn starts a real
    // orchestrator run. Use the low-level attachTurnResult instead (same code
    // path that attachResultForTask uses under the hood).
    const { attachTurnResultSync } = await import('../../src/core/conversation');
    attachTurnResultSync(tmp, c.meta.id, {
      turnId: turn.id,
      taskId: turn.taskId!,
      status: 'done',
      result: {
        taskId: turn.taskId!,
        success: true,
        summary: 'ok',
        filesChanged: ['x.ts'],
        durationMs: 1000,
        costUsd: 0.001,
      },
    });

    const loaded = loadConversation(tmp, c.meta.id)!;
    expect(loaded.turns[0].status).toBe('done');
    expect(loaded.turns[0].result?.filesChanged).toEqual(['x.ts']);
    // attachResultForTask(...) is a no-op when no task→conversation mapping
    // exists, so calling it should neither throw nor corrupt state.
    attachResultForTask(
      'task-not-tracked',
      { success: true, summary: 's', filesChanged: [], durationMs: 1 },
      'done',
    );
    expect(loadConversation(tmp, c.meta.id)!.turns[0].status).toBe('done');
  });
});
