/**
 * Sidebar surface — a WebviewView in the Forge activity-bar container.
 * Renders header, live stats grid, action buttons, recent tasks, and
 * available models. Polls the dashboard's HTTP API while visible; goes
 * silent when collapsed so we don't burn CPU on a hidden panel.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as http from 'http';
import * as vscode from 'vscode';
import { ForgeConfig, dashboardUrl, readConfig } from './config';
import { probeBinary, probeUi } from './probe';
import { readLocalStats, readLocalTasks, LocalStats } from './local';

const POLL_MS_VISIBLE = 4000;

type Status = {
  reachable: boolean;
  version?: string | null;
  provider?: string;
  defaultMode?: string;
  daemon?: { running?: boolean } | null;
  providers?: Array<{ name: string; available: boolean }>;
  cwd?: string;
};

type Task = {
  id: string;
  project_id?: string;
  title?: string;
  status?: string;
  mode?: string;
  intent?: string | null;
  complexity?: string | null;
  risk?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  attempts?: number;
};

type ModelEntry = { provider: string; available: boolean; models: string[]; error?: string };

type Snapshot = {
  cfg: { binary: string; cwd: string; uiUrl: string };
  binary: { ok: boolean; version?: string; error?: string };
  status: Status;
  tasks: Task[];
  local: LocalStats | null;
  models: ModelEntry[];
  fetchedAt: string;
};

export class ForgeSidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'forgeView';

  private view: vscode.WebviewView | undefined;
  private timer: NodeJS.Timeout | undefined;
  private lastSnapshot: Snapshot | undefined;

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = renderShell();

    view.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.startPolling();
        void this.refresh();
      } else {
        this.stopPolling();
      }
    });
    view.onDidDispose(() => {
      this.stopPolling();
      this.view = undefined;
    });

    if (view.visible) {
      this.startPolling();
      void this.refresh();
    }
  }

  /** External nudge — used after commands that change state. */
  async refresh(): Promise<void> {
    if (!this.view) return;
    const snap = await collect(readConfig());
    this.lastSnapshot = snap;
    this.view.webview.postMessage({ type: 'snapshot', snap });
  }

  private startPolling(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.refresh(), POLL_MS_VISIBLE);
  }

  private stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private onMessage(msg: { type?: string; command?: string; arg?: unknown }): void {
    if (!msg) return;
    if (msg.type === 'invoke' && typeof msg.command === 'string') {
      void vscode.commands.executeCommand(msg.command, msg.arg);
    } else if (msg.type === 'refresh') {
      void this.refresh();
    } else if (msg.type === 'copy' && typeof msg.arg === 'string') {
      void vscode.env.clipboard.writeText(msg.arg);
      vscode.window.setStatusBarMessage(`Copied: ${msg.arg}`, 2000);
    }
  }
}

async function collect(cfg: ForgeConfig): Promise<Snapshot> {
  const url = dashboardUrl(cfg);
  const reachable = await probeUi(cfg.uiHost, cfg.uiPort, 800);

  const [binary, status, apiTasks, apiModels, local, localTasks] = await Promise.all([
    probeBinary(cfg.binaryPath),
    reachable ? fetchJson<Status>(url + '/api/status') : Promise.resolve(null),
    reachable ? fetchJson<Task[]>(url + '/api/tasks?limit=8') : Promise.resolve(null),
    reachable ? fetchJson<ModelEntry[]>(url + '/api/models') : Promise.resolve(null),
    readLocalStats(),
    readLocalTasks(8),
  ]);

  // Prefer the live API (fresher for in-flight runs); fall back to DB.
  const tasks: Task[] = apiTasks && apiTasks.length ? apiTasks : (localTasks ?? []);

  return {
    cfg: { binary: cfg.binaryPath, cwd: cfg.cwd, uiUrl: url },
    binary: { ok: binary.ok, version: binary.version, error: binary.error },
    status: { reachable, ...(status ?? {}) },
    tasks,
    local,
    models: apiModels ?? [],
    fetchedAt: new Date().toLocaleTimeString(),
  };
}

