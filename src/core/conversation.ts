/**
 * Unified conversation domain model — the single source of truth for
 * multi-turn interactions, shared by the CLI REPL and the Web UI chat.
 *
 * A conversation is an append-only JSONL file on disk at:
 *     <project>/sessions/<source>-<id>.jsonl
 *
 * where `source` is `repl` or `chat` (indicating which surface started the
 * conversation — history only, not authoritative; either surface may append
 * turns to either file).
 *
 * Event schema (unified, forward-going):
 *   { at, kind: 'session-created', meta }
 *   { at, kind: 'turn-user',       turn }
 *   { at, kind: 'turn-result',     turnId, taskId, result, status }
 *   { at, kind: 'meta-updated',    patch }
 *
 * Readers ALSO accept legacy REPL events written by an earlier build:
 *   { type: 'user',   content: { input, mode }, timestamp }
 *   { type: 'result', content: TurnResult,      timestamp }
 *
 * Writers emit only the unified format. No migration — legacy files remain
 * readable forever.
 *
 * Concurrency: all mutations route through conversation-store's atomic
 * append primitives, so multiple writers (CLI REPL + UI chat + tasks) are
 * safe without an explicit coordinator.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ensureProjectDir, projectSubdirs } from '../config/paths';
import { newSessionId } from '../logging/trace';
import { Mode } from '../types';
import {
  atomicAppendLine,
  atomicAppendLineSync,
  readAllLines,
  watchConversation as storeWatch,
  ConversationWatcher,
} from '../persistence/conversation-store';
import { log } from '../logging/logger';

// ---------- Types ----------

export type ConversationSource = 'repl' | 'chat';

export type TurnStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface TurnResult {
  taskId: string;
  success: boolean;
  summary: string;
  filesChanged: string[];
  durationMs: number;
  costUsd?: number;
}

export interface ConversationTurn {
  id: string;
  at: string;
  input: string;
  mode: Mode;
  taskId?: string;
  status: TurnStatus;
  result?: TurnResult;
}

export interface ConversationMeta {
  id: string;
  projectPath: string;
  title: string;
  mode: Mode;
  source: ConversationSource;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  meta: ConversationMeta;
  turns: ConversationTurn[];
}

export interface ConversationSummary {
  id: string;
  source: ConversationSource;
  title: string;
  mode: Mode;
  turns: number;
  createdAt: string;
  lastAt: string;
  sizeBytes: number;
}

// ---------- Event schema ----------

type ConvEvent =
  | { at: string; kind: 'session-created'; meta: ConversationMeta }
  | { at: string; kind: 'turn-user'; turn: ConversationTurn }
  | {
      at: string;
      kind: 'turn-result';
      turnId: string;
      taskId: string;
      result: TurnResult;
      status: TurnStatus;
    }
  | { at: string; kind: 'meta-updated'; patch: Partial<ConversationMeta> };

// Legacy REPL event (see src/types SessionEntry).
type LegacyEvent = {
  type: 'user' | 'result';
  content: Record<string, unknown>;
  timestamp: string;
};

type AnyEvent = ConvEvent | LegacyEvent;

// ---------- Paths ----------

/**
 * Conversation ids are embedded in filenames; an id like "../../../etc/passwd"
 * would escape the sessions directory and write somewhere we don't want.
 * Enforce a strict allow-list: letters, digits, underscore, dash, and the
 * three recognised prefixes. Reject anything else at the earliest boundary.
 */
const ID_PATTERN = /^(?:repl|chat|conv)-[a-z0-9_-]+$/;

const assertSafeId = (id: string): void => {
  if (typeof id !== 'string' || id.length === 0 || id.length > 256) {
    throw new Error(`invalid conversation id: '${String(id)}'`);
  }
  if (!ID_PATTERN.test(id)) {
    throw new Error(`invalid conversation id: '${id}' (expected /^(repl|chat|conv)-[a-z0-9_-]+$/)`);
  }
};

/** Exported for defensive checks at other boundaries (CLI /load input, HTTP
 *  route parameters). */
export const isValidConversationId = (id: string): boolean => {
  try {
    assertSafeId(id);
    return true;
  } catch {
    return false;
  }
};

const conversationPath = (projectPath: string, id: string): string => {
  assertSafeId(id);
  const sub = projectSubdirs(projectPath);
  return path.join(sub.sessions, `${id}.jsonl`);
};

