/**
 * Daemon management commands. Supports starting, stopping, and checking the status of the background daemon process. The daemon is responsible for handling long-running tasks and maintaining state across CLI invocations. This command abstracts away the details of managing the daemon process, providing a simple interface for users to control it as needed.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { bootstrap } from '../bootstrap';
import { startDaemon, stopDaemon, daemonStatus } from '../../daemon/control';
import { ok, info, warn, err } from '../ui';

export const daemonCommand = new Command('daemon').description('Daemon management.');

daemonCommand
  .command('start')
  .description('Start the background daemon.')
  .action(() => {
    bootstrap();
    const res = startDaemon();
    ok(`Daemon started (pid ${res.pid}).`);
  });

daemonCommand
  .command('stop')
  .description('Stop the background daemon.')
  .action(() => {
    bootstrap();
    const stopped = stopDaemon();
    if (stopped) ok('Daemon stopped.');
    else warn('Daemon was not running.');
  });

daemonCommand
  .command('status')
  .description('Daemon status.')
  .action(() => {
    bootstrap();
    const s = daemonStatus();
    if (s.running) info(`running (pid ${s.pid})`);
    else err('stopped');
  });
