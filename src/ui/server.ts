/**
 * Forge UI server. Serves the dashboard, streams live events per project,
 * and exposes the CLI's capabilities over HTTP + WebSocket. The runtime
 * runs in-process so every CLI capability is reachable without shelling
 * out; this keeps UI-driven tasks under the same permission and sandbox
 * rules as CLI-driven tasks.
 */
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { WebSocketServer } from 'ws';
import { listTasks, listProjects, searchTasks, getDb } from '../persistence/index-db';
import { loadTask } from '../persistence/tasks';
import { loadSession } from '../persistence/sessions';
import { loadGlobalConfig, updateGlobalConfig, findProjectRoot } from '../config/loader';
import { paths as forgePaths, projectSubdirs, ensureProjectDir } from '../config/paths';
import { daemonStatus } from '../daemon/control';
import { listProviders } from '../models/provider';
import { log } from '../logging/logger';
import { redact } from '../security/redact';
import { totals as costTotals, recent as costRecent } from '../models/cost';
import { loadSkills } from '../skills/loader';
import { searchRegistry, installFromUrl } from '../skills/marketplace';
import { listConnections, addConnection, removeConnection } from '../mcp/registry';
import { webSearch } from '../web/search';
import { webFetch } from '../web/fetch';
import { indexProject, search as coldSearch } from '../memory/cold';
import {
  startUiTask,
  subscribe,
  respond,
  cancelTask,
  listActive,
  listPendingPrompts,
  onTaskResolved,
} from './task-runner';
import {
  createChatSession,
  listChatSessions,
  getChatSession,
  addTurn,
  attachResultForTask,
  renameChatSession,
  deleteChatSession,
  subscribeConversation,
  closeAllConversationWatchers,
} from './chat';

// ---------- helpers ----------

const sendJson = (res: http.ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(redact(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  });
  res.end(payload);
};

// `errorBody()` lives in ./server-errors so unit tests can import it
// without requiring the entire server (sqlite, ws, etc).
import { errorBody } from './server-errors';