const deriveSourceFromId = (id: string): ConversationSource =>
  id.startsWith('chat-') ? 'chat' : 'repl';

// ---------- Replay ----------

/**
 * Fold an event stream into a Conversation. Handles both new and legacy
 * events. When legacy `user`/`result` entries are seen without a prior
 * `session-created`, we synthesise a minimal meta from the file name +
 * first event timestamp.
 */
const replay = (events: AnyEvent[], id: string, projectPath: string): Conversation => {
  let meta: ConversationMeta | null = null;
  const turns: ConversationTurn[] = [];
  let firstTimestamp = '';
  let lastTimestamp = '';

  const now = () => new Date().toISOString();

  for (const ev of events) {
    // Unified format (discriminated by `kind`).
    if ('kind' in ev) {
      lastTimestamp = ev.at;
      if (!firstTimestamp) firstTimestamp = ev.at;
      switch (ev.kind) {
        case 'session-created':
          meta = { ...ev.meta };
          break;
        case 'turn-user':
          turns.push({ ...ev.turn });
          break;
        case 'turn-result': {
          const t = turns.find((x) => x.id === ev.turnId || x.taskId === ev.taskId);
          if (t) {
            t.result = ev.result;
            t.status = ev.status;
            if (!t.taskId) t.taskId = ev.taskId;
          }
          break;
        }
        case 'meta-updated': {
          if (meta) {
            const patch = (ev.patch ?? {}) as Record<string, unknown>;
            meta = Object.assign({}, meta, patch, { updatedAt: ev.at }) as ConversationMeta;
          }
          break;
        }
      }
      continue;
    }
    // Legacy format (SessionEntry { type, content, timestamp }).
    if (ev.type === 'user') {
      lastTimestamp = ev.timestamp;
      if (!firstTimestamp) firstTimestamp = ev.timestamp;
      const c = ev.content as { input?: string; mode?: Mode };
      turns.push({
        id: `legacy-${turns.length}`,
        at: ev.timestamp,
        input: c.input ?? '',
        mode: (c.mode as Mode) ?? 'balanced',
        status: 'pending',
      });
    } else if (ev.type === 'result' && turns.length) {
      lastTimestamp = ev.timestamp;
      const last = turns[turns.length - 1];
      const raw = (ev.content ?? {}) as Record<string, unknown>;
      const r: TurnResult = {
        taskId: String(raw.taskId ?? ''),
        success: Boolean(raw.success),
        summary: String(raw.summary ?? ''),
        filesChanged: Array.isArray(raw.filesChanged) ? (raw.filesChanged as string[]) : [],
        durationMs: Number(raw.durationMs ?? 0),
        costUsd: typeof raw.costUsd === 'number' ? raw.costUsd : undefined,
      };
      last.result = r;
      last.status = r.success ? 'done' : 'failed';
      if (!last.taskId && r.taskId) last.taskId = r.taskId;
    }
  }

  if (!meta) {
    // Synthesise from file name + first user turn if available.
    const firstInput = turns[0]?.input ?? '';
    meta = {
      id,
      projectPath,
      title: firstInput.slice(0, 80) || 'Untitled',
      mode: turns[0]?.mode ?? 'balanced',
      source: deriveSourceFromId(id),
      createdAt: firstTimestamp || now(),
      updatedAt: lastTimestamp || firstTimestamp || now(),
    };
  } else if (lastTimestamp) {
    meta = { ...meta, updatedAt: lastTimestamp };
  }

  return { meta, turns };
};

// ---------- Public API ----------

export interface CreateConversationOpts {
  projectPath: string;
  title?: string;
  mode?: Mode;
  source?: ConversationSource;
  /** Supply an id (without prefix) to use deterministic names — mostly for tests. */
  id?: string;
}

