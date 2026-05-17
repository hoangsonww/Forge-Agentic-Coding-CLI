/**
 * Manages the long-lived "Forge REPL" terminal and short-lived
 * `forge run` terminals. Reuses the REPL terminal if it's still alive
 * so users don't accumulate twelve panes after a session.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as vscode from 'vscode';
import { ForgeConfig } from './config';

const REPL_NAME = 'Forge REPL';

export function openRepl(cfg: ForgeConfig): vscode.Terminal {
  const existing = vscode.window.terminals.find((t) => t.name === REPL_NAME);
  if (existing && (existing as vscode.Terminal & { exitStatus?: unknown }).exitStatus == null) {
    existing.show(true);
    return existing;
  }
  const term = vscode.window.createTerminal({
    name: REPL_NAME,
    cwd: cfg.cwd,
    iconPath: new vscode.ThemeIcon('rocket'),
  });
  const args = cfg.replArgs.length ? ' ' + cfg.replArgs.map(shellQuote).join(' ') : '';
  term.sendText(`${shellQuote(cfg.binaryPath)}${args}`);
  term.show(true);
  return term;
}

export function runTask(cfg: ForgeConfig, task: string): vscode.Terminal {
  const stamp = new Date().toLocaleTimeString();
  const term = vscode.window.createTerminal({
    name: `Forge · ${stamp}`,
    cwd: cfg.cwd,
    iconPath: new vscode.ThemeIcon('play'),
  });
  const extra = cfg.runArgs.length ? ' ' + cfg.runArgs.map(shellQuote).join(' ') : '';
  term.sendText(`${shellQuote(cfg.binaryPath)} run ${shellQuote(task)}${extra}`);
  term.show(true);
  return term;
}

export function spawnHidden(cfg: ForgeConfig, args: readonly string[], name: string): vscode.Terminal {
  const term = vscode.window.createTerminal({
    name,
    cwd: cfg.cwd,
    iconPath: new vscode.ThemeIcon('server-environment'),
  });
  term.sendText(`${shellQuote(cfg.binaryPath)} ${args.map(shellQuote).join(' ')}`);
  return term;
}

export function findTerminal(name: string): vscode.Terminal | undefined {
  return vscode.window.terminals.find((t) => t.name === name);
}

function shellQuote(s: string): string {
  if (s === '') return "''";
  if (/^[A-Za-z0-9_./@:=+,-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
