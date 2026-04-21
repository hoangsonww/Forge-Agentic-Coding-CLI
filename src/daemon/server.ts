/**
 * Forge daemon — a lightweight background process that periodically checks
 * for updates and exposes a minimal IPC endpoint for future UI/daemon
 * features. Deliberately tiny; the real work happens in the CLI process.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import * as net from 'net';
import { paths, ensureForgeHome } from '../config/paths';
import { log } from '../logging/logger';
import { checkForUpdate } from './updater';
import { rotateIfNeeded } from '../logging/rotation';
import { decay as decayLearning } from '../memory/learning';

const start = async (): Promise<void> => {
  ensureForgeHome();
  writePid();
  if (fs.existsSync(paths.daemonSocket)) {
    try {
      fs.unlinkSync(paths.daemonSocket);
    } catch {
      /* ignore */
    }
  }
  const server = net.createServer((conn) => {
    conn.on('data', async (data) => {
      const msg = data.toString('utf8').trim();
      if (msg === 'ping') conn.write('pong\n');
      else if (msg === 'check-update') {
        const res = await checkForUpdate({ force: true });
        conn.write(JSON.stringify(res) + '\n');
      } else conn.write('unknown\n');
    });
  });
  if (process.platform !== 'win32') {
    server.listen(paths.daemonSocket);
  } else {
    server.listen(paths.daemonSocket); // pipe
  }
  log.info('daemon started', { socket: paths.daemonSocket, pid: process.pid });

  // Periodic background chores.
  const tick = async () => {
    try {
      await checkForUpdate();
    } catch (err) {
      log.debug('update tick failed', { err: String(err) });
    }
    try {
      rotateIfNeeded();
    } catch (err) {
      log.debug('log rotation skipped', { err: String(err) });
    }
    try {
      decayLearning();
    } catch (err) {
      log.debug('learning decay skipped', { err: String(err) });
    }
  };
  setInterval(tick, 6 * 3600_000);
  await tick();

  process.on('SIGTERM', () => shutdown(server));
  process.on('SIGINT', () => shutdown(server));
};

const shutdown = (server: net.Server): void => {
  log.info('daemon shutting down');
  server.close(() => {
    try {
      fs.unlinkSync(paths.daemonPid);
    } catch {
      /* ignore */
    }
    process.exit(0);
  });
};

const writePid = (): void => {
  ensureForgeHome();
  fs.writeFileSync(paths.daemonPid, String(process.pid));
};

if (require.main === module) {
  start().catch((err) => {
    log.error('daemon failed to start', { err: String(err) });
    process.exit(1);
  });
}

export { start };