export const createConversation = async (opts: CreateConversationOpts): Promise<Conversation> => {
  const source: ConversationSource = opts.source ?? 'chat';
  const id = opts.id ? opts.id : `${source}-${newSessionId()}`;
  ensureProjectDir(opts.projectPath);
  const meta: ConversationMeta = {
    id,
    projectPath: opts.projectPath,
    title: opts.title ?? 'New conversation',
    mode: opts.mode ?? 'balanced',
    source,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const event: ConvEvent = { at: meta.createdAt, kind: 'session-created', meta };
  await atomicAppendLine(conversationPath(opts.projectPath, id), JSON.stringify(event));
  return { meta, turns: [] };
};

export const loadConversation = (projectPath: string, id: string): Conversation | null => {
  // Reject invalid ids with a `null` result rather than throwing so callers
  // (CLI /load, HTTP GET) can treat "bad id" and "missing" identically.
  if (!isValidConversationId(id)) return null;
  const file = conversationPath(projectPath, id);
  if (!fs.existsSync(file)) return null;
  const events = readAllLines<AnyEvent>(file);
  if (!events.length) return null;
  return replay(events, id, projectPath);
};

export const listConversations = (projectPath: string): ConversationSummary[] => {
  const sub = projectSubdirs(projectPath);
  if (!fs.existsSync(sub.sessions)) return [];
  const files = fs.readdirSync(sub.sessions).filter((f) => {
    if (!f.endsWith('.jsonl')) return false;
    return f.startsWith('repl-') || f.startsWith('chat-') || f.startsWith('conv-');
  });
  const out: ConversationSummary[] = [];
  for (const f of files) {
    const full = path.join(sub.sessions, f);
    const id = path.basename(f, '.jsonl');
    try {
      const stat = fs.statSync(full);
      const events = readAllLines<AnyEvent>(full);
      if (!events.length) continue;
      const conv = replay(events, id, projectPath);
      out.push({
        id: conv.meta.id,
        source: conv.meta.source ?? deriveSourceFromId(conv.meta.id),
        title: conv.meta.title,
        mode: conv.meta.mode,
        turns: conv.turns.length,
        createdAt: conv.meta.createdAt,
        lastAt: conv.meta.updatedAt,
        sizeBytes: stat.size,
      });
    } catch (err) {
      log.warn('conversation summary skip', { file: f, err: String(err) });
    }
  }
  out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return out;
};

export const appendUserTurn = async (
  projectPath: string,
  conversationId: string,
  turn: ConversationTurn,
): Promise<void> => {
  const event: ConvEvent = { at: turn.at, kind: 'turn-user', turn };
  await atomicAppendLine(conversationPath(projectPath, conversationId), JSON.stringify(event));
};

export const attachTurnResult = async (
  projectPath: string,
  conversationId: string,
  args: { turnId: string; taskId: string; result: TurnResult; status: TurnStatus },
): Promise<void> => {
  const event: ConvEvent = {
    at: new Date().toISOString(),
    kind: 'turn-result',
    turnId: args.turnId,
    taskId: args.taskId,
    result: args.result,
    status: args.status,
  };
  await atomicAppendLine(conversationPath(projectPath, conversationId), JSON.stringify(event));
};

/** Synchronous variant of attachTurnResult for callers that can't await
 *  (task-runner's resolution listeners). */
export const attachTurnResultSync = (
  projectPath: string,
  conversationId: string,
  args: { turnId: string; taskId: string; result: TurnResult; status: TurnStatus },
): void => {
  const event: ConvEvent = {
    at: new Date().toISOString(),
    kind: 'turn-result',
    turnId: args.turnId,
    taskId: args.taskId,
    result: args.result,
    status: args.status,
  };
  atomicAppendLineSync(conversationPath(projectPath, conversationId), JSON.stringify(event));
};

export const renameConversation = async (
  projectPath: string,
  conversationId: string,
  title: string,
): Promise<void> => {
  const event: ConvEvent = {
    at: new Date().toISOString(),
    kind: 'meta-updated',
    patch: { title: title.slice(0, 120) },
  };
  await atomicAppendLine(conversationPath(projectPath, conversationId), JSON.stringify(event));
};

export const deleteConversation = (projectPath: string, conversationId: string): boolean => {
  // Match the load/lookup semantics: bad ids are treated as "not present"
  // rather than throwing, so callers can unconditionally call and check.
  if (!isValidConversationId(conversationId)) return false;
  const file = conversationPath(projectPath, conversationId);
  if (!fs.existsSync(file)) return false;
  try {
    fs.rmSync(file);
    // clean up any stray lockfile
    fs.rmdirSync(`${file}.lock`, { recursive: false });
  } catch {
    /* non-fatal */
  }
  return true;
};

export const findConversationFile = (projectPath: string, conversationId: string): string =>
  conversationPath(projectPath, conversationId);

// ---------- Watching ----------

export interface ConversationUpdate {
  events: ConvEvent[];
  newTurns: ConversationTurn[];
  completedTurns: Array<{ turn: ConversationTurn; prior: TurnStatus }>;
  metaChanged: boolean;
}

/**
 * Watch a conversation file for appended events. Higher-level than the store
 * watcher: it delivers typed ConvEvents and annotates which turns were newly
 * added or completed. Used by CLI REPL to display cross-terminal edits and
 * by the UI to push live updates to connected browsers.
 */
export const watchConversationFile = (
  projectPath: string,
  conversationId: string,
  onUpdate: (update: ConversationUpdate) => void,
): ConversationWatcher => {
  // Snapshot the current state so we can diff against new events.
  const snapshot = loadConversation(projectPath, conversationId);
  const knownTurns = new Map<string, ConversationTurn>();
  if (snapshot) for (const t of snapshot.turns) knownTurns.set(t.id, { ...t });

  return storeWatch<AnyEvent>(conversationPath(projectPath, conversationId), (items) => {
    // Filter to unified events; legacy events in live-written files are rare.
    const convEvents: ConvEvent[] = [];
    for (const item of items) {
      if (item && typeof item === 'object' && 'kind' in item) {
        convEvents.push(item as ConvEvent);
      }
    }
    if (!convEvents.length) return;

    const newTurns: ConversationTurn[] = [];
    const completedTurns: Array<{ turn: ConversationTurn; prior: TurnStatus }> = [];
    let metaChanged = false;

    for (const ev of convEvents) {
      if (ev.kind === 'turn-user') {
        if (!knownTurns.has(ev.turn.id)) {
          knownTurns.set(ev.turn.id, { ...ev.turn });
          newTurns.push(ev.turn);
        }
      } else if (ev.kind === 'turn-result') {
        const existing = knownTurns.get(ev.turnId) ?? null;
        const prior: TurnStatus = existing?.status ?? 'pending';
        const updated: ConversationTurn = existing
          ? { ...existing, taskId: ev.taskId, status: ev.status, result: ev.result }
          : {
              id: ev.turnId,
              at: ev.at,
              input: '',
              mode: 'balanced',
              taskId: ev.taskId,
              status: ev.status,
              result: ev.result,
            };
        knownTurns.set(ev.turnId, updated);
        completedTurns.push({ turn: updated, prior });
      } else if (ev.kind === 'meta-updated' || ev.kind === 'session-created') {
        metaChanged = true;
      }
    }

    onUpdate({
      events: convEvents,
      newTurns,
      completedTurns,
      metaChanged,
    });
  });
};

// ---------- Context threading ----------

export const MAX_TURNS_IN_CONTEXT = 6;

/**
 * Produce a planner-friendly description that embeds prior turns as context
 * so the agent sees the conversation so far. The latest user input is the
 * headline; older turns are summarised.
 *
 * Kept small and deterministic — no LLM calls, no heavyweight formatting.
 */
export const composeDescription = (
  newInput: string,
  turns: ConversationTurn[],
  maxTurns = MAX_TURNS_IN_CONTEXT,
): string => {
  const prior = turns.filter((t) => t.status === 'done' || t.status === 'failed').slice(-maxTurns);
  if (!prior.length) return newInput;
  const lines: string[] = [
    '## Current request',
    newInput,
    '',
    '## Conversation so far (earliest → latest)',
  ];
  prior.forEach((t, i) => {
    const r = t.result;
    lines.push(`${i + 1}. user: ${t.input.replace(/\s+/g, ' ').slice(0, 240)}`);
    if (r) {
      lines.push(
        `   assistant: ${r.success ? 'OK' : 'FAILED'} — ${(r.summary ?? '').replace(/\s+/g, ' ').slice(0, 240)}`,
      );
      if (r.filesChanged?.length) {
        const shown = r.filesChanged.slice(0, 6).join(', ');
        const extra = r.filesChanged.length > 6 ? ` …+${r.filesChanged.length - 6}` : '';
        lines.push(`   files: ${shown}${extra}`);
      }
    }
  });
  lines.push('', '## Notes');
  lines.push('- "Current request" is the user\'s latest message; prior turns are context only.');
  lines.push('- Prefer extending files already touched in prior turns when relevant.');
  return lines.join('\n');
};

// ---------- Turn ID helpers ----------

export const newTurnId = (): string => `turn-${newSessionId()}`;
