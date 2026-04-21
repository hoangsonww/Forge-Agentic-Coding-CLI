/**
 * Task management commands.
 * - list: shows recent tasks, optionally filtered by project.
 * - search: search tasks by title or intent.
 * - delete: delete a task (file + index rows) with confirmation.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import prompts from 'prompts';
import {
  listTasks,
  searchTasks,
  getTask,
  TaskIndexRow,
  listProjects,
} from '../../persistence/index-db';
import { deleteTask } from '../../persistence/tasks';
import { tableOut, info, ok, err, warn, dim, accent } from '../ui';
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

taskCommand
  .command('delete <id>')
  .alias('rm')
  .description('Delete a task (JSON file + index row). Prompts for confirmation.')
  .option('-y, --yes', 'skip confirmation (for scripts/CI)', false)
  .action(async (id: string, opts: { yes?: boolean }) => {
    bootstrap();
    const row = getTask(id);
    if (!row) {
      err(`No task ${id} in the global index.`);
      return;
    }

    const projectRoot = resolveProjectRoot(row.project_id);
    if (!projectRoot) {
      warn(`Project ${row.project_id} not found locally — removing index row only.`);
    }

    process.stdout.write(
      '\n  ' +
        dim('task   ') +
        accent(row.id) +
        '\n  ' +
        dim('title  ') +
        (row.title || '(untitled)') +
        '\n  ' +
        dim('status ') +
        row.status +
        '\n  ' +
        dim('mode   ') +
        row.mode +
        '\n  ' +
        dim('proj   ') +
        (projectRoot ?? row.project_id) +
        '\n\n',
    );

    if (!opts.yes) {
      const resp = await prompts({
        type: 'confirm',
        name: 'go',
        message: `Delete task ${row.id}? This removes the task JSON and all index rows.`,
        initial: false,
      });
      if (!resp.go) {
        info('Cancelled.');
        return;
      }
    }

    try {
      const res = deleteTask(projectRoot ?? '', id);
      const bits: string[] = [];
      if (res.taskFile) bits.push('task JSON');
      if (res.indexRows.task) bits.push(`${res.indexRows.task} index row`);
      if (res.indexRows.sessions) bits.push(`${res.indexRows.sessions} session rows`);
      ok(`Deleted ${id}  (${bits.join(' · ') || 'no-op'})`);
    } catch (e) {
      err(`delete failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

const resolveProjectRoot = (projectId: string): string | null => {
  const p = listProjects().find((proj) => proj.id === projectId);
  return p ? p.path : null;
};

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
