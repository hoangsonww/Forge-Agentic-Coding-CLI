/**
 * Settings access. Centralised so commands don't read the workspace
 * config in five different places and disagree about defaults.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as path from 'path';
import * as vscode from 'vscode';

export interface ForgeConfig {
  readonly binaryPath: string;
  readonly cwd: string;
  readonly uiHost: string;
  readonly uiPort: number;
  readonly autoStartUi: boolean;
  readonly replArgs: readonly string[];
  readonly runArgs: readonly string[];
}

export function readConfig(): ForgeConfig {
  const c = vscode.workspace.getConfiguration('forge');
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const cwdRaw = (c.get<string>('cwd') ?? '').trim();
  const cwd = cwdRaw ? (path.isAbsolute(cwdRaw) ? cwdRaw : path.join(folder, cwdRaw)) : folder;

  return {
    binaryPath: (c.get<string>('binaryPath') ?? 'forge').trim() || 'forge',
    cwd,
    uiHost: (c.get<string>('uiHost') ?? '127.0.0.1').trim() || '127.0.0.1',
    uiPort: Number(c.get<number>('uiPort') ?? 7823),
    autoStartUi: !!c.get<boolean>('autoStartUi'),
    replArgs: c.get<string[]>('replArgs') ?? [],
    runArgs: c.get<string[]>('runArgs') ?? [],
  };
}

export function dashboardUrl(cfg: ForgeConfig): string {
  return `http://${cfg.uiHost}:${cfg.uiPort}`;
}
