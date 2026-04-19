#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { banner, welcome } from './ui';
import { initCommand } from './commands/init';
import { runCommand, planCommand, executeCommand } from './commands/run';
import { statusCommand } from './commands/status';
import { taskCommand } from './commands/task';
import { sessionCommand } from './commands/session';
import { modelCommand } from './commands/model';
import { mcpCommand } from './commands/mcp';
import { skillsCommand, agentsCommand } from './commands/skills';
import { configCommand } from './commands/config';
import { doctorCommand } from './commands/doctor';
import { updateCommand } from './commands/update';
import { daemonCommand } from './commands/daemon';
import { permissionsCommand } from './commands/permissions';
import { uiCommand } from './commands/ui';
import { bundleCommand } from './commands/bundle';
import { containerCommand } from './commands/container';
import { migrateCommand } from './commands/migrate';
import { memoryCommand } from './commands/memory';
import { webCommand } from './commands/web';
import { specCommand } from './commands/spec';
import { resumeCommand } from './commands/resume';
import { changelogCommand } from './commands/changelog';
import { devCommand } from './commands/dev';
import { costCommand } from './commands/cost';
import { log, setLevel } from '../logging/logger';
import { applyBrandedHelp } from './help';
import * as pkg from '../../package.json';

const program = new Command();

program
  .name('forge')
  .description('Forge — local-first agentic coding runtime')
  .version(pkg.version ?? '0.1.0')
  .option('--debug', 'enable debug logging', false)
  .option(
    '--no-repl',
    'on bare invocation, print splash and exit instead of opening the REPL',
    false,
  )
  .hook('preAction', (thisCmd) => {
    const opts = thisCmd.opts();
    if (opts.debug) setLevel('debug');
  });

program.addCommand(initCommand);
program.addCommand(runCommand);
program.addCommand(planCommand);
program.addCommand(executeCommand);
program.addCommand(statusCommand);
program.addCommand(taskCommand);
program.addCommand(sessionCommand);
program.addCommand(modelCommand);
program.addCommand(mcpCommand);
program.addCommand(skillsCommand);
program.addCommand(agentsCommand);
program.addCommand(configCommand);
program.addCommand(doctorCommand);
program.addCommand(updateCommand);
program.addCommand(daemonCommand);
program.addCommand(permissionsCommand);
program.addCommand(uiCommand);
program.addCommand(bundleCommand);
program.addCommand(containerCommand);
program.addCommand(migrateCommand);
program.addCommand(memoryCommand);
program.addCommand(webCommand);
program.addCommand(specCommand);
program.addCommand(resumeCommand);
program.addCommand(changelogCommand);
program.addCommand(devCommand);
program.addCommand(costCommand);

// Explicit REPL subcommand: `forge repl` (works even when stdin isn't a TTY
// for developers who know what they're asking for, and useful as a stable
// entry point for integrations).
program
  .command('repl')
  .description('Open the interactive Forge shell (multi-turn conversation).')
  .option('--resume <sessionId>', 'resume an existing REPL session by id', undefined)
  .option('--no-banner', 'skip the opening splash', false)
  .action(async (opts: { resume?: string; banner: boolean }) => {
    if (opts.banner !== false) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { revealLines } = require('./animations');
      await revealLines(welcome(pkg.version ?? '0.1.0'), 30);
    }
    const { startRepl } = await import('./repl');
    await startRepl(program, { resumeSessionId: opts.resume });
  });

applyBrandedHelp(program, pkg.version ?? '0.1.0');

const main = async (): Promise<void> => {
  const hasArgs = process.argv.length > 2;
  const wantsNoRepl =
    process.argv.includes('--no-repl') ||
    process.env.FORGE_NO_REPL === '1' ||
    process.env.FORGE_NO_REPL === 'true';
  const isTty = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (!hasArgs || (process.argv.length === 3 && process.argv[2] === '--no-repl')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { revealLines, typeWriter } = require('./animations');
    await revealLines(welcome(pkg.version ?? '0.1.0'), 30);

    if (!wantsNoRepl && isTty) {
      const { startRepl } = await import('./repl');
      await startRepl(program);
      return;
    }

    // non-TTY or explicitly disabled → print the hint and leave cleanly
    await typeWriter(
      chalk.dim('    run ') + chalk.bold('forge help') + chalk.dim(' for the command surface\n\n'),
      { perCharMs: 10, capMs: 600 },
    );
    return;
  }
  if (process.argv[2] === 'help' && process.argv.length === 3) {
    process.stdout.write(banner());
  }
  await program.parseAsync(process.argv);
};

main().catch((err) => {
  log.error('cli crashed', { err: String(err) });
  process.stderr.write(`\nError: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