const sendStatic = (res: http.ServerResponse, filePath: string): void => {
  try {
    const body = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === '.html'
        ? 'text/html; charset=utf-8'
        : ext === '.js'
          ? 'application/javascript; charset=utf-8'
          : ext === '.css'
            ? 'text/css; charset=utf-8'
            : ext === '.svg'
              ? 'image/svg+xml'
              : ext === '.json'
                ? 'application/json'
                : 'application/octet-stream';
    res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
};

const readBody = (req: http.IncomingMessage, limit = 256 * 1024): Promise<string> =>
  new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const parseJson = async <T>(req: http.IncomingMessage): Promise<T> => {
  const raw = await readBody(req);
  if (!raw.trim()) return {} as T;
  return JSON.parse(raw) as T;
};

// ---------- routes ----------

const router = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  publicDir: string,
): Promise<void> => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return;
  }

  const u = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const p = u.pathname;

  // ---- Health ----
  if (p === '/healthz') {
    return sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
  }

  // ---- Status / projects / config ----
  if (p === '/api/status') {
    const cfg = loadGlobalConfig();
    const d = daemonStatus();
    const providers = await Promise.all(
      listProviders().map(async (prov) => ({
        name: prov.name,
        available: await prov.isAvailable().catch(() => false),
      })),
    );
    return sendJson(res, 200, {
      provider: cfg.provider,
      defaultMode: cfg.defaultMode,
      channel: cfg.update.channel,
      daemon: d,
      providers,
      cwd: process.cwd(),
      version: (() => {
        try {
          const pkg = JSON.parse(
            fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
          );
          return (pkg.version as string) ?? null;
        } catch {
          return null;
        }
      })(),
    });
  }

  if (p === '/api/projects') {
    return sendJson(res, 200, listProjects());
  }

  if (p === '/api/config' && req.method === 'GET') {
    return sendJson(res, 200, loadGlobalConfig());
  }
  if (p === '/api/config' && req.method === 'POST') {
    try {
      const body = await parseJson<{ key: string; value: unknown }>(req);
      if (!body.key) return sendJson(res, 400, { error: 'key required' });
      const updated = updateGlobalConfig((cfg) => {
        const clone: Record<string, unknown> = JSON.parse(JSON.stringify(cfg));
        setNested(clone, body.key, body.value);
        return clone as ReturnType<typeof loadGlobalConfig>;
      });
      return sendJson(res, 200, updated);
    } catch (e) {
      {
        const { status, body } = errorBody(e);
        return sendJson(res, status, body);
      }
    }
  }

  // ---- Tasks (index) ----
  if (p === '/api/tasks' && req.method === 'GET') {
    const projectId = u.searchParams.get('project') ?? undefined;
    const query = u.searchParams.get('q');
    const limit = Number(u.searchParams.get('limit') ?? 50);
    const rows = query ? searchTasks(query, limit) : listTasks(projectId, limit);
    return sendJson(res, 200, rows);
  }

  // ---- Running UI tasks (must come BEFORE the generic /api/tasks/:id regex) ----
  if (p === '/api/tasks/run' && req.method === 'POST') {
    try {
      const body = await parseJson<{
        prompt: string;
        mode?: string;
        cwd?: string;
        autoApprove?: boolean;
        flags?: Record<string, boolean>;
        title?: string;
      }>(req);
      if (!body.prompt?.trim()) return sendJson(res, 400, { error: 'prompt required' });
      const reply = startUiTask({
        prompt: body.prompt,
        mode: body.mode as ReturnType<typeof loadGlobalConfig>['defaultMode'],
        cwd: body.cwd,
        autoApprove: body.autoApprove,
        flags: body.flags as Parameters<typeof startUiTask>[0]['flags'],
        title: body.title,
      });
      return sendJson(res, 202, reply);
    } catch (e) {
      {
        const { status, body } = errorBody(e);
        return sendJson(res, status, body);
      }
    }
  }

  if (p === '/api/tasks/active' && req.method === 'GET') {
    return sendJson(res, 200, { active: listActive(), pending: listPendingPrompts() });
  }

  const cancelMatch = /^\/api\/tasks\/([a-f0-9]+)\/cancel$/.exec(p);
  if (cancelMatch && req.method === 'POST') {
    const ok = cancelTask(cancelMatch[1]);
    return sendJson(res, ok ? 200 : 404, { cancelled: ok });
  }

  if (p === '/api/prompts/respond' && req.method === 'POST') {
    try {
      const body = await parseJson<{ promptId: string; value: unknown }>(req);
      const ok = respond(body.promptId, body.value);
      return sendJson(res, ok ? 200 : 404, { resolved: ok });
    } catch (e) {
      {
        const { status, body } = errorBody(e);
        return sendJson(res, status, body);
      }
    }
  }

  // Historical task detail — last to avoid catching /active, /run, /<id>/cancel.
  const taskMatch = /^\/api\/tasks\/([a-z0-9_]+)$/.exec(p);
  if (taskMatch && req.method === 'GET') {
    const projectPath = u.searchParams.get('projectPath') ?? findProjectRoot() ?? process.cwd();
    const task = loadTask(projectPath, taskMatch[1]);
    if (!task) return sendJson(res, 404, { error: 'task not found' });
    return sendJson(res, 200, task);
  }

  // ---- Sessions ----
  const sessionMatch = /^\/api\/sessions\/([a-z0-9_]+)$/.exec(p);
  if (sessionMatch) {
    const projectPath = u.searchParams.get('projectPath');
    if (!projectPath) return sendJson(res, 400, { error: 'projectPath required' });
    const entries = await loadSession(projectPath, sessionMatch[1]);
    return sendJson(res, 200, entries);
  }

  // ---- Chat / Conversations (unified; REPL and Web share the same store) ----
  if (p === '/api/chat/sessions' && req.method === 'GET') {
    const projectPath = u.searchParams.get('projectPath') ?? findProjectRoot() ?? process.cwd();
    return sendJson(res, 200, listChatSessions(projectPath));
  }
  if (p === '/api/chat/sessions' && req.method === 'POST') {
    try {
      const body = await parseJson<{
        projectPath?: string;
        title?: string;
        mode?: string;
        source?: 'repl' | 'chat';
      }>(req);
      const projectPath = body.projectPath ?? findProjectRoot() ?? process.cwd();
      const session = await createChatSession({
        projectPath,
        title: body.title,
        mode: body.mode as ReturnType<typeof loadGlobalConfig>['defaultMode'] | undefined,
        source: body.source ?? 'chat',
      });
      return sendJson(res, 201, session);
    } catch (e) {
      {
        const { status, body } = errorBody(e);
        return sendJson(res, status, body);
      }
    }
  }

  // Accept both chat-*, repl-*, and conv-* ids so the UI can display + edit
  // any conversation irrespective of which surface created it.
  const chatSessionMatch = /^\/api\/chat\/sessions\/((?:chat|repl|conv)-[a-z0-9_]+)$/.exec(p);
  if (chatSessionMatch && req.method === 'GET') {
    const projectPath = u.searchParams.get('projectPath') ?? findProjectRoot() ?? process.cwd();
    const session = getChatSession(projectPath, chatSessionMatch[1]);
    if (!session) return sendJson(res, 404, { error: 'conversation not found' });
    return sendJson(res, 200, session);
  }
  if (chatSessionMatch && req.method === 'DELETE') {
    const projectPath = u.searchParams.get('projectPath') ?? findProjectRoot() ?? process.cwd();
    const ok = deleteChatSession(projectPath, chatSessionMatch[1]);
    return sendJson(res, ok ? 200 : 404, { deleted: ok });
  }
  if (chatSessionMatch && req.method === 'PATCH') {
    try {
      const body = await parseJson<{ title?: string; projectPath?: string }>(req);
      if (!body.title) return sendJson(res, 400, { error: 'title required' });
      const projectPath = body.projectPath ?? findProjectRoot() ?? process.cwd();
      const s = await renameChatSession(projectPath, chatSessionMatch[1], body.title);
      if (!s) return sendJson(res, 404, { error: 'conversation not found' });
      return sendJson(res, 200, s);
    } catch (e) {
      {
        const { status, body } = errorBody(e);
        return sendJson(res, status, body);
      }
    }
  }

  const chatTurnMatch = /^\/api\/chat\/sessions\/((?:chat|repl|conv)-[a-z0-9_]+)\/turns$/.exec(p);
  if (chatTurnMatch && req.method === 'POST') {
    try {
      const body = await parseJson<{
        input: string;
        mode?: string;
        autoApprove?: boolean;
        flags?: Record<string, boolean>;
        projectPath?: string;
      }>(req);
      if (!body.input?.trim()) return sendJson(res, 400, { error: 'input required' });
      const projectPath = body.projectPath ?? findProjectRoot() ?? process.cwd();
      const reply = await addTurn({
        projectPath,
        conversationId: chatTurnMatch[1],
        input: body.input,
        mode: body.mode as ReturnType<typeof loadGlobalConfig>['defaultMode'] | undefined,
        autoApprove: body.autoApprove,
        flags: body.flags as Parameters<typeof addTurn>[0]['flags'],
      });
      return sendJson(res, 202, reply);
    } catch (e) {
      {
        const { status, body } = errorBody(e);
        return sendJson(res, status, body);
      }
    }
  }

  // ---- Models ----
  if (p === '/api/models') {
    const out = [];
    for (const prov of listProviders()) {
      try {
        const available = await prov.isAvailable();
        const models = available ? await prov.listModels() : [];
        out.push({ provider: prov.name, available, models });
      } catch (err) {
        out.push({ provider: prov.name, available: false, models: [], error: String(err) });
      }
    }
    return sendJson(res, 200, out);
  }

  // ---- Events ----
  if (p === '/api/events') {
    const project = u.searchParams.get('projectPath');
    if (!project) return sendJson(res, 400, { error: 'projectPath required' });
    const resolved = resolveEventFile(project);
    if (!resolved || !fs.existsSync(resolved)) return sendJson(res, 200, []);
    const limit = Number(u.searchParams.get('limit') ?? 200);
    try {
      const lines = fs.readFileSync(resolved, 'utf8').split('\n').filter(Boolean).slice(-limit);
      return sendJson(
        res,
        200,
        lines
          .map((l) => {
            try {
              return JSON.parse(l);
            } catch {
              return null;
            }
          })
          .filter(Boolean),
      );
    } catch (err) {
      log.warn('events read failed', { err: String(err) });
      return sendJson(res, 200, []);
    }
  }

  // ---- Cost ----
  if (p === '/api/cost') {
    const projectId = u.searchParams.get('projectId') ?? undefined;
    return sendJson(res, 200, { totals: costTotals(projectId), recent: costRecent(50) });
  }

  // ---- Learning ----
  if (p === '/api/learning') {
    const rows = getDb()
      .prepare(
        'SELECT pattern, context, fix, confidence, success_count, failure_count, updated_at FROM learning_patterns ORDER BY confidence DESC LIMIT 50',
      )
      .all();
    return sendJson(res, 200, rows);
  }

  // ---- Memory ----
  if (p === '/api/memory/index' && req.method === 'POST') {
    try {
      const body = await parseJson<{ projectPath?: string }>(req);
      const projectPath = body.projectPath ?? findProjectRoot() ?? process.cwd();
      const stats = indexProject(projectPath);
      return sendJson(res, 200, { projectPath, ...stats });
    } catch (e) {
      {
        const { status, body } = errorBody(e);
        return sendJson(res, status, body);
      }
    }
  }
  if (p === '/api/memory/search') {
    const query = u.searchParams.get('q');
    const projectPath = u.searchParams.get('projectPath') ?? findProjectRoot() ?? process.cwd();
    if (!query) return sendJson(res, 400, { error: 'q required' });
    const results = coldSearch(projectPath, query, 20);
    return sendJson(res, 200, results);
  }

  // ---- Skills ----
  if (p === '/api/skills' && req.method === 'GET') {
    const root = findProjectRoot() ?? undefined;
    return sendJson(res, 200, loadSkills(root));
  }
  if (p === '/api/skills/search') {
    const q = u.searchParams.get('q') ?? '';
    try {
      return sendJson(res, 200, await searchRegistry(q));
    } catch (e) {
      return sendJson(res, 500, { error: String(e) });
    }
  }
  if (p === '/api/skills/install' && req.method === 'POST') {
    try {
      const body = await parseJson<{ name: string; url: string }>(req);
      const out = await installFromUrl(body.name, body.url, { overwrite: true });
      return sendJson(res, 200, out);
    } catch (e) {
      {
        const { status, body } = errorBody(e);
        return sendJson(res, status, body);
      }
    }
  }

  // ---- MCP ----
  if (p === '/api/mcp' && req.method === 'GET') {
    return sendJson(res, 200, listConnections());
  }
  if (p === '/api/mcp' && req.method === 'POST') {
    try {
      const body = await parseJson<Parameters<typeof addConnection>[0]>(req);
      addConnection(body);
      return sendJson(res, 201, { ok: true });
    } catch (e) {
      {
        const { status, body } = errorBody(e);
        return sendJson(res, status, body);
      }
    }
  }
  const mcpIdMatch = /^\/api\/mcp\/([^/]+)$/.exec(p);
  if (mcpIdMatch && req.method === 'DELETE') {
    removeConnection(mcpIdMatch[1]);
    return sendJson(res, 204, {});
  }

  // ---- Web ----
  if (p === '/api/web/search') {
    const query = u.searchParams.get('q');
    if (!query) return sendJson(res, 400, { error: 'q required' });
    try {
      const results = await webSearch({ query, limit: 10 });
      return sendJson(res, 200, results);
    } catch (e) {
      return sendJson(res, 500, { error: String(e) });
    }
  }
  if (p === '/api/web/fetch' && req.method === 'POST') {
    try {
      const body = await parseJson<{ url: string }>(req);
      if (!body.url) return sendJson(res, 400, { error: 'url required' });
      const result = await webFetch({ url: body.url, maxChars: 6_000 });
      return sendJson(res, 200, result);
    } catch (e) {
      {
        const { status, body } = errorBody(e);
        return sendJson(res, status, body);
      }
    }
  }

  // ---- Doctor ----
  if (p === '/api/doctor') {
    const results: Array<{ name: string; ok: boolean; detail: string }> = [];
    const addCheck = (name: string, ok: boolean, detail: string) =>
      results.push({ name, ok, detail });
    addCheck('forge home', fs.existsSync(forgePaths.home), forgePaths.home);
    try {
      getDb().prepare('SELECT 1').get();
      addCheck('sqlite index', true, forgePaths.globalIndex);
    } catch (e) {
      addCheck('sqlite index', false, String(e));
    }
    try {
      const cfg = loadGlobalConfig();
      addCheck('config valid', true, `provider=${cfg.provider} mode=${cfg.defaultMode}`);
    } catch (e) {
      addCheck('config valid', false, String(e));
    }
    const prov: string[] = [];
    for (const provObj of listProviders()) {
      prov.push(
        `${provObj.name}:${(await provObj.isAvailable().catch(() => false)) ? 'up' : 'down'}`,
      );
    }
    addCheck(
      'providers',
      prov.some((r) => r.endsWith(':up')),
      prov.join(' '),
    );
    return sendJson(res, 200, results);
  }

  // ---- Static ----
  const staticPath = p === '/' ? '/index.html' : p;
  const full = path.join(publicDir, staticPath);
  const normalized = path.resolve(full);
  if (!normalized.startsWith(path.resolve(publicDir))) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
    sendStatic(res, normalized);
    return;
  }
  sendStatic(res, path.join(publicDir, 'index.html'));
};

