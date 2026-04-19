import { Command } from 'commander';
import prompts from 'prompts';
import { bootstrap } from '../bootstrap';
import { findProjectRoot } from '../../config/loader';
import { loadTask, transitionTask } from '../../persistence/tasks';
import { listRecentTasks, mostRecent } from '../../core/continuity';
import { runAgenticLoop } from '../../core/loop';
import { ok, info, err, warn } from '../ui';

export const resumeCommand = new Command('resume')
  .description('Resume any prior task in this project (not just incomplete).')
  .argument('[taskId]', 'task id (omit for an interactive picker of recent tasks)')
  .option('--yes', 'auto-approve plan', false)
  .option('--latest', 'skip the picker and resume the most recent task', false)
  .option('--skip-permissions', 'skip routine prompts', false)
  .action(async (taskId: string | undefined, opts) => {
    bootstrap();
    const root = findProjectRoot() ?? process.cwd();

    let target = taskId ? loadTask(root, taskId) : null;

    if (!target && opts.latest) {
      target = mostRecent(root);
    }

    if (!target && !taskId) {
      // Interactive picker across ALL tasks (any status).
      const recent = listRecentTasks(root, 25);
      if (!recent.length) {
        warn('No prior tasks in this project.');
        return;
      }
      const resp = await prompts({
        type: 'select',
        name: 'id',
        message: 'Which task do you want to resume?',
        choices: recent.map((t) => ({
          title: `${t.id.slice(0, 12)}  [${t.status}]  ${t.mode}  ·  ${(t.title ?? '').slice(0, 80)}`,
          value: t.id,
          description: t.updatedAt,
        })),
        initial: 0,
      });
      if (!resp || !resp.id) {
        info('Cancelled.');
        return;
      }
      target = loadTask(root, resp.id as string);
    }

    if (!target) {
      err(`Task not found.${taskId ? ` (looked up: ${taskId})` : ''}`);
      return;
    }

    // Reset state so the machine permits re-entry. Completed + cancelled
    // tasks are legitimate resume targets too — the user may want to retry
    // or continue the thread. The agentic loop starts from `draft`, so we
    // park the task back there before calling it.
    try {
      if (target.status === 'running' || target.status === 'verifying') {
        target = transitionTask(root, target.id, 'failed');
      }
      if (
        target.status === 'failed' ||
        target.status === 'blocked' ||
        target.status === 'completed' ||
        target.status === 'cancelled'
      ) {
        target = transitionTask(root, target.id, 'draft');
      }
    } catch (e) {
      warn(`couldn't transition state: ${String(e)}`);
    }

    try {
      const res = await runAgenticLoop(target, {
        projectRoot: root,
        mode: target.mode,
        flags: { skipRoutine: Boolean(opts.skipPermissions) },
        autoApprove: Boolean(opts.yes),
      });
      if (res.result.success) ok(`Resumed and completed. ${res.result.summary}`);
      else err(`Resumed but failed: ${res.result.summary}`);
    } catch (e) {
      err(`resume failed: ${String(e)}`);
    }
  });
