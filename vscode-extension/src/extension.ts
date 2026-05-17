/**
 * Entry point — registers commands, status bar, sidebar webview. The
 * extension is a thin wrapper: it never speaks to the orchestrator
 * directly, it shells out to the `forge` binary the user already
 * has installed.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { dashboardUrl, readConfig } from './config';
import { openRepl, runTask } from './terminal';
import { openDashboard, startUi, stopUi } from './dashboard';
import { StatusBar } from './status';
import { ForgeSidebarProvider } from './sidebar';
import { probeBinary, probeUi } from './probe';

const INSTALL_DOCS_URL = 'https://github.com/hoangsonww/Forge-Agentic-Coding-CLI#installation';
const NPM_INSTALL = 'npm install -g @hoangsonw/forge';

async function offerInstallIfMissing(): Promise<void> {
  const cfg = readConfig();
  const probe = await probeBinary(cfg.binaryPath);
  if (probe.ok) return;
  const choice = await vscode.window.showWarningMessage(
    `Forge is not installed (\`${cfg.binaryPath}\` not found on PATH). The extension needs the Forge runtime to do anything.`,
    'Install via npm',
    'Open docs',
    'Set custom path…',
    'Dismiss',
  );
  if (choice === 'Install via npm') {
    await vscode.commands.executeCommand('forge.install');
  } else if (choice === 'Open docs') {
    await vscode.env.openExternal(vscode.Uri.parse(INSTALL_DOCS_URL));
  } else if (choice === 'Set custom path…') {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'forge.binaryPath');
  }
}

export function activate(ctx: vscode.ExtensionContext): void {
  const status = new StatusBar();
  status.start();
  ctx.subscriptions.push({ dispose: () => status.dispose() });

  const sidebar = new ForgeSidebarProvider();
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ForgeSidebarProvider.viewId, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  const reg = (id: string, fn: (...args: unknown[]) => unknown) =>
    ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

  /** Returns true iff the configured forge binary is on PATH. Otherwise
   *  shows the install/docs picker and returns false so the caller can
   *  bail out before spawning a doomed terminal. */
  const ensureBinary = async (): Promise<boolean> => {
    const cfg = readConfig();
    const probe = await probeBinary(cfg.binaryPath);
    if (probe.ok) return true;
    await offerInstallIfMissing();
    return false;
  };

  reg('forge.install', () => {
    const term = vscode.window.createTerminal({
      name: 'Forge Install',
      iconPath: new vscode.ThemeIcon('cloud-download'),
    });
    term.sendText(NPM_INSTALL);
    term.show(true);
    vscode.window.showInformationMessage(
      'Installing Forge globally. After it finishes, click Refresh on the Forge sidebar.',
    );
  });

  reg('forge.openInstallDocs', async () => {
    await vscode.env.openExternal(vscode.Uri.parse(INSTALL_DOCS_URL));
  });

  reg('forge.openRepl', async () => {
    if (!(await ensureBinary())) return;
    openRepl(readConfig());
  });

  reg('forge.runTask', async () => {
    if (!(await ensureBinary())) return;
    const task = await vscode.window.showInputBox({
      title: 'Forge — run task',
      prompt: 'Describe what Forge should do (single line; long prompts are fine).',
      placeHolder: 'e.g. add a /healthz route to src/server.ts and a test for it',
      ignoreFocusOut: true,
    });
    if (!task || !task.trim()) return;
    runTask(readConfig(), task.trim());
    void sidebar.refresh();
  });

  reg('forge.runSelection', async () => {
    if (!(await ensureBinary())) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor.');
      return;
    }
    const text = editor.document.getText(editor.selection).trim();
    if (!text) {
      vscode.window.showWarningMessage('No text selected.');
      return;
    }
    runTask(readConfig(), text);
    void sidebar.refresh();
  });

  reg('forge.runFile', async () => {
    if (!(await ensureBinary())) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor.');
      return;
    }
    const body = editor.document.getText().trim();
    if (!body) {
      vscode.window.showWarningMessage('Active file is empty.');
      return;
    }
    runTask(readConfig(), body);
    void sidebar.refresh();
  });

  reg('forge.startUi', async () => {
    if (!(await ensureBinary())) return;
    const cfg = readConfig();
    await startUi(cfg);
    await openDashboard(cfg, false);
    vscode.window.setStatusBarMessage('Forge → dashboard live', 2500);
    void sidebar.refresh();
  });

  reg('forge.stopUi', () => {
    stopUi();
    void sidebar.refresh();
  });

  reg('forge.openDashboard', async () => {
    if (!(await ensureBinary())) return;
    await openDashboard(readConfig(), true);
    vscode.window.setStatusBarMessage('Forge → dashboard opened', 2500);
    void sidebar.refresh();
  });

  reg('forge.openTasksView', async () => {
    if (!(await ensureBinary())) return;
    await openDashboard(readConfig(), true, undefined, 'tasks');
    vscode.window.setStatusBarMessage('Forge → tasks page opened', 2500);
    void sidebar.refresh();
  });

  reg('forge.openInBrowser', async () => {
    const cfg = readConfig();
    await vscode.env.openExternal(vscode.Uri.parse(dashboardUrl(cfg)));
  });

  reg('forge.doctor', async () => {
    if (!(await ensureBinary())) return;
    const cfg = readConfig();
    const term = vscode.window.createTerminal({
      name: 'Forge Doctor',
      cwd: cfg.cwd,
      iconPath: new vscode.ThemeIcon('pulse'),
    });
    term.sendText(`${cfg.binaryPath} doctor`);
    term.show(true);
  });

  reg('forge.status', async () => {
    const cfg = readConfig();
    const [bin, ui] = await Promise.all([
      probeBinary(cfg.binaryPath),
      probeUi(cfg.uiHost, cfg.uiPort, 1000),
    ]);
    const lines = [
      `binary: ${bin.ok ? bin.version ?? 'ok' : 'NOT FOUND (' + (bin.error ?? 'unknown') + ')'}`,
      `cwd: ${cfg.cwd}`,
      `dashboard: ${ui ? 'live ' : 'idle '}${dashboardUrl(cfg)}`,
    ];
    vscode.window.showInformationMessage(lines.join('   ·   '));
  });

  reg('forge.refreshTree', () => {
    void sidebar.refresh();
  });

  reg('forge.openSettings', () => {
    void vscode.commands.executeCommand('workbench.action.openSettings', 'forge');
  });

  reg('forge.copyDashUrl', async () => {
    const url = dashboardUrl(readConfig());
    await vscode.env.clipboard.writeText(url);
    vscode.window.setStatusBarMessage(`Copied ${url}`, 2500);
  });

  reg('forge.killTerminals', () => {
    const ours = vscode.window.terminals.filter(
      (t) => t.name === 'Forge REPL' || t.name === 'Forge UI Server' || t.name === 'Forge Doctor' || t.name.startsWith('Forge · '),
    );
    if (!ours.length) {
      vscode.window.showInformationMessage('No Forge terminals to stop.');
      return;
    }
    ours.forEach((t) => t.dispose());
    vscode.window.showInformationMessage(`Stopped ${ours.length} Forge terminal(s).`);
    void sidebar.refresh();
  });

  reg('forge.changeCwd', async () => {
    const folder = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Use as Forge CWD',
    });
    if (!folder?.length) return;
    const target = folder[0].fsPath;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const value = root ? path.relative(root, target) || '.' : target;
    await vscode.workspace.getConfiguration('forge').update('cwd', value, vscode.ConfigurationTarget.Workspace);
    vscode.window.setStatusBarMessage(`Forge cwd → ${target}`, 3000);
    void sidebar.refresh();
  });

  reg('forge.openTask', async (id: unknown) => {
    if (typeof id !== 'string' || !id) {
      vscode.window.showWarningMessage('No task id received from sidebar.');
      return;
    }
    await openDashboard(readConfig(), true, id);
    vscode.window.setStatusBarMessage(`Forge → opened task ${id.slice(0, 12)}…`, 3500);
  });

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('forge')) void sidebar.refresh();
    }),
  );

  if (readConfig().autoStartUi) {
    void startUi(readConfig());
  }

  // First-run nudge: if the binary isn't there, tell the user once on
  // activation so the sidebar isn't a confusing pile of zeroes.
  void offerInstallIfMissing();
}

export function deactivate(): void {
  // Terminals are owned by VS Code; status bar is disposed via subscriptions.
}
