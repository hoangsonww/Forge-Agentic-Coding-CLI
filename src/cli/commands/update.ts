/**
 * Forge update command. This command checks for updates to the Forge CLI and applies them if available. It supports options for checking only (without applying) and forcing a network check. The command also includes a subcommand to ignore specific versions, preventing update notifications for those versions in the future.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { bootstrap } from '../bootstrap';
import { checkForUpdate, currentVersion, ignoreVersion, applyUpdate } from '../../daemon/updater';
import { ok, info, warn, err } from '../ui';

export const updateCommand = new Command('update')
  .description('Check for / apply Forge updates.')
  .option('--check', 'check only (do not apply)', false)
  .option('--force', 'force a network check now', false)
  .action(async (opts) => {
    bootstrap();
    const res = await checkForUpdate({ force: opts.force });
    if (!res) {
      warn('Update checks disabled in config.');
      return;
    }
    info(`current: ${currentVersion()}`);
    info(`latest:  ${res.latestVersion} (channel: ${res.channel})`);
    if (!res.hasUpdate) {
      ok('Up to date.');
      return;
    }
    if (opts.check) {
      info(`Update available: ${res.latestVersion}. Run \`forge update\` to apply.`);
      return;
    }
    try {
      const applied = await applyUpdate(res.channel as 'stable' | 'beta' | 'nightly');
      if (applied.applied) {
        ok(`Applied ${applied.detail}`);
        if (applied.path) info(`binary: ${applied.path}`);
      } else {
        warn(
          `No binary release found for channel ${res.channel}. Try: npm install -g @hoangsonw/forge@${res.latestVersion}`,
        );
      }
    } catch (e) {
      err(`Update failed: ${String(e)}`);
      info('Falling back to npm: npm install -g @hoangsonw/forge@' + res.latestVersion);
    }
  });

updateCommand
  .command('ignore <version>')
  .description('Hide notifications for a specific version.')
  .action((version: string) => {
    bootstrap();
    ignoreVersion(version);
    ok(`Ignoring ${version} in future checks.`);
  });
