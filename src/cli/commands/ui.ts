/**
 * UI command for local dashboard.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { bootstrap } from '../bootstrap';
import { startUiServer } from '../../ui/server';
import { info, ok, err } from '../ui';

export const uiCommand = new Command('ui').description('Local dashboard.');

uiCommand
  .command('start')
  .description('Start the dashboard server (foreground).')
  .option('--port <n>', 'port', '7823')
  .option('--bind <addr>', 'bind address', '127.0.0.1')
  .action(async (opts) => {
    bootstrap();
    try {
      const { port } = await startUiServer({ port: Number(opts.port), bind: opts.bind });
      ok(`Dashboard at http://${opts.bind}:${port}`);
      info('Press Ctrl+C to stop.');
      // Keep alive.
      await new Promise(() => {});
    } catch (e) {
      err(`Failed to start UI: ${String(e)}`);
      process.exitCode = 1;
    }
  });
