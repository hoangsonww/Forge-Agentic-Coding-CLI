/**
 * UI utilities for the CLI, including:
 *   • logo and welcome banner generation
 *   • styled console output (info, warning, error, key-value pairs)
 *   • table generation for structured data display
 *   • spinners and progress indicators for long-running operations
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import chalk from 'chalk';
import ora, { Ora } from 'ora';
import Table from 'cli-table3';
import { banner, welcome, PALETTE } from './banners';

export const logo = (): string => banner();
export const helloBanner = (version: string): string => welcome(version);

export const spinner = (text: string): Ora =>
  ora({
    text,
    color: 'cyan',
    spinner: {
      interval: 80,
      frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    },
  });

export const tableOut = (head: string[], rows: Array<Array<string | number>>): string => {
  const t = new Table({
    head: head.map((h) => chalk.bold.rgb(...PALETTE.cyan)(h.toUpperCase())),
    style: { head: [], border: ['grey'] },
    chars: {
      top: '─',
      'top-mid': '┬',
      'top-left': '╭',
      'top-right': '╮',
      bottom: '─',
      'bottom-mid': '┴',
      'bottom-left': '╰',
      'bottom-right': '╯',
      left: '│',
      'left-mid': '├',
      mid: '─',
      'mid-mid': '┼',
      right: '│',
      'right-mid': '┤',
      middle: '│',
    },
  });
  for (const r of rows) t.push(r as any);
  return t.toString();
};

export const ok = (msg: string): void => {
  process.stdout.write(chalk.bold.rgb(...PALETTE.green)('✔ ') + chalk.white(msg) + '\n');
};
export const info = (msg: string): void => {
  process.stdout.write(chalk.rgb(...PALETTE.cyan)('ℹ ') + chalk.white(msg) + '\n');
};
export const warn = (msg: string): void => {
  process.stderr.write(chalk.rgb(...PALETTE.amber)('⚠ ') + chalk.white(msg) + '\n');
};
export const err = (msg: string): void => {
  process.stderr.write(chalk.bold.rgb(...PALETTE.red)('✖ ') + chalk.white(msg) + '\n');
};
export const dim = (msg: string): string => chalk.rgb(...PALETTE.muted)(msg);
export const accent = (msg: string): string => chalk.rgb(...PALETTE.cyan)(msg);
export const highlight = (msg: string): string => chalk.bold.rgb(...PALETTE.pink)(msg);
export const kv = (k: string, v: string | number | boolean): string =>
  `  ${chalk.rgb(...PALETTE.muted)(k.padEnd(16))} ${chalk.white(String(v))}`;

/** Inline progress indicator used between major phases. */
export const phase = (name: string): void => {
  process.stdout.write(chalk.rgb(...PALETTE.violet)('  ▸ ') + chalk.bold(name) + '\n');
};

export { banner, welcome, PALETTE } from './banners';
export {
  divider,
  section,
  success,
  failure,
  attention,
  sparkles,
  rocket,
  stepBadge,
  pill,
  tag,
  completionSummary,
} from './banners';
export {
  revealLines,
  typeWriter,
  pending,
  progressBar,
  multilineSpinner,
  readyFlourish,
  breadcrumbs,
  pulse,
  isAnimEnabled,
} from './animations';
