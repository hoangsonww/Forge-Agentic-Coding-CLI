/**
 * Show the CHANGELOG.md shipped with this Forge install. This is useful for users to quickly see what's new without having to navigate to the GitHub releases page. By default, it shows the first 200 lines of the changelog, but users can adjust this with the `--limit` option if they want to see more or less of the changelog content.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { bootstrap } from '../bootstrap';
import { info } from '../ui';

export const changelogCommand = new Command('changelog')
  .description('Show the CHANGELOG.md shipped with this Forge install.')
  .option('-n, --limit <n>', 'number of lines to show', '200')
  .action((opts) => {
    bootstrap();
    const candidates = [
      path.resolve(__dirname, '..', '..', '..', 'CHANGELOG.md'),
      path.resolve(process.cwd(), 'CHANGELOG.md'),
    ];
    const fp = candidates.find((c) => fs.existsSync(c));
    if (!fp) {
      info('CHANGELOG.md not found.');
      return;
    }
    const raw = fs.readFileSync(fp, 'utf8');
    const lines = raw.split('\n').slice(0, Number(opts.limit));
    process.stdout.write(lines.join('\n') + '\n');
  });
