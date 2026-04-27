/**
 * Status bar item — shows whether the dashboard is reachable and
 * jumps to the webview on click. Polls every 5s; debounces by
 * skipping when the workspace window is unfocused.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as vscode from 'vscode';
import { ForgeConfig, dashboardUrl, readConfig } from './config';
import { probeBinary, probeUi } from './probe';

const POLL_MS = 5000;
type State = 'missing' | 'idle' | 'live';

export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private timer: NodeJS.Timeout | undefined;
  private lastState: State | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'forge.openDashboard';
    this.item.tooltip = 'Open Forge dashboard';
    this.item.text = '$(rocket) Forge';
    this.item.show();
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_MS);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.item.dispose();
  }

  private async tick(): Promise<void> {
    const cfg: ForgeConfig = readConfig();
    const bin = await probeBinary(cfg.binaryPath, 1500);
    let state: State;
    if (!bin.ok) {
      state = 'missing';
    } else {
      state = (await probeUi(cfg.uiHost, cfg.uiPort, 800)) ? 'live' : 'idle';
    }
    if (state === this.lastState) return;
    this.lastState = state;
    if (state === 'live') {
      this.item.text = '$(rocket) Forge · live';
      this.item.tooltip = `Forge dashboard live at ${dashboardUrl(cfg)} — click to open`;
      this.item.backgroundColor = undefined;
      this.item.command = 'forge.openDashboard';
    } else if (state === 'idle') {
      this.item.text = '$(rocket) Forge · idle';
      this.item.tooltip = `Forge dashboard not running at ${dashboardUrl(cfg)} — click to start`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.item.command = 'forge.openDashboard';
    } else {
      this.item.text = '$(warning) Forge · not installed';
      this.item.tooltip = `Forge runtime not found at \`${cfg.binaryPath}\` — click to install`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      this.item.command = 'forge.install';
    }
  }
}
