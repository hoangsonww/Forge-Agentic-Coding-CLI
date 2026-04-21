/**
 * Web UI chat — thin wrapper around the unified conversation module.
 *
 * Everything about session storage, event schema, and replay lives in
 * src/core/conversation.ts. This module handles only:
 *   • Turn dispatch: composing the description, creating the task, relating
 *     the resulting task id back to the turn so `attachResult` can match.
 *   • Broadcasting: fan-out of conversation events to connected WebSocket
 *     subscribers so open browser tabs update live.
 *   • Task resolution bridge: when the task runner reports a task finished,
 *     find the owning conversation and persist the result.
 *
 * State is read from disk on every request. This means multiple UI server
 * processes (load-balanced, say) see each other's writes without a shared
 * coordinator — the file system IS the coordinator.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import { startUiTask, RunRequest } from './task-runner';
import { Mode } from '../types';
import { paths } from '../config/paths';
import {
  Conversation,
  ConversationSource,
  ConversationSummary,
  ConversationTurn,
  TurnStatus,
  appendUserTurn,
  attachTurnResultSync,
  composeDescription,
  createConversation,
  deleteConversation as coreDelete,
  findConversationFile,
  listConversations as coreList,
  loadConversation,
  newTurnId,
  renameConversation as coreRename,
  watchConversationFile,
} from '../core/conversation';
import { ConversationUpdate } from '../core/conversation';
import { log } from '../logging/logger';

// ---------- Broadcast registry (for WebSocket live-sync) ----------

type BroadcastFn = (ev: ConversationUpdate) => void;

const broadcasters = new Map<string /* conversationId */, Set<BroadcastFn>>();
const watchers = new Map<string, { close: () => void; refs: number }>();

const ensureWatcher = (projectPath: string, id: string): void => {
  const existing = watchers.get(id);
  if (existing) {
    existing.refs++;
    return;
  }
  const w = watchConversationFile(projectPath, id, (update) => {
    const subs = broadcasters.get(id);
    if (!subs) return;
    for (const cb of subs) {
      try {
        cb(update);
      } catch (err) {
        log.warn('chat broadcaster callback failed', { err: String(err) });
      }
    }
  });
  watchers.set(id, { close: () => w.close(), refs: 1 });
};

const releaseWatcher = (id: string): void => {
  const w = watchers.get(id);
  if (!w) return;
  w.refs--;
  if (w.refs <= 0) {
    try {
      w.close();
    } catch {
      /* ignore */
    }
    watchers.delete(id);
  }
};

/**
 * Close every active conversation watcher and drop every broadcaster. Called
 * during UI server shutdown so the process can exit cleanly. Idempotent.
 */
export const closeAllConversationWatchers = (): void => {
  for (const [id, w] of watchers) {
    try {
      w.close();
    } catch {
      /* ignore */
    }
    watchers.delete(id);
  }
  broadcasters.clear();
};

/**
 * Subscribe to conversation events for live push. Returns an unsubscribe
 * function. Project path is needed so we know where the file lives.
 */
export const subscribeConversation = (
  projectPath: string,
  conversationId: string,
  cb: BroadcastFn,
): (() => void) => {
  let set = broadcasters.get(conversationId);
  if (!set) {
    set = new Set();
    broadcasters.set(conversationId, set);
  }
  set.add(cb);
  ensureWatcher(projectPath, conversationId);
  return () => {
    set?.delete(cb);
    if (set && set.size === 0) broadcasters.delete(conversationId);
    releaseWatcher(conversationId);
  };
};

// ---------- Types exposed to the HTTP layer ----------

export interface SessionListEntry {
  id: string;
  source: ConversationSource;
  title: string;
  mode: Mode;
  turns: number;
  createdAt: string;
  lastAt: string;
}

// ---------- Read-side ----------

export const listChatSessions = (projectPath?: string): SessionListEntry[] => {
  if (!projectPath) return [];
  return coreList(projectPath).map((s: ConversationSummary) => ({
    id: s.id,
    source: s.source,
    title: s.title,
    mode: s.mode,
    turns: s.turns,
    createdAt: s.createdAt,
    lastAt: s.lastAt,
  }));
};

export const getChatSession = (projectPath: string, id: string): Conversation | null =>
  loadConversation(projectPath, id);

// ---------- Mutating ops ----------

export interface CreateSessionOpts {
  projectPath: string;
  title?: string;
  mode?: Mode;
  source?: ConversationSource;
}

export const createChatSession = async (opts: CreateSessionOpts): Promise<Conversation> =>
  createConversation({
    projectPath: opts.projectPath,
    title: opts.title,
    mode: opts.mode,
    source: opts.source ?? 'chat',
  });

export const renameChatSession = async (
  projectPath: string,
  id: string,
  title: string,
): Promise<Conversation | null> => {
  const existing = loadConversation(projectPath, id);
  if (!existing) return null;
  await coreRename(projectPath, id, title);
  return loadConversation(projectPath, id);
};

export const deleteChatSession = (projectPath: string, id: string): boolean => {
  return coreDelete(projectPath, id);
};

// ---------- Turn dispatch ----------

export interface AddTurnRequest {
  projectPath: string;
  conversationId: string;
  input: string;
  mode?: Mode;
  autoApprove?: boolean;
  flags?: RunRequest['flags'];
}

export interface AddTurnReply {
  turn: ConversationTurn;
  taskId: string;
}

