/**
 * Bundle command for creating and installing offline bundles of Forge. This is useful for air-gapped environments where direct access to the internet is not available. The `create` subcommand generates a tarball containing all necessary files for Forge, while the `install` subcommand extracts a given tarball to a specified location, allowing users to set up Forge without needing to download dependencies at install time.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { bootstrap } from '../bootstrap';
import { ok, err, info } from '../ui';

export const bundleCommand = new Command('bundle').description(
  'Offline bundle (air-gapped install).',
);

bundleCommand
  .command('create')
  .description('Create a Forge bundle tarball.')
  .option('--output <path>', 'destination directory', path.join(os.tmpdir(), 'forge-bundle'))
  .action((opts) => {
    bootstrap();
    const outDir = opts.output as string;
    fs.mkdirSync(outDir, { recursive: true });
    const script = path.join(__dirname, '..', '..', '..', 'scripts', 'bundle.js');
    const res = spawnSync(process.execPath, [script, outDir], { stdio: 'inherit' });
    if (res.status !== 0) {
      err('Bundle creation failed.');
      return;
    }
    ok(`Bundle written to ${outDir}/forge-bundle.tar.gz`);
  });

bundleCommand
  .command('install <bundle>')
  .description('Install a Forge bundle tarball.')
  .option('--prefix <path>', 'install prefix', path.join(os.homedir(), '.forge', 'bundle'))
  .action((bundle: string, opts) => {
    bootstrap();
    if (!fs.existsSync(bundle)) {
      err(`Bundle not found: ${bundle}`);
      return;
    }
    const prefix = opts.prefix as string;
    fs.mkdirSync(prefix, { recursive: true });
    const res = spawnSync('tar', ['-xzf', bundle, '-C', prefix], { stdio: 'inherit' });
    if (res.status !== 0) {
      err('Bundle extraction failed.');
      return;
    }
    info(`Bundle installed at ${prefix}. Add \`${prefix}/bin\` to your PATH if not already.`);
  });
