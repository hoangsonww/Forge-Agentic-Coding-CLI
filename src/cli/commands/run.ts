/**
 * Run an agentic task from a natural-language prompt, with optional modes and permissions.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { Mode } from '../../types';
import { orchestrateRun } from '../../core/orchestrator';
import { PermissionFlags } from '../../permissions/manager';
import {
  ok,
  err,
  info,
  accent,
  banner,
  divider,
  rocket,
  completionSummary,
  failure,
  revealLines,
  breadcrumbs,
  typeWriter,
  readyFlourish,
} from '../ui';
import chalk from 'chalk';
import { bootstrap } from '../bootstrap';
import { startProgress } from '../progress';

const runOptions = (cmd: Command) =>
  cmd
    .option('--mode <mode>', 'mode (fast|balanced|heavy|plan|audit|debug|architect|offline-safe)')
    .option('--yes', 'auto-approve plan (skip confirmation)', false)
    .option('--plan-only', 'produce plan and stop (same as --mode plan)', false)
    .option('--skip-permissions', 'skip routine permission prompts (high-risk still asked)', false)
    .option('--allow-files', 'allow file writes for this session', false)
    .option('--allow-shell', 'allow shell commands for this session', false)
    .option('--allow-network', 'allow network tools for this session', false)
    .option('--allow-web', 'allow web search/fetch/browse', false)
    .option('--allow-mcp', 'allow MCP tool calls', false)
    .option('--strict', 'strict mode — confirm every action', false)
    .option('--non-interactive', 'deny any prompts silently', false)
    .option('--deterministic', 'fixed temperature for reproducible output', false)
    .option('--trace', 'emit full trace (implies --debug)', false)
    .option('--no-banner', 'omit the banner on launch', false);

export const runCommand = new Command('run')
  .description('Run an agentic task from a natural-language prompt.')
  .argument('<prompt...>', 'the task description (wrap in quotes)')
  .allowUnknownOption(false);
runOptions(runCommand);
runCommand.action(async (promptParts: string[], opts) => {
  bootstrap();
  if (opts.trace) {
    const { setLevel } = await import('../../logging/logger');
    setLevel('debug');
    process.env.FORGE_LOG_STDOUT = '1';
  }
  const promptText = promptParts.join(' ').trim();
  if (!promptText) {
    err('No prompt supplied.');
    process.exitCode = 2;
    return;
  }
  if (opts.banner !== false && !opts.trace) await revealLines(banner(), 25);
  const mode: Mode = (opts.mode as Mode) ?? (opts.planOnly ? 'plan' : 'balanced');
  process.stdout.write(divider('launching') + '\n\n');
  info(`${rocket()}  mode=${accent(mode)}${opts.deterministic ? ' · deterministic' : ''}`);
  await typeWriter(
    `  ${chalk.dim('task:')} ${chalk.white(promptText.slice(0, 100))}${promptText.length > 100 ? '…' : ''}\n`,
    { perCharMs: 6, capMs: 600 },
  );
  process.stdout.write(
    '  ' + breadcrumbs(['classify', 'plan', 'approve', 'execute', 'verify'], 0) + '\n\n',
  );
  if (!opts.trace) await readyFlourish();
  if (opts.deterministic) process.env.FORGE_DETERMINISTIC = '1';
  const flags: PermissionFlags = {
    skipRoutine: Boolean(opts.skipPermissions),
    allowFiles: Boolean(opts.allowFiles),
    allowShell: Boolean(opts.allowShell),
    allowNetwork: Boolean(opts.allowNetwork),
    allowWeb: Boolean(opts.allowWeb),
    allowMcp: Boolean(opts.allowMcp),
    strict: Boolean(opts.strict),
    nonInteractive: Boolean(opts.nonInteractive),
  };

  const progress = opts.trace ? null : startProgress({ initial: 'classifying request' });
  let result;
  try {
    result = await orchestrateRun({
      input: promptText,
      mode,
      autoApprove: Boolean(opts.yes),
      planOnly: Boolean(opts.planOnly) || mode === 'plan',
      flags,
    });
  } finally {
    progress?.stop();
  }

  if (result.result.success) {
    process.stdout.write(
      '\n' +
        completionSummary(
          result.result.summary,
          result.result.filesChanged,
          result.result.durationMs,
          result.result.costUsd,
          progress?.didStream() === true,
        ),
    );
    ok(`Task complete.`);
  } else {
    process.stdout.write(
      '\n' +
        failure('Task failed', [
          result.result.summary.slice(0, 40),
          'see forge session list for replay',
        ]) +
        '\n',
    );
    process.exitCode = 1;
  }
});

export const planCommand = new Command('plan')
  .description('Produce a plan without executing it.')
  .argument('<prompt...>', 'the task description');
runOptions(planCommand);
planCommand.action(async (promptParts: string[], opts) => {
  bootstrap();
  const promptText = promptParts.join(' ').trim();
  if (opts.banner !== false) process.stdout.write(banner());
  process.stdout.write(divider('planning') + '\n\n');
  const flags: PermissionFlags = {
    skipRoutine: Boolean(opts.skipPermissions),
    strict: Boolean(opts.strict),
    nonInteractive: Boolean(opts.nonInteractive),
  };
  await orchestrateRun({ input: promptText, mode: 'plan', planOnly: true, flags });
});

export const executeCommand = new Command('execute')
  .description('Execute an approved plan (currently: re-runs prompt with auto-approve).')
  .argument('<prompt...>', 'task description');
runOptions(executeCommand);
executeCommand.action(async (promptParts: string[], opts) => {
  bootstrap();
  if (opts.banner !== false) process.stdout.write(banner());
  process.stdout.write(divider('executing') + '\n\n');
  const flags: PermissionFlags = {
    skipRoutine: Boolean(opts.skipPermissions),
    allowFiles: Boolean(opts.allowFiles),
    allowShell: Boolean(opts.allowShell),
    allowNetwork: Boolean(opts.allowNetwork),
    strict: Boolean(opts.strict),
    nonInteractive: Boolean(opts.nonInteractive),
  };
  const result = await orchestrateRun({
    input: promptParts.join(' '),
    mode: (opts.mode as Mode) ?? 'execute',
    autoApprove: true,
    flags,
  });
  if (!result.result.success) process.exitCode = 1;
});
