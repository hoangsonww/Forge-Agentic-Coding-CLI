/**
 * Status command - show runtime status, including daemon, provider availability, and recent tasks.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { banner, divider, section, kv, pill, tableOut, dim, PALETTE } from '../ui';
import { listTasks } from '../../persistence/index-db';
import { bootstrap } from '../bootstrap';
import { loadGlobalConfig } from '../../config/loader';
import { daemonStatus } from '../../daemon/control';
import { readCache } from '../../daemon/updater';
import { listProviders } from '../../models/provider';

export const statusCommand = new Command('status')
  .description('Show Forge runtime status.')
  .option('--no-banner', 'omit the banner', false)
  .action(async (opts) => {
    bootstrap();
    if (opts.banner !== false) process.stdout.write(banner());
    const cfg = loadGlobalConfig();
    const daemon = daemonStatus();
    const update = readCache();

    process.stdout.write(divider('runtime') + '\n\n');
    const daemonPill = daemon.running
      ? pill('daemon ', `pid ${daemon.pid}`, 'ok')
      : pill('daemon ', 'stopped', 'warn');
    const channelPill = pill('channel', cfg.update.channel, 'neutral');
    const modePill = pill('mode   ', cfg.defaultMode, 'neutral');
    process.stdout.write('  ' + daemonPill + '   ' + channelPill + '   ' + modePill + '\n\n');

    process.stdout.write(kv('provider', chalk.rgb(...PALETTE.cyan)(cfg.provider)) + '\n');
    process.stdout.write(kv('default mode', cfg.defaultMode) + '\n');
    process.stdout.write(kv('channel', cfg.update.channel) + '\n');
    if (update) {
      const u = update.hasUpdate
        ? chalk.rgb(...PALETTE.amber)(`available → ${update.latestVersion}`)
        : chalk.rgb(...PALETTE.green)('up to date');
      process.stdout.write(kv('update', u) + '\n');
    }

    process.stdout.write(section('providers', '⚡'));
    for (const p of listProviders()) {
      try {
        const up = await p.isAvailable();
        process.stdout.write(
          '  ' + (up ? chalk.green('●') : chalk.dim('○')) + '  ' + chalk.bold(p.name) + '\n',
        );
      } catch {
        process.stdout.write(
          '  ' + chalk.red('●') + '  ' + chalk.bold(p.name) + ' ' + dim('(error)') + '\n',
        );
      }
    }

    const recent = listTasks(undefined, 10);
    if (recent.length) {
      process.stdout.write(section('recent tasks', '◎'));
      process.stdout.write(
        tableOut(
          ['id', 'status', 'mode', 'intent', 'risk', 'title'],
          recent.map((t) => [
            t.id,
            t.status,
            t.mode,
            t.intent ?? '—',
            t.risk ?? '—',
            (t.title || '').slice(0, 48),
          ]),
        ) + '\n',
      );
    }
  });
