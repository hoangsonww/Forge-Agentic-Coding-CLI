/**
 * Task management commands.
 * - list: shows recent tasks, optionally filtered by project.
 * - search: search tasks by title or intent.
 * - (future) delete: delete a task and all its sessions (with confirmation).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { listTasks, searchTasks, TaskIndexRow } from '../../persistence/index-db';
import { tableOut, info } from '../ui';
import { bootstrap } from '../bootstrap';

export const taskCommand = new Command('task').description('Task management.');

taskCommand
  .command('list')
  .description('List recent tasks.')
  .option('-n, --limit <n>', 'limit', '20')
  .option('-p, --project <id>', 'filter by project id')
  .action((opts) => {
    bootstrap();
    const rows = listTasks(opts.project, Number(opts.limit));
    printRows(rows);
  });

taskCommand
  .command('search <query>')
  .description('Search tasks by title or intent.')
  .action((query: string) => {
    bootstrap();
    const rows = searchTasks(query);
    printRows(rows);
  });

const printRows = (rows: TaskIndexRow[]): void => {
  if (!rows.length) {
    info('No tasks found.');
    return;
  }
  process.stdout.write(
    tableOut(
      ['id', 'status', 'mode', 'intent', 'risk', 'title', 'updated'],
      rows.map((t) => [
        t.id,
        t.status,
        t.mode,
        t.intent ?? '—',
        t.risk ?? '—',
        (t.title || '').slice(0, 48),
        t.updated_at,
      ]),
    ) + '\n',
  );
};
