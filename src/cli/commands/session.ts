/**
 * Session management commands: list, replay, fork.
 * - list: shows all sessions for the current project.
 * - replay: replays a session (prints events in order).
 * - fork: forks a task (and its most recent session) into a new branch to explore alternatives.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { findProjectRoot } from '../../config/loader';
import { ensureProjectDir } from '../../config/paths';
import { loadSession } from '../../persistence/sessions';
import { err, info, ok } from '../ui';
import { bootstrap } from '../bootstrap';
import { forkTask } from '../../core/fork';

export const sessionCommand = new Command('session').description('Session management.');

sessionCommand
  .command('list')
  .description('List sessions in this project.')
  .action(() => {
    bootstrap();
    const root = findProjectRoot() ?? process.cwd();
    const sub = ensureProjectDir(root);
    if (!fs.existsSync(sub.sessions)) {
      info('No sessions.');
      return;
    }
    const files = fs.readdirSync(sub.sessions).filter((f) => f.endsWith('.jsonl'));
    if (!files.length) info('No sessions.');
    for (const f of files) {
      process.stdout.write(`  ${path.basename(f, '.jsonl')}\n`);
    }
  });

sessionCommand
  .command('replay <sessionId>')
  .description('Replay a session (prints events in order).')
  .action(async (sessionId: string) => {
    bootstrap();
    const root = findProjectRoot() ?? process.cwd();
    const entries = await loadSession(root, sessionId);
    if (!entries.length) {
      err(`Session ${sessionId} not found or empty.`);
      return;
    }
    for (const e of entries) {
      process.stdout.write(
        `[${e.timestamp}] ${e.type}${e.agent ? `/${e.agent}` : ''}: ${JSON.stringify(e.content).slice(0, 400)}\n`,
      );
    }
  });

sessionCommand
  .command('fork <taskId>')
  .description(
    'Fork a task (and its most recent session) into a new branch to explore alternatives.',
  )
  .action((taskId: string) => {
    bootstrap();
    const root = findProjectRoot() ?? process.cwd();
    try {
      const res = forkTask(root, taskId);
      ok(
        `Forked → ${res.newTaskId}${res.newSessionId ? ` (session ${res.newSessionId}, ${res.copiedSessionEntries} entries)` : ''}`,
      );
    } catch (e) {
      err(`fork failed: ${String(e)}`);
    }
  });
