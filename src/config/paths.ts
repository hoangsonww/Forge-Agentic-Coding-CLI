/**
 * Path configuration and utilities for Forge. Centralizes all filesystem interactions to ensure consistency and maintainability. Key features include:
 *   • Standardized directory structure under the Forge home directory (defaulting to ~/.forge or XDG-compliant location)
 *   • Project-specific subdirectories for tasks, sessions, logs, memory, and metadata
 *   Utility functions to ensure directories exist, compute project IDs based on absolute paths, and resolve project subdirectories
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { resolveForgeHome } from './xdg';

export const FORGE_HOME = resolveForgeHome();
void os; // keep import for other consumers that may rely on it transitively

export const paths = {
  home: FORGE_HOME,
  bin: path.join(FORGE_HOME, 'bin'),
  models: path.join(FORGE_HOME, 'models'),
  memory: path.join(FORGE_HOME, 'memory'),
  plugins: path.join(FORGE_HOME, 'plugins'),
  skills: path.join(FORGE_HOME, 'skills'),
  agents: path.join(FORGE_HOME, 'agents'),
  mcp: path.join(FORGE_HOME, 'mcp'),
  mcpTokens: path.join(FORGE_HOME, 'mcp', 'tokens'),
  logs: path.join(FORGE_HOME, 'logs'),
  global: path.join(FORGE_HOME, 'global'),
  projects: path.join(FORGE_HOME, 'projects'),
  globalIndex: path.join(FORGE_HOME, 'global', 'index.db'),
  globalConfig: path.join(FORGE_HOME, 'config.json'),
  globalInstructions: path.join(FORGE_HOME, 'instructions.md'),
  daemonSocket:
    process.platform === 'win32'
      ? '\\\\.\\pipe\\forge-daemon'
      : path.join(FORGE_HOME, 'daemon.sock'),
  daemonPid: path.join(FORGE_HOME, 'daemon.pid'),
  daemonLog: path.join(FORGE_HOME, 'logs', 'daemon.log'),
};

export const projectConfigDir = '.forge';

export const ensureForgeHome = (): void => {
  const dirs = [
    paths.home,
    paths.bin,
    paths.models,
    paths.memory,
    paths.plugins,
    paths.skills,
    paths.agents,
    paths.mcp,
    paths.mcpTokens,
    paths.logs,
    paths.global,
    paths.projects,
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const projectId = (absolutePath: string): string => {
  const normalized = path.resolve(absolutePath);
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
};

export const projectDir = (absolutePath: string): string =>
  path.join(paths.projects, projectId(absolutePath));

export const projectSubdirs = (absolutePath: string) => {
  const root = projectDir(absolutePath);
  return {
    root,
    tasks: path.join(root, 'tasks'),
    sessions: path.join(root, 'sessions'),
    logs: path.join(root, 'logs'),
    memory: path.join(root, 'memory'),
    metadata: path.join(root, 'metadata.json'),
  };
};

export const ensureProjectDir = (absolutePath: string): ReturnType<typeof projectSubdirs> => {
  const sub = projectSubdirs(absolutePath);
  for (const dir of [sub.root, sub.tasks, sub.sessions, sub.logs, sub.memory]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return sub;
};