function fetchJson<T>(url: string, timeoutMs = 1500): Promise<T | null> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      if ((res.statusCode ?? 500) >= 400) {
        res.resume();
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c as Buffer));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

function renderShell(): string {
  return /* html */ `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;"/>
<style>
  :root {
    --fg: var(--vscode-foreground);
    --bg: var(--vscode-sideBar-background);
    --bg-alt: var(--vscode-sideBarSectionHeader-background);
    --border: var(--vscode-panel-border, rgba(255,255,255,.08));
    --accent: var(--vscode-textLink-foreground, #4cc2ff);
    --accent-fg: var(--vscode-button-foreground, #fff);
    --muted: var(--vscode-descriptionForeground);
    --good: #3fb950;
    --warn: #f0b429;
    --bad: #f85149;
    --hover: var(--vscode-list-hoverBackground);
  }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:var(--bg); color:var(--fg); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
  body { padding: 10px 10px 24px; }
  .card { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
  .hdr { display:flex; align-items:center; gap:10px; }
  .hdr .logo { width: 28px; height:28px; border-radius:8px; background: linear-gradient(135deg, #38bdf8 0%, #a78bfa 100%); display:flex; align-items:center; justify-content:center; color:#0a0e14; font-weight:800; font-size:14px; }
  .hdr h1 { font-size: 13px; margin:0; font-weight: 600; letter-spacing: .02em; }
  .hdr .ver { font-size: 10.5px; color: var(--muted); margin-top: 2px; }
  .pill { display:inline-flex; align-items:center; gap:5px; padding: 2px 8px; border-radius: 999px; font-size:10.5px; font-weight:600; text-transform: uppercase; letter-spacing:.06em; border:1px solid var(--border); }
  .pill .dot { width:6px; height:6px; border-radius:50%; }
  .pill.live { color:var(--good); border-color: color-mix(in srgb, var(--good) 40%, transparent); background: color-mix(in srgb, var(--good) 12%, transparent); }
  .pill.live .dot { background: var(--good); box-shadow: 0 0 6px var(--good); }
  .pill.idle { color:var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, transparent); background: color-mix(in srgb, var(--warn) 10%, transparent); }
  .pill.idle .dot { background: var(--warn); }
  .pill.bad  { color:var(--bad); border-color: color-mix(in srgb, var(--bad) 40%, transparent); background: color-mix(in srgb, var(--bad) 10%, transparent); }
  .pill.bad  .dot { background: var(--bad); }

  .meta { display:grid; grid-template-columns: 1fr; gap: 4px; }
  .meta .row {
    display: grid;
    grid-template-columns: 56px 1fr auto;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    padding: 4px 6px;
    border-radius: 4px;
    min-height: 22px;
  }
  .meta .row:hover { background: var(--hover); }
  .meta .row .k { color: var(--muted); text-transform: uppercase; letter-spacing: .06em; font-size: 10px; font-weight: 600; }
  .meta .row .v {
    color: var(--fg); font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    direction: rtl; text-align: left;
  }
  .meta .row .v::before { content: '\\200E'; }
  .meta .row .copy {
    cursor: pointer; opacity: 0;
    width: 18px; height: 18px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 3px; color: var(--muted);
    transition: opacity .12s ease, color .12s ease;
  }
  .meta .row:hover .copy { opacity: .7; }
  .meta .row .copy:hover { opacity: 1; color: var(--accent); background: var(--bg); }

  .section-title { display:flex; align-items:center; justify-content:space-between; font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color: var(--muted); margin: 4px 4px 6px; font-weight: 600; }
  .section-title .act { cursor:pointer; opacity:.7; font-size:11px; padding: 2px 6px; border-radius: 3px; }
  .section-title .act:hover { opacity:1; color: var(--accent); background: var(--hover); }

  .stats { display:grid; grid-template-columns: repeat(auto-fit, minmax(78px, 1fr)); gap: 6px; }
  .stat { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 6px; padding: 7px 9px; min-width: 0; }
  .stat .k { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
  .stat .v { font-size: 15px; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stat .v small { font-size: 10px; color: var(--muted); font-weight: 400; margin-left: 3px; }

  .grid-actions { display:grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap:6px; }
  .grid-actions .btn.primary { grid-column: 1 / -1; }
  .btn {
    display:flex; align-items:center; gap:7px;
    padding: 7px 9px;
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--fg));
    border:1px solid var(--border); border-radius: 6px;
    cursor:pointer; font: inherit; text-align:left;
    min-width: 0;
    transition: border-color .12s, background .12s, transform .04s;
  }
  .btn:hover { background: var(--hover); border-color: var(--accent); }
  .btn:active { transform: translateY(1px); }
  .btn.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: transparent;
    justify-content: center;
    padding: 8px 10px;
  }
  .btn.primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn .ico { font-size: 13px; opacity: .9; width: 14px; text-align:center; flex-shrink:0; }
  .btn .lbl { flex:1; font-size: 11.5px; font-weight: 500; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; min-width: 0; }

  .list { display:flex; flex-direction:column; gap: 3px; }
  .item {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 8px;
    border-radius: 5px; cursor: pointer;
    border: 1px solid transparent;
    transition: background .12s, border-color .12s;
  }
  .item:hover { background: var(--hover); border-color: var(--border); }
  .item:active { transform: translateY(1px); }
  /* Inner spans should not eat the click — entire row is the target. */
  .item * { pointer-events: none; }
  .item .state { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .item .state.completed { background: var(--good); }
  .item .state.running,
  .item .state.verifying { background: var(--accent); animation: pulse 1.2s infinite; }
  .item .state.scheduled { background: var(--accent); }
  .item .state.approved  { background: var(--accent); }
  .item .state.planned   { background: #a78bfa; }
  .item .state.draft     { background: var(--muted); }
  .item .state.blocked   { background: var(--warn); }
  .item .state.cancelled { background: var(--warn); }
  .item .state.failed    { background: var(--bad); }
  .item .body { flex:1; min-width: 0; }
  .item .body .t { font-size: 11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight: 500; }
  .item .body .s { font-size: 10px; color: var(--muted); margin-top: 2px; display:flex; gap: 6px; align-items: center; }
  .item .body .s .stat-name { font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .item .body .s .stat-name.completed { color: var(--good); }
  .item .body .s .stat-name.running,
  .item .body .s .stat-name.verifying { color: var(--accent); }
  .item .body .s .stat-name.failed    { color: var(--bad); }
  .item .body .s .stat-name.cancelled,
  .item .body .s .stat-name.blocked   { color: var(--warn); }
  .item .body .s span { white-space: nowrap; }
  .item .arrow { color: var(--muted); opacity: 0; flex-shrink: 0; font-size: 10px; transition: opacity .12s; }
  .item:hover .arrow { opacity: .8; }
  @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: .4 } }

  .provider { display:flex; align-items:center; gap:8px; padding: 4px 6px; font-size: 11px; }
  .provider .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .provider .dot.up   { background: var(--good); }
  .provider .dot.down { background: var(--bad); }
  .provider .name { flex:1; }
  .provider .count { font-size: 10px; color: var(--muted); }

  .empty { padding: 8px 6px; font-size: 11px; color: var(--muted); font-style: italic; text-align: center; }

  .footer { font-size: 10px; color: var(--muted); display:flex; justify-content: space-between; padding: 6px 4px 0; }
  .footer a { color: var(--accent); text-decoration: none; cursor:pointer; }
  .footer a:hover { text-decoration: underline; }
  kbd { background: var(--bg-alt); border:1px solid var(--border); border-bottom-width: 2px; border-radius: 3px; padding: 1px 4px; font-size: 10px; font-family: var(--vscode-editor-font-family); }
</style>
</head>
<body>
<div id="root">
  <div class="card hdr">
    <div class="logo">F</div>
    <div style="flex:1">
      <h1>Forge</h1>
      <div class="ver" id="ver">loading…</div>
    </div>
    <span class="pill idle" id="pill"><span class="dot"></span>idle</span>
  </div>
  <div id="content"></div>
</div>

<script>
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function fmt(n, decimals = 0) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e9) return (n/1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'k';
    return Number(n).toFixed(decimals);
  }
  function money(n) {
    if (n == null || isNaN(n)) return '$0.00';
    if (n < 0.01 && n > 0) return '<$0.01';
    return '$' + Number(n).toFixed(n < 1 ? 3 : 2);
  }
  function ago(t) {
    if (!t) return '';
    const ms = typeof t === 'number' ? t : Date.parse(String(t));
    if (!ms) return '';
    const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
    if (s < 60)   return s + 's';
    if (s < 3600) return Math.floor(s/60) + 'm';
    if (s < 86400)return Math.floor(s/3600) + 'h';
    return Math.floor(s/86400) + 'd';
  }
  function trim(s, n) { s = String(s ?? ''); return s.length <= n ? s : s.slice(0, n - 1) + '…'; }

  function invoke(command, arg) { vscode.postMessage({ type: 'invoke', command, arg }); }
  function copy(text)           { vscode.postMessage({ type: 'copy', arg: text }); }
  function refresh()             { vscode.postMessage({ type: 'refresh' }); }

  function renderHeader(s) {
    const live = s.status?.reachable;
    const binOk = s.binary?.ok;
    const pill = $('pill');
    if (!binOk) {
      pill.className = 'pill bad'; pill.innerHTML = '<span class="dot"></span>no binary';
    } else if (live) {
      pill.className = 'pill live'; pill.innerHTML = '<span class="dot"></span>live';
    } else {
      pill.className = 'pill idle'; pill.innerHTML = '<span class="dot"></span>idle';
    }
    const ver = s.binary?.version ?? s.status?.version;
    $('ver').textContent = binOk
      ? (ver ? trim(ver, 32) : 'binary ready')
      : 'binary not found';
  }

  function renderStats(s) {
    const local   = s.local ?? {};
    const tokens  = local.tokens     ?? 0;
    const calls   = local.calls      ?? 0;
    const tasks   = local.taskCount  ?? (s.tasks ? s.tasks.length : 0);
    const today   = local.todayCount ?? 0;
    const running = local.runningCount ?? 0;
    const upProviders    = (s.status?.providers ?? []).filter(p => p.available).length;
    const totalProviders = (s.status?.providers ?? []).length;
    return [
      '<div class="stats">',
        statTile('Today',     today + (running ? ' <small>· '+running+' run</small>' : '')),
        statTile('Tokens',    fmt(tokens) + ' <small>tot</small>'),
        statTile('Calls',     fmt(calls)),
        statTile('Tasks',     fmt(tasks)),
        totalProviders ? statTile('Providers', upProviders + '<small>/'+totalProviders+'</small>') : '',
      '</div>',
    ].join('');
  }
  function statTile(k, v) {
    return '<div class="stat"><div class="k">'+esc(k)+'</div><div class="v">'+v+'</div></div>';
  }

  function renderActions() {
    const acts = [
      { c: 'forge.runTask',       l: '▶  New Task',           primary: true },
      { c: 'forge.openRepl',      l: 'REPL',         i: '❯' },
      { c: 'forge.openDashboard', l: 'Dashboard',    i: '◫' },
      { c: 'forge.startUi',       l: 'Start UI',     i: '⇧' },
      { c: 'forge.killTerminals', l: 'Stop All',     i: '◼' },
      { c: 'forge.runSelection',  l: 'Selection',    i: '↗' },
      { c: 'forge.runFile',       l: 'File',         i: '⊟' },
      { c: 'forge.doctor',        l: 'Doctor',       i: '✚' },
      { c: 'forge.openInBrowser', l: 'Browser',      i: '⤴' },
      { c: 'forge.changeCwd',     l: 'CWD',          i: '⌂' },
      { c: 'forge.copyDashUrl',   l: 'Copy URL',     i: '⧉' },
      { c: 'forge.openSettings',  l: 'Settings',     i: '⚙' },
    ];
    return '<div class="grid-actions">' + acts.map(a => {
      const ico  = a.i ? '<span class="ico">'+a.i+'</span>' : '';
      return '<button class="btn'+(a.primary?' primary':'')+'" data-cmd="'+a.c+'" title="'+esc(a.l)+'">'
        + ico + '<span class="lbl">'+a.l+'</span></button>';
    }).join('') + '</div>';
  }

  function renderTasks(tasks) {
    if (!tasks || !tasks.length) return '<div class="empty">No tasks yet — start one above.</div>';
    return '<div class="list">' + tasks.slice(0, 8).map(t => {
      const status = (t.status ?? 'draft').toLowerCase();
      const when   = ago(t.updated_at ?? t.created_at);
      const title  = t.title ?? t.intent ?? t.id;
      const sub    = []
        .concat('<span class="stat-name '+esc(status)+'">'+esc(status)+'</span>')
        .concat(t.mode ? '<span>'+esc(t.mode)+'</span>' : [])
        .concat(when  ? '<span>'+esc(when)+' ago</span>' : [])
        .concat(t.attempts && t.attempts > 1 ? '<span>×'+esc(t.attempts)+'</span>' : []);
      return ''
        + '<div class="item" data-task="'+esc(t.id)+'" title="'+esc(title)+'\\n'+esc(t.id)+'">'
        +   '<span class="state '+esc(status)+'"></span>'
        +   '<div class="body">'
        +     '<div class="t">'+esc(trim(title, 80))+'</div>'
        +     '<div class="s">' + sub.join('<span style="opacity:.4">·</span>') + '</div>'
        +   '</div>'
        +   '<span class="arrow">›</span>'
        + '</div>';
    }).join('') + '</div>';
  }

  function renderModels(models) {
    if (!models || !models.length) return '<div class="empty">Dashboard offline — start UI to see models.</div>';
    return '<div class="list">' + models.map(m =>
      '<div class="provider">'
        + '<span class="dot '+(m.available?'up':'down')+'"></span>'
        + '<span class="name">'+esc(m.provider)+'</span>'
        + '<span class="count">'+(m.available ? (m.models?.length ?? 0) + ' model'+((m.models?.length ?? 0)===1?'':'s') : 'offline')+'</span>'
      + '</div>'
    ).join('') + '</div>';
  }

  function metaRow(label, value, copyable) {
    if (!value) return '';
    const safe = esc(value);
    const copy = copyable
      ? '<span class="copy" data-copy="'+safe+'" title="Copy">⧉</span>'
      : '<span></span>';
    return ''
      + '<div class="row" title="'+safe+'">'
      +   '<span class="k">'+esc(label)+'</span>'
      +   '<span class="v">'+safe+'</span>'
      +   copy
      + '</div>';
  }

  function renderMeta(s) {
    const cwd = s.cfg?.cwd ?? '';
    const url = s.cfg?.uiUrl ?? '';
    const provider = s.status?.provider
      ? s.status.provider + (s.status.defaultMode ? ' · ' + s.status.defaultMode : '')
      : '';
    return ''
      + '<div class="meta">'
      +   metaRow('cwd', cwd, true)
      +   metaRow('url', url, true)
      +   metaRow('mode', provider, false)
      + '</div>';
  }

  function renderOnboarding(s) {
    const path = s.cfg?.binary || 'forge';
    const why  = s.binary?.error ? esc(String(s.binary.error).slice(0, 140)) : 'Not on PATH.';
    return ''
      + '<div class="card" style="border-color: color-mix(in srgb, var(--bad) 40%, var(--border));">'
      +   '<div class="section-title" style="color: var(--bad)">Forge runtime not found</div>'
      +   '<div style="font-size: 11.5px; line-height: 1.45; margin: 4px 4px 10px; color: var(--fg);">'
      +     'The Forge binary <code style="background:var(--bg-alt);padding:1px 5px;border-radius:3px">'+esc(path)+'</code> is not available.'
      +     ' <span style="color: var(--muted)">'+why+'</span>'
      +   '</div>'
      +   '<div class="grid-actions" style="grid-template-columns: 1fr;">'
      +     '<button class="btn primary" data-cmd="forge.install"><span class="ico">⬇</span><span class="lbl">Install via npm</span></button>'
      +     '<button class="btn" data-cmd="forge.openInstallDocs"><span class="ico">↗</span><span class="lbl">Read install docs</span></button>'
      +     '<button class="btn" data-cmd="forge.openSettings"><span class="ico">⚙</span><span class="lbl">Set custom binary path</span></button>'
      +     '<button class="btn" data-cmd="forge.refreshTree"><span class="ico">↻</span><span class="lbl">I installed it — refresh</span></button>'
      +   '</div>'
      + '</div>'
      + '<div class="card">'
      +   '<div class="section-title">What you get once it is installed</div>'
      +   '<div style="font-size: 11px; line-height: 1.5; color: var(--muted); padding: 0 4px;">'
      +     'Run any task from the editor, watch it stream live, browse history,'
      +     ' embed the dashboard alongside your code, and read live token / spend'
      +     ' stats straight from <code>~/.forge/global/index.db</code>.'
      +   '</div>'
      + '</div>';
  }

  function render(s) {
    renderHeader(s);
    if (!s.binary?.ok) {
      $('content').innerHTML = renderOnboarding(s);
      return;
    }
    const html = ''
      + '<div class="card">'
      +   '<div class="section-title">Workspace</div>'
      +   renderMeta(s)
      + '</div>'
      + '<div class="card">'
      +   '<div class="section-title">Stats <span class="act" data-cmd="forge.refreshTree" title="Refresh">↻</span></div>'
      +   renderStats(s)
      + '</div>'
      + '<div class="card">'
      +   '<div class="section-title">Actions</div>'
      +   renderActions()
      + '</div>'
      + '<div class="card">'
      +   '<div class="section-title">Recent tasks <span class="act" data-cmd="forge.openTasksView" title="Open the Tasks page">view all</span></div>'
      +   renderTasks(s.tasks)
      + '</div>'
      + '<div class="card">'
      +   '<div class="section-title">Providers</div>'
      +   renderModels(s.models)
      + '</div>'
      + '<div class="footer">'
      +   '<span>Updated '+esc(s.fetchedAt)+'</span>'
      +   '<a data-cmd="forge.status">status</a>'
      + '</div>';
    $('content').innerHTML = html;
  }

  // One delegated click handler. Order matters — copy button is nested
  // inside a row, so it must be checked before the row.
  document.body.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;

    const copyEl = el.closest('[data-copy]');
    if (copyEl) {
      e.stopPropagation();
      copy(copyEl.getAttribute('data-copy') ?? '');
      return;
    }

    const cmdEl = el.closest('[data-cmd]');
    if (cmdEl) {
      e.stopPropagation();
      invoke(cmdEl.getAttribute('data-cmd'), cmdEl.getAttribute('data-arg') ?? undefined);
      return;
    }

    const taskEl = el.closest('[data-task]');
    if (taskEl) {
      e.stopPropagation();
      invoke('forge.openTask', taskEl.getAttribute('data-task'));
      return;
    }
  });

  window.addEventListener('message', (ev) => {
    if (ev.data?.type === 'snapshot') render(ev.data.snap);
  });

  // Ask the host to send the first snapshot.
  refresh();
</script>
</body></html>`;
}