// ---------- helpers ----------
const setNested = (obj: Record<string, unknown>, keyPath: string, value: unknown): void => {
  const parts = keyPath.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
};

// ---------- Event-file resolution ----------
//
// Events are written under ~/.forge/projects/<projectHash>/logs/events.jsonl
// (see src/persistence/events.ts). The UI caller usually sends the absolute
// project path, so we translate that to the stored location. We also support
// the legacy `<projectPath>/.forge/logs/events.jsonl` layout, and the shared
// per-project dir under `<projectPath>/logs/events.jsonl` only if it actually
// exists — never assuming.

const resolveEventFile = (projectPath: string): string | null => {
  const candidates = [
    path.join(projectSubdirs(projectPath).logs, 'events.jsonl'),
    path.join(projectPath, '.forge', 'logs', 'events.jsonl'),
    path.join(projectPath, 'logs', 'events.jsonl'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
};

// Resolve AND create the per-project events.jsonl so `fs.watch` never throws
// ENOENT. Touching a zero-byte file is cheap and idempotent.
const ensureEventFile = (projectPath: string): string => {
  const existing = resolveEventFile(projectPath);
  if (existing) return existing;
  const sub = ensureProjectDir(projectPath);
  const target = path.join(sub.logs, 'events.jsonl');
  if (!fs.existsSync(target)) fs.writeFileSync(target, '', 'utf8');
  return target;
};

// ---------- Process-wide crash guards ----------
//
// The UI server is meant to stay up under imperfect conditions (files that
// appear and vanish, peers that disconnect mid-send, provider network
// hiccups). Without these, an unhandled rejection anywhere in the loop would
// crash the whole dashboard.
let guardsInstalled = false;
let bridgeInstalled = false;
const installProcessGuards = (): void => {
  if (guardsInstalled) return;
  guardsInstalled = true;
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException (server kept alive)', {
      err: String(err),
      stack: (err as Error)?.stack,
    });
  });
  process.on('unhandledRejection', (reason) => {
    log.error('unhandledRejection (server kept alive)', { reason: String(reason) });
  });
};

