import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ConversationTurn,
  appendUserTurn,
  attachTurnResult,
  attachTurnResultSync,
  composeDescription,
  createConversation,
  deleteConversation,
  findConversationFile,
  listConversations,
  loadConversation,
  newTurnId,
  renameConversation,
  watchConversationFile,
} from '../../src/core/conversation';
import { ensureProjectDir, projectSubdirs } from '../../src/config/paths';

let tmp = '';
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-conv-'));
  // Materialise the project's forge-home layout so readers find the sessions dir.
  ensureProjectDir(tmp);
});
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

const makeTurn = (
  input: string,
  mode: ConversationTurn['mode'] = 'balanced',
): ConversationTurn => ({
  id: newTurnId(),
  at: new Date().toISOString(),
  input,
  mode,
  status: 'pending',
});

describe('conversation — create + read', () => {
  it('creates with explicit source and persists metadata', async () => {
    const c = await createConversation({
      projectPath: tmp,
      source: 'repl',
      title: 'first',
      mode: 'fast',
    });
    expect(c.meta.source).toBe('repl');
    expect(c.meta.title).toBe('first');
    expect(c.meta.mode).toBe('fast');
    const loaded = loadConversation(tmp, c.meta.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.meta.id).toBe(c.meta.id);
    expect(loaded!.turns).toEqual([]);
  });

  it('returns null for missing conversations', () => {
    expect(loadConversation(tmp, 'nope-nonexistent')).toBeNull();
  });

  it('round-trips user turns + results', async () => {
    const c = await createConversation({ projectPath: tmp, source: 'chat' });
    const t = makeTurn('do the thing');
    await appendUserTurn(tmp, c.meta.id, t);
    await attachTurnResult(tmp, c.meta.id, {
      turnId: t.id,
      taskId: 'task-xyz',
      status: 'done',
      result: {
        taskId: 'task-xyz',
        success: true,
        summary: 'ok',
        filesChanged: ['a.ts'],
        durationMs: 100,
        costUsd: 0.01,
      },
    });

    const loaded = loadConversation(tmp, c.meta.id)!;
    expect(loaded.turns).toHaveLength(1);
    expect(loaded.turns[0].status).toBe('done');
    expect(loaded.turns[0].result?.summary).toBe('ok');
    expect(loaded.turns[0].taskId).toBe('task-xyz');
  });
});

describe('conversation — legacy format compatibility', () => {
  it('reads legacy SessionEntry format from an older REPL session', () => {
    const sessionsDir = projectSubdirs(tmp).sessions;
    fs.mkdirSync(sessionsDir, { recursive: true });
    const legacy = path.join(sessionsDir, 'repl-sess_legacy123.jsonl');
    const now = new Date().toISOString();
    fs.writeFileSync(
      legacy,
      [
        JSON.stringify({
          type: 'user',
          content: { input: 'hello', mode: 'balanced' },
          timestamp: now,
        }),
        JSON.stringify({
          type: 'result',
          content: {
            taskId: 'legacy-task',
            success: true,
            summary: 'did it',
            filesChanged: ['x.ts'],
            durationMs: 200,
          },
          timestamp: now,
        }),
        '',
      ].join('\n'),
    );
    const loaded = loadConversation(tmp, 'repl-sess_legacy123')!;
    expect(loaded).not.toBeNull();
    expect(loaded.turns).toHaveLength(1);
    expect(loaded.turns[0].input).toBe('hello');
    expect(loaded.turns[0].status).toBe('done');
    expect(loaded.turns[0].result?.summary).toBe('did it');
    expect(loaded.meta.source).toBe('repl'); // derived from filename
  });

  it('accepts a mixed file (legacy + new events appended later)', async () => {
    const sessionsDir = projectSubdirs(tmp).sessions;
    fs.mkdirSync(sessionsDir, { recursive: true });
    const f = path.join(sessionsDir, 'repl-sess_mixed.jsonl');
    const t = new Date().toISOString();
    fs.writeFileSync(
      f,
      JSON.stringify({ type: 'user', content: { input: 'one' }, timestamp: t }) + '\n',
    );
    // New event written by modern code — co-exists in same file.
    const newTurn = makeTurn('two');
    await appendUserTurn(tmp, 'repl-sess_mixed', newTurn);
    const loaded = loadConversation(tmp, 'repl-sess_mixed')!;
    expect(loaded.turns.map((x) => x.input)).toEqual(['one', 'two']);
  });
});

