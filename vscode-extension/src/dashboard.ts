/**
 * Dashboard surface — start/stop the `forge ui` server and embed it
 * inside a VS Code webview. The webview is just an iframe pointed at
 * the local URL; we don't reimplement the dashboard.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as vscode from 'vscode';
import { ForgeConfig, dashboardUrl } from './config';
import { probeUi } from './probe';
import { findTerminal, spawnHidden } from './terminal';

const SERVER_TERMINAL = 'Forge UI Server';
const POLL_MS = 500;
const POLL_LIMIT = 60;

let panel: vscode.WebviewPanel | undefined;

export async function openDashboard(
  cfg: ForgeConfig,
  autoStart = true,
  taskId?: string,
  view?: string,
): Promise<void> {
  const reachable = await probeUi(cfg.uiHost, cfg.uiPort, 800);
  if (!reachable && autoStart) {
    await startUiAndWait(cfg);
  }
  showWebview(cfg, taskId, view);
}

export async function startUi(cfg: ForgeConfig): Promise<void> {
  if (await probeUi(cfg.uiHost, cfg.uiPort, 600)) {
    vscode.window.showInformationMessage(`Forge UI already running at ${dashboardUrl(cfg)}`);
    return;
  }
  await startUiAndWait(cfg);
}

export function stopUi(): void {
  const term = findTerminal(SERVER_TERMINAL);
  if (!term) {
    vscode.window.showInformationMessage('No Forge UI server terminal to stop.');
    return;
  }
  term.dispose();
  if (panel) {
    panel.dispose();
    panel = undefined;
  }
}

async function startUiAndWait(cfg: ForgeConfig): Promise<void> {
  const args = ['ui', 'start', '--port', String(cfg.uiPort), '--bind', cfg.uiHost];
  spawnHidden(cfg, args, SERVER_TERMINAL);
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Starting Forge dashboard…' },
    async () => {
      for (let i = 0; i < POLL_LIMIT; i++) {
        if (await probeUi(cfg.uiHost, cfg.uiPort, POLL_MS)) return;
        await sleep(POLL_MS);
      }
      throw new Error(`Forge UI did not start on ${dashboardUrl(cfg)} within ${(POLL_LIMIT * POLL_MS) / 1000}s`);
    },
  );
}

function showWebview(cfg: ForgeConfig, taskId?: string, view?: string): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Active, false);
    panel.webview.html = renderHtml(cfg, taskId, view);
    return;
  }
  panel = vscode.window.createWebviewPanel(
    'forgeDashboard',
    'Forge Dashboard',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    },
  );
  panel.iconPath = new vscode.ThemeIcon('rocket');
  panel.webview.html = renderHtml(cfg, taskId, view);
  panel.onDidDispose(() => {
    panel = undefined;
  });
  panel.webview.onDidReceiveMessage((msg) => {
    if (msg?.type === 'openExternal') {
      vscode.env.openExternal(vscode.Uri.parse(dashboardUrl(cfg)));
    } else if (msg?.type === 'reload' && panel) {
      panel.webview.html = renderHtml(cfg);
    }
  });
}

function renderHtml(cfg: ForgeConfig, taskId?: string, view?: string): string {
  const baseUrl = dashboardUrl(cfg);
  const params: string[] = [];
  if (taskId) params.push(`task=${encodeURIComponent(taskId)}`);
  if (view)   params.push(`view=${encodeURIComponent(view)}`);
  const query = params.length ? `?${params.join('&')}` : '';
  const fragment = taskId ? `#task=${encodeURIComponent(taskId)}` : view ? `#view=${encodeURIComponent(view)}` : '';
  const url = `${baseUrl}${query}${fragment}`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${baseUrl} data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src ${baseUrl}; connect-src ${baseUrl};"/>
<style>
  html,body { margin:0; padding:0; height:100%; background:#0a0e14; color:#e0f2fe; font:13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
  header { display:flex; align-items:center; gap:10px; padding:8px 12px; background:#0f1726; border-bottom:1px solid #1f2937; }
  header .dot { width:8px; height:8px; border-radius:50%; background:#22d3ee; box-shadow:0 0 8px #22d3ee; }
  header code { color:#9cc2ff; }
  header .spacer { flex:1; }
  header button { background:#162033; color:#e0f2fe; border:1px solid #2a3850; border-radius:6px; padding:4px 10px; cursor:pointer; font-family:inherit; font-size:12px; }
  header button:hover { border-color:#38bdf8; color:#cfe9ff; }
  iframe { width:100%; height:calc(100% - 38px); border:0; background:#0a0e14; }
</style>
</head>
<body>
  <header>
    <span class="dot" title="connected"></span>
    <span>Forge dashboard</span>
    <code>${baseUrl}</code>
    <span class="spacer"></span>
    <button id="reload">Reload</button>
    <button id="ext">Open in browser</button>
  </header>
  <iframe src="${url}" allow="clipboard-read; clipboard-write"></iframe>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('reload').addEventListener('click', () => vscode.postMessage({ type: 'reload' }));
    document.getElementById('ext').addEventListener('click',    () => vscode.postMessage({ type: 'openExternal' }));
  </script>
</body></html>`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