/** Add a user turn, kick off an orchestrator task, return the turn + taskId.
 *  The turn is persisted synchronously before the task is scheduled, so if
 *  the task creation fails the turn still appears in the history. */
export const addTurn = async (req: AddTurnRequest): Promise<AddTurnReply> => {
  const session = loadConversation(req.projectPath, req.conversationId);
  if (!session) throw new Error(`chat session ${req.conversationId} not found`);

  const turn: ConversationTurn = {
    id: newTurnId(),
    at: new Date().toISOString(),
    input: req.input,
    mode: req.mode ?? session.meta.mode,
    status: 'pending',
  };

  await appendUserTurn(req.projectPath, req.conversationId, turn);

  // Compose prior-turn context for the planner.
  const description = composeDescription(req.input, session.turns);

  const reply = startUiTask({
    prompt: req.input,
    mode: turn.mode,
    cwd: req.projectPath,
    autoApprove: req.autoApprove,
    flags: req.flags,
    title: req.input.slice(0, 80),
    description,
  });

  turn.taskId = reply.taskId;
  turn.status = 'running';

  // Remember taskId → {sessionId, turnId} so when the task resolves we can
  // persist the result back to the right turn.
  taskIndex.set(reply.taskId, {
    projectPath: req.projectPath,
    conversationId: req.conversationId,
    turnId: turn.id,
    addedAt: Date.now(),
  });

  return { turn, taskId: reply.taskId };
};

// ---------- Task resolution bridge ----------

interface TaskLocation {
  projectPath: string;
  conversationId: string;
  turnId: string;
  addedAt: number;
}

const taskIndex = new Map<string, TaskLocation>();

/** Entries older than this are considered stale and get swept. Prevents the
 *  map from growing unboundedly when tasks never resolve (cancelled,
 *  crashed, etc.). */
const TASK_INDEX_TTL_MS = 60 * 60 * 1000; // 1 hour

const sweepTaskIndex = (): void => {
  const now = Date.now();
  for (const [k, v] of taskIndex) {
    if (now - v.addedAt > TASK_INDEX_TTL_MS) taskIndex.delete(k);
  }
};

/**
 * Fallback: when onTaskResolved fires for a task the in-memory index has
 * forgotten (server restart between addTurn and task resolution), scan every
 * conversation in every project for a turn with a matching taskId. Slower
 * but bounded — we only look in one project per resolve (caller may pass a
 * project path via search), and sessions/ dirs are small.
 *
 * We can't know the project path from taskId alone, so we scan all known
 * projects in FORGE_HOME/projects via the runtime paths module.
 */
const findTurnByTaskId = (
  taskId: string,
): { projectPath: string; conversationId: string; turnId: string } | null => {
  // Iterate known project roots. We don't have a registry of project paths;
  // however the `listConversations` helper works on one project at a time.
  // To make the scan scalable we walk FORGE_HOME/projects and invert the
  // hashed path by reading metadata.json where present.
  const projectsRoot: string = paths.projects;
  if (!fs.existsSync(projectsRoot)) return null;
  for (const entry of fs.readdirSync(projectsRoot)) {
    const metaFile = path.join(projectsRoot, entry, 'metadata.json');
    let projectPath: string | null = null;
    try {
      if (fs.existsSync(metaFile)) {
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as { path?: string };
        if (typeof meta.path === 'string') projectPath = meta.path;
      }
    } catch {
      /* skip malformed metadata */
    }
    if (!projectPath) continue;
    try {
      const summaries = coreList(projectPath);
      for (const s of summaries) {
        const conv = loadConversation(projectPath, s.id);
        if (!conv) continue;
        const t = conv.turns.find((x) => x.taskId === taskId);
        if (t) return { projectPath, conversationId: conv.meta.id, turnId: t.id };
      }
    } catch {
      /* keep scanning */
    }
  }
  return null;
};

/**
 * Record a task's final result into its owning conversation. Called by the
 * task runner via its onTaskResolved observer. The writer is synchronous so
 * callers that can't await still land the update.
 *
 * If the in-memory map is missing the task id (server restart, task was
 * registered in a previous process, etc.), fall back to a disk scan.
 */
export const attachResultForTask = (
  taskId: string,
  result: {
    success: boolean;
    summary: string;
    filesChanged: string[];
    durationMs: number;
    costUsd?: number;
  },
  status: TurnStatus,
): void => {
  sweepTaskIndex();
  let loc = taskIndex.get(taskId) ?? null;
  if (!loc) {
    const scanned = findTurnByTaskId(taskId);
    if (!scanned) return; // truly not a chat-owned task
    loc = { ...scanned, addedAt: Date.now() };
  }
  try {
    attachTurnResultSync(loc.projectPath, loc.conversationId, {
      turnId: loc.turnId,
      taskId,
      result: { taskId, ...result },
      status,
    });
  } catch (err) {
    log.warn('chat: attach result failed', { err: String(err), taskId });
  } finally {
    taskIndex.delete(taskId);
  }
};

/** Exported for tests. Remove stale entries right now. */
export const _sweepTaskIndexForTesting = (): void => sweepTaskIndex();

/** Exported for tests. Size of the in-memory index. */
export const _taskIndexSize = (): number => taskIndex.size;

// ---------- Re-exports useful to the server/router ----------

export type {
  Conversation,
  ConversationSummary,
  ConversationTurn,
  ConversationUpdate,
} from '../core/conversation';
export { findConversationFile };
