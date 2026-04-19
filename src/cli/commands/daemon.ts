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