describe('conversation — listing', () => {
  it('lists newest first and tags source', async () => {
    const a = await createConversation({ projectPath: tmp, source: 'repl', title: 'A' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await createConversation({ projectPath: tmp, source: 'chat', title: 'B' });
    const list = listConversations(tmp);
    expect(list.map((x) => x.id)).toEqual([b.meta.id, a.meta.id]);
    expect(list[0].source).toBe('chat');
    expect(list[1].source).toBe('repl');
  });

  it('reports turn count + title accurately across both surfaces', async () => {
    const a = await createConversation({ projectPath: tmp, source: 'repl', title: 'A' });
    await appendUserTurn(tmp, a.meta.id, makeTurn('one'));
    await appendUserTurn(tmp, a.meta.id, makeTurn('two'));
    const list = listConversations(tmp);
    const entry = list.find((x) => x.id === a.meta.id)!;
    expect(entry.turns).toBe(2);
    expect(entry.title).toBe('A');
    expect(entry.source).toBe('repl');
  });

  it('returns an empty array for a fresh project', () => {
    expect(listConversations(tmp)).toEqual([]);
  });
});

describe('conversation — rename + delete', () => {
  it('renameConversation updates title via meta-updated event', async () => {
    const c = await createConversation({ projectPath: tmp, source: 'chat' });
    await renameConversation(tmp, c.meta.id, 'renamed');
    const loaded = loadConversation(tmp, c.meta.id)!;
    expect(loaded.meta.title).toBe('renamed');
  });

  it('deleteConversation removes the file', async () => {
    const c = await createConversation({ projectPath: tmp, source: 'chat' });
    const file = findConversationFile(tmp, c.meta.id);
    expect(fs.existsSync(file)).toBe(true);
    expect(deleteConversation(tmp, c.meta.id)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(loadConversation(tmp, c.meta.id)).toBeNull();
  });

  it('returns false when deleting a non-existent conversation', () => {
    expect(deleteConversation(tmp, 'nope-missing')).toBe(false);
  });
});

describe('conversation — composeDescription', () => {
  it('returns the bare input when no prior turns', () => {
    expect(composeDescription('go', [])).toBe('go');
  });

  it('embeds completed prior turns into the planner prompt', () => {
    const turns: ConversationTurn[] = [
      {
        id: 't1',
        at: '1',
        input: 'first',
        mode: 'balanced',
        status: 'done',
        result: {
          taskId: 'tk1',
          success: true,
          summary: 'ok',
          filesChanged: ['a.ts', 'b.ts'],
          durationMs: 10,
        },
      },
    ];
    const d = composeDescription('next', turns);
    expect(d).toContain('## Current request');
    expect(d).toContain('next');
    expect(d).toContain('## Conversation so far');
    expect(d).toContain('first');
    expect(d).toContain('a.ts, b.ts');
  });

  it('ignores pending and running turns', () => {
    const turns: ConversationTurn[] = [
      { id: 't1', at: '1', input: 'pending', mode: 'balanced', status: 'pending' },
      { id: 't2', at: '2', input: 'running', mode: 'balanced', status: 'running' },
    ];
    const d = composeDescription('new', turns);
    expect(d).toBe('new'); // no prior turns qualify → bare input
  });

  it('caps at MAX_TURNS_IN_CONTEXT (default 6) of the most recent completed turns', () => {
    const turns: ConversationTurn[] = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      at: String(i),
      input: `turn-${i}`,
      mode: 'balanced' as const,
      status: 'done' as const,
      result: {
        taskId: `tk${i}`,
        success: true,
        summary: 's',
        filesChanged: [],
        durationMs: 1,
      },
    }));
    const d = composeDescription('next', turns);
    // Should include the last 6, not the first 4.
    expect(d).toContain('turn-9');
    expect(d).toContain('turn-4');
    expect(d).not.toContain('turn-0');
    expect(d).not.toContain('turn-3');
  });
});

describe('conversation — live watcher + sync append', () => {
  it('reports newly appended turns to subscribers', async () => {
    const c = await createConversation({ projectPath: tmp, source: 'chat' });
    const events: unknown[] = [];
    const w = watchConversationFile(tmp, c.meta.id, (update) => {
      events.push(...update.newTurns);
    });
    await new Promise((r) => setTimeout(r, 40));
    const t = makeTurn('live');
    await appendUserTurn(tmp, c.meta.id, t);
    for (let i = 0; i < 40 && events.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(events.some((x) => (x as ConversationTurn).input === 'live')).toBe(true);
    w.close();
  });

  it('attachTurnResultSync updates the turn without awaiting', async () => {
    const c = await createConversation({ projectPath: tmp, source: 'chat' });
    const t = makeTurn('async-ok');
    await appendUserTurn(tmp, c.meta.id, t);
    attachTurnResultSync(tmp, c.meta.id, {
      turnId: t.id,
      taskId: 'taskX',
      status: 'done',
      result: {
        taskId: 'taskX',
        success: true,
        summary: 'ok',
        filesChanged: [],
        durationMs: 5,
      },
    });
    const loaded = loadConversation(tmp, c.meta.id)!;
    expect(loaded.turns[0].status).toBe('done');
    expect(loaded.turns[0].taskId).toBe('taskX');
  });
});

describe('conversation — concurrency across writers', () => {
  it('100 parallel appendUserTurn calls all land exactly once', async () => {
    const c = await createConversation({ projectPath: tmp, source: 'chat' });
    const turns: ConversationTurn[] = Array.from({ length: 100 }, (_, i) => ({
      id: `t${i}`,
      at: new Date().toISOString(),
      input: `p${i}`,
      mode: 'balanced',
      status: 'pending',
    }));
    await Promise.all(turns.map((t) => appendUserTurn(tmp, c.meta.id, t)));
    const loaded = loadConversation(tmp, c.meta.id)!;
    expect(loaded.turns).toHaveLength(100);
    const ids = new Set(loaded.turns.map((t) => t.id));
    expect(ids.size).toBe(100);
  });
});
