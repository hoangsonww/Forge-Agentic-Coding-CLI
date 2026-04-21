/**
 * Branded help + error formatter for commander.
 *
 * Default commander help is a plain ASCII table. We replace it with a small
 * header, categorised command groups, and colored options so that `forge
 * --help` and `forge <cmd> --help` feel consistent with the rest of the CLI.
 *
 * Usage (in src/cli/index.ts):
 *
 *   import { applyBrandedHelp } from './help';
 *   applyBrandedHelp(program, pkg.version ?? '0.1.0');
 *
 * The formatter:
 *   • delegates option/argument line generation to commander's Help helper
 *   • groups commands by category using COMMAND_CATEGORIES below
 *   • highlights primary commands and shortcuts
 *   • writes errors with a red prefix, and routes help to stdout not stderr.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { Command, Help, Option } from 'commander';
import chalk from 'chalk';
import { PALETTE } from './banners';

const COMMAND_CATEGORIES: Record<string, string> = {
  init: 'Project',
  run: 'Agentic',
  plan: 'Agentic',
  execute: 'Agentic',
  resume: 'Agentic',
  spec: 'Agentic',
  task: 'Agentic',
  repl: 'Agentic',
  status: 'Runtime',
  doctor: 'Runtime',
  daemon: 'Runtime',
  ui: 'Runtime',
  cost: 'Runtime',
  session: 'Runtime',
  model: 'Models',
  models: 'Models',
  mcp: 'Integrations',
  skills: 'Integrations',
  agents: 'Integrations',
  web: 'Integrations',
  memory: 'Knowledge',
  config: 'Config',
  permissions: 'Config',
  bundle: 'Operations',
  container: 'Operations',
  migrate: 'Operations',
  update: 'Operations',
  changelog: 'Operations',
  dev: 'Operations',
  help: 'Help',
};

const CATEGORY_ORDER = [
  'Project',
  'Agentic',
  'Runtime',
  'Models',
  'Integrations',
  'Knowledge',
  'Config',
  'Operations',
  'Help',
];

const c = {
  title: chalk.bold.rgb(...PALETTE.teal),
  sub: chalk.rgb(...PALETTE.muted),
  key: chalk.bold.rgb(...PALETTE.teal),
  arg: chalk.rgb(...PALETTE.amber),
  opt: chalk.rgb(...PALETTE.cyan),
  dim: chalk.rgb(...PALETTE.muted),
  accent: chalk.rgb(...PALETTE.violet),
  err: chalk.bold.rgb(...PALETTE.red),
};

const headerFor = (cmd: Command, version: string): string => {
  const name = cmd.name() === 'forge' ? 'forge' : `forge ${cmd.name()}`;
  const isRoot = cmd.name() === 'forge' || cmd.parent === null || cmd.parent?.name() === 'forge';
  const tagline =
    isRoot && cmd.name() === 'forge'
      ? 'local-first agentic coding runtime'
      : cmd.description() || '';
  const lines = [
    '',
    '  ' + c.title(name) + c.sub(`  v${version}`),
    ...(tagline ? ['  ' + c.sub(tagline)] : []),
    '',
  ];
  return lines.join('\n');
};

const padRight = (s: string, width: number): string => {
  // eslint-disable-next-line no-control-regex -- strip ANSI CSI escape sequences
  const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
  const gap = Math.max(1, width - visible.length);
  return s + ' '.repeat(gap);
};

const buildHelper = (version: string): Help => {
  const helper = new Help();

  helper.formatHelp = (cmd, h) => {
    const pad = 26;
    const lines: string[] = [];
    lines.push(headerFor(cmd, version));

    // Usage
    const usage = h.commandUsage(cmd);
    lines.push(c.accent('Usage'));
    lines.push('  ' + c.dim(usage));
    lines.push('');

    // Arguments
    const args = cmd.registeredArguments ?? [];
    if (args.length) {
      lines.push(c.accent('Arguments'));
      for (const a of args) {
        const name = h.argumentTerm(a);
        const desc = h.argumentDescription(a);
        lines.push('  ' + padRight(c.arg(name), pad) + c.dim(desc));
      }
      lines.push('');
    }

    // Options
    const visibleOpts = h.visibleOptions(cmd) as Option[];
    if (visibleOpts.length) {
      lines.push(c.accent('Options'));
      for (const o of visibleOpts) {
        const term = h.optionTerm(o);
        const desc = h.optionDescription(o);
        lines.push('  ' + padRight(c.opt(term), pad) + c.dim(desc));
      }
      lines.push('');
    }

    // Subcommands grouped by category
    const cmds = h.visibleCommands(cmd);
    if (cmds.length) {
      const isRoot = cmd.name() === 'forge';
      if (isRoot) {
        const groups = new Map<string, Command[]>();
        for (const sub of cmds) {
          const cat = COMMAND_CATEGORIES[sub.name()] ?? 'Other';
          const arr = groups.get(cat) ?? [];
          arr.push(sub);
          groups.set(cat, arr);
        }
        lines.push(c.accent('Commands'));
        for (const cat of CATEGORY_ORDER) {
          const grp = groups.get(cat);
          if (!grp) continue;
          lines.push('  ' + c.sub(cat));
          for (const sub of grp) {
            const term = h.subcommandTerm(sub).replace(/\[options\]/g, '');
            const desc = h.subcommandDescription(sub);
            lines.push('    ' + padRight(c.key(term.trim()), pad - 2) + c.dim(desc));
          }
        }
        // Other (uncategorised)
        const other = groups.get('Other');
        if (other) {
          lines.push('  ' + c.sub('Other'));
          for (const sub of other) {
            const term = h.subcommandTerm(sub).replace(/\[options\]/g, '');
            const desc = h.subcommandDescription(sub);
            lines.push('    ' + padRight(c.key(term.trim()), pad - 2) + c.dim(desc));
          }
        }
      } else {
        lines.push(c.accent('Commands'));
        for (const sub of cmds) {
          const term = h.subcommandTerm(sub);
          const desc = h.subcommandDescription(sub);
          lines.push('  ' + padRight(c.key(term), pad) + c.dim(desc));
        }
      }
      lines.push('');
    }

    // Hint line
    if (cmd.name() === 'forge') {
      lines.push(
        '  ' +
          c.dim('tip: run ') +
          c.accent('forge') +
          c.dim(' (no args) on a TTY to drop into the interactive REPL.'),
      );
      lines.push('');
    }

    return lines.join('\n');
  };

  return helper;
};

export const applyBrandedHelp = (program: Command, version: string): void => {
  program.configureHelp({} as never); // reset any prior customisation
  (program as Command & { _helpInstance?: Help })._helpInstance = buildHelper(version);
  // commander 12 exposes .createHelp — return our tuned instance for every cmd
  program.createHelp = () => buildHelper(version);
  for (const sub of program.commands) {
    sub.createHelp = () => buildHelper(version);
  }

  program.configureOutput({
    writeOut: (s) => process.stdout.write(s),
    writeErr: (s) => {
      if (s.startsWith('error:')) {
        process.stderr.write(c.err('✖ ') + chalk.white(s.replace(/^error:\s*/, '')));
        return;
      }
      process.stderr.write(s);
    },
    outputError: (s, write) => {
      const msg = s.replace(/^error:\s*/, '');
      write(c.err('✖ ') + chalk.white(msg) + '\n');
    },
  });

  program.showHelpAfterError(
    c.dim('  (run ') + c.accent('forge help') + c.dim(' for the command surface)'),
  );
};
