import * as fs from 'fs';
import { spawn } from 'child_process';
import * as path from 'path';
import { paths, ensureForgeHome } from '../config/paths';

export const daemonStatus = (): { running: boolean; pid?: number } => {
  try {
    if (!fs.existsSync(paths.daemonPid)) return { running: false };
    const pid = Number(fs.readFileSync(paths.daemonPid, 'utf8').trim());
    if (!Number.isFinite(pid)) return { running: false };
    try {
      process.kill(pid, 0);
      return { running: true, pid };
    } catch {
      return { running: false };
    }
  } catch {
    return { running: false };
  }
};

export const startDaemon = (): { pid: number } => {
  ensureForgeHome();
  const existing = daemonStatus();
  if (existing.running) return { pid: existing.pid! };
  const daemonScript = path.join(__dirname, 'server.js');
  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: ['ignore', fs.openSync(paths.daemonLog, 'a'), fs.openSync(paths.daemonLog, 'a')],
  });
  child.unref();
  return { pid: child.pid ?? -1 };
};

export const stopDaemon = (): boolean => {
  const status = daemonStatus();
  if (!status.running || !status.pid) return false;
  try {
    process.kill(status.pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
};
