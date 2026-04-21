/**
 * Commands for managing memory (cold and learning) for agents and models to use as context when making decisions. This includes indexing the current project for code search, pruning old memory, and applying decay to learning patterns.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import * as path from 'path';
import { bootstrap } from '../bootstrap';
import { findProjectRoot } from '../../config/loader';
import { indexProject, forgetProject, search } from '../../memory/cold';
import { decay, forgetAll as forgetLearning } from '../../memory/learning';
import { ok, info, tableOut, warn } from '../ui';

export const memoryCommand = new Command('memory').description('Memory management.');

memoryCommand
  .command('index')
  .description('Index the current project into cold memory (FTS5).')
  .action(() => {
    bootstrap();
    const root = findProjectRoot() ?? process.cwd();
    info(`Indexing ${root}…`);
    const stats = indexProject(root);
    ok(
      `Scanned ${stats.scanned}, indexed ${stats.indexed}, unchanged ${stats.unchanged}, removed ${stats.removed} (${stats.durationMs}ms).`,
    );
  });

memoryCommand
  .command('search <query>')
  .description('Search the cold index.')
  .option('-n, --limit <n>', 'limit', '10')
  .action((query: string, opts) => {
    bootstrap();
    const root = findProjectRoot() ?? process.cwd();
    const hits = search(root, query, Number(opts.limit));
    if (!hits.length) {
      info('No matches. (Did you `forge memory index`?)');
      return;
    }
    process.stdout.write(
      tableOut(
        ['path', 'score', 'snippet'],
        hits.map((h) => [h.path, h.score.toFixed(2), h.snippet.slice(0, 80).replace(/\s+/g, ' ')]),
      ) + '\n',
    );
  });

memoryCommand
  .command('prune')
  .description('Remove cold-memory docs for this project.')
  .action(() => {
    bootstrap();
    const root = findProjectRoot() ?? process.cwd();
    forgetProject(root);
    ok(`Pruned cold memory for ${path.basename(root)}.`);
  });

memoryCommand
  .command('decay')
  .description('Apply time-decay to learning memory.')
  .option('--days <n>', 'age threshold', '30')
  .option('--factor <f>', 'multiplicative factor', '0.95')
  .action((opts) => {
    bootstrap();
    const changed = decay(Number(opts.days), Number(opts.factor));
    ok(`Decayed ${changed} pattern(s).`);
  });

memoryCommand
  .command('clear-learning')
  .description('Delete ALL learning patterns (irreversible).')
  .option('--yes', 'skip confirmation', false)
  .action((opts) => {
    bootstrap();
    if (!opts.yes) {
      warn('Refusing without --yes.');
      return;
    }
    const removed = forgetLearning();
    ok(`Removed ${removed} learning pattern(s).`);
  });