// ---------- server lifecycle ----------

export interface UiServerOptions {
  port?: number;
  bind?: string;
  publicDir?: string;
}

export const startUiServer = (
  opts: UiServerOptions = {},
): Promise<{ stop: () => Promise<void>; port: number }> => {
  const port = opts.port ?? Number(process.env.FORGE_UI_PORT ?? 7823);
  const bind = opts.bind ?? '127.0.0.1';
  const publicDir = opts.publicDir ?? path.join(__dirname, 'public');

  installProcessGuards();

  // Bridge task results back to chat sessions so turns get their summaries.
  // Registered once per process — if `startUiServer` is called again (e.g.
  // restart), subsequent calls skip this hook so we don't get duplicate
  // writes per resolved task.
  if (!bridgeInstalled) {
    bridgeInstalled = true;
    onTaskResolved((r) => {
      // chat.attachResultForTask is a no-op for tasks not associated with a
      // chat turn — safe to call unconditionally.
      attachResultForTask(
        r.taskId,
        {
          success: r.success,
          summary: r.summary,
          filesChanged: r.filesChanged,
          durationMs: r.durationMs,
          costUsd: r.costUsd,
        },
        r.status,
      );
    });
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      router(req, res, publicDir).catch((err) => {
        log.error('ui route failed', { err: String(err) });
        try {
          sendJson(res, 500, { error: String(err) });
        } catch {
          /* socket may be dead */
        }
      });
    });
    server.on('clientError', (err, socket) => {
      log.debug('http clientError', { err: String(err) });
      try {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      } catch {
        /* ignore */
      }
    });

    // WebSocket channels: project event stream AND task streams.
    const wss = new WebSocketServer({ server });
    wss.on('error', (err) => log.warn('ws server error', { err: String(err) }));
    const watchers = new Map<string, fs.FSWatcher>();

    wss.on('connection', (socket, req) => {
      const u = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const taskMatch = /^\/ws\/tasks\/([a-f0-9]+)$/.exec(u.pathname);
      if (taskMatch) {
        const ok = subscribe(taskMatch[1], socket as unknown as import('ws').WebSocket);
        if (!ok) {
          socket.close(1008, 'unknown task');
          return;
        }
        return;
      }

      // Conversation live-sync channel. Browser tabs subscribe to hear about
      // newly appended turns (from any writer — this tab, another tab, a CLI
      // REPL on the same host, a task runner's result broadcast, etc.).
      const convMatch = /^\/ws\/conversations\/((?:chat|repl|conv)-[a-z0-9_]+)$/.exec(u.pathname);
      if (convMatch) {
        const projectPath = u.searchParams.get('projectPath');
        if (!projectPath) {
          socket.close(1008, 'projectPath required');
          return;
        }
        socket.on('error', (err) => log.debug('ws conv socket error', { err: String(err) }));
        const unsubscribe = subscribeConversation(projectPath, convMatch[1], (update) => {
          if (socket.readyState !== socket.OPEN) return;
          try {
            socket.send(JSON.stringify({ kind: 'conversation.update', update }));
          } catch (err) {
            log.debug('ws conv send failed', { err: String(err) });
          }
        });
        socket.on('close', () => unsubscribe());
        return;
      }

      if (u.pathname !== '/ws') {
        socket.close(1008, 'unknown channel');
        return;
      }
      const projectPath = u.searchParams.get('projectPath');
      if (!projectPath) {
        socket.close(1008, 'projectPath required');
        return;
      }

      // Always attach the socket-error handler first so a peer disconnect
      // during send() can't bubble into an uncaught exception.
      socket.on('error', (err) => log.debug('ws socket error', { err: String(err) }));

      let resolved: string;
      try {
        resolved = ensureEventFile(projectPath);
      } catch (err) {
        log.warn('ws: could not resolve events file', { projectPath, err: String(err) });
        try {
          socket.close(1011, 'event-file-unavailable');
        } catch {
          /* ignore close error */
        }
        return;
      }

      let lastSize = 0;
      try {
        lastSize = fs.statSync(resolved).size;
      } catch {
        /* created empty above; size is 0 */
      }

      let watcher: fs.FSWatcher | null = null;
      try {
        watcher = fs.watch(resolved, () => {
          try {
            const stat = fs.statSync(resolved);
            if (stat.size <= lastSize) return;
            const fd = fs.openSync(resolved, 'r');
            const buf = Buffer.alloc(stat.size - lastSize);
            fs.readSync(fd, buf, 0, buf.length, lastSize);
            fs.closeSync(fd);
            lastSize = stat.size;
            if (socket.readyState !== socket.OPEN) return;
            for (const line of buf.toString('utf8').split('\n').filter(Boolean)) {
              try {
                socket.send(line);
              } catch (err) {
                log.debug('ws send failed', { err: String(err) });
              }
            }
          } catch (err) {
            log.debug('ws watcher tick error', { err: String(err) });
          }
        });
        watcher.on('error', (err) => {
          log.debug('ws watcher error event', { err: String(err) });
          try {
            watcher?.close();
          } catch {
            /* ignore close error */
          }
          watchers.delete(String(socket));
        });
      } catch (err) {
        // fs.watch itself can throw on some platforms (e.g. rapid file churn).
        log.warn('fs.watch failed', { resolved, err: String(err) });
        try {
          socket.close(1011, 'watch-failed');
        } catch {
          /* ignore close error */
        }
        return;
      }

      watchers.set(String(socket), watcher);
      socket.on('close', () => {
        const w = watchers.get(String(socket));
        if (w) {
          try {
            w.close();
          } catch {
            /* ignore */
          }
          watchers.delete(String(socket));
        }
      });
    });

    server.listen(port, bind, () => {
      log.info('ui server listening', { url: `http://${bind}:${port}` });
      resolve({
        port,
        async stop() {
          // Close task-event fs watchers (project event stream).
          for (const w of watchers.values()) {
            try {
              w.close();
            } catch {
              /* ignore */
            }
          }
          // Close every conversation watcher + drop broadcasters so the
          // process can exit without lingering handles.
          closeAllConversationWatchers();
          wss.close();
          await new Promise<void>((r) => server.close(() => r()));
        },
      });
    });
    server.on('error', reject);
  });
};

if (require.main === module) {
  startUiServer().catch((err) => {
    log.error('failed to start ui server', { err: String(err) });
    process.exit(1);
  });
}
