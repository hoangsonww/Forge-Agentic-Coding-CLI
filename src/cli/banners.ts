import chalk from 'chalk';

/**
 * Visual kit for Forge's interactive output: the boxed brand banner, bar
 * separators, status boxes, and a set of decorative ASCII glyphs used across
 * commands. All helpers return strings so callers compose them freely.
 */

const PALETTE = {
  cyan: [94, 234, 212] as [number, number, number],
  teal: [20, 184, 166] as [number, number, number],
  blue: [56, 189, 248] as [number, number, number],
  violet: [167, 139, 250] as [number, number, number],
  pink: [244, 114, 182] as [number, number, number],
  amber: [251, 191, 36] as [number, number, number],
  green: [34, 197, 94] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  muted: [138, 153, 166] as [number, number, number],
  dim: [82, 94, 105] as [number, number, number],
};

const lerp = (a: number, b: number, t: number): number => Math.round(a + (b - a) * t);

const gradientText = (
  text: string,
  from: [number, number, number],
  to: [number, number, number],
): string => {
  let out = '';
  const visible = Array.from(text);
  const n = Math.max(1, visible.length - 1);
  visible.forEach((ch, i) => {
    const t = i / n;
    out += chalk.rgb(lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t))(ch);
  });
  return out;
};

const gradientLines = (
  lines: string[],
  from: [number, number, number],
  to: [number, number, number],
): string[] => {
  const n = Math.max(1, lines.length - 1);
  return lines.map((line, i) => {
    const t = i / n;
    const mid: [number, number, number] = [
      lerp(from[0], to[0], t),
      lerp(from[1], to[1], t),
      lerp(from[2], to[2], t),
    ];
    return gradientText(line, mid, [
      lerp(mid[0], to[0], 0.4),
      lerp(mid[1], to[1], 0.4),
      lerp(mid[2], to[2], 0.4),
    ]);
  });
};

/** The primary brand banner. Matches the ASCII the user requested exactly. */
export const banner = (): string => {
  const art = [
    `.------------------------------.`,
    `| _____                        |`,
    `||  ___|___   _ __  __ _   ___ |`,
    `|| |_  / _ \\ | '__|/ _\` | / _ \\|`,
    `||  _|| (_) || |  | (_| ||  __/|`,
    `||_|   \\___/ |_|   \\__, | \\___||`,
    `|                  |___/       |`,
    `'------------------------------'`,
  ];
  const coloured = gradientLines(art, PALETTE.cyan, PALETTE.violet).join('\n');
  const tagline = chalk.rgb(...PALETTE.muted)('    local-first · multi-agent · programmable');
  const subtitle = chalk
    .rgb(...PALETTE.pink)
    .italic('    forge — software engineering as a runtime');
  return `\n${coloured}\n${subtitle}\n${tagline}\n`;
};

/** Welcome hero used by `forge init` and a blank `forge`. */
export const welcome = (version: string): string => {
  const left = chalk.rgb(...PALETTE.cyan)('⟡');
  const right = chalk.rgb(...PALETTE.pink)('⟡');
  const v = chalk.rgb(...PALETTE.muted)(`v${version}`);
  const header = `${banner()}${' '.repeat(6)}${left} ${chalk.bold('Welcome to Forge')} ${right}  ${v}\n`;
  const hint =
    chalk.rgb(...PALETTE.muted)('    try: ') +
    chalk.bold.rgb(...PALETTE.cyan)('forge run ') +
    chalk.rgb(...PALETTE.amber)('"add a /health endpoint"') +
    chalk.rgb(...PALETTE.muted)('   ·   ') +
    chalk.bold.rgb(...PALETTE.cyan)('forge ui start') +
    '\n';
  return header + hint;
};

/** Heavy divider with gradient and optional title. */
export const divider = (title?: string): string => {
  const cols = process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : 80;
  const width = Math.max(8, Math.min(60, cols - 2));
  const bar = '━'.repeat(width);
  if (!title) return gradientText(bar, PALETTE.cyan, PALETTE.violet);
  const decoration = gradientText('━━━', PALETTE.cyan, PALETTE.violet);
  const label = chalk.bold.rgb(...PALETTE.cyan)(` ${title.toUpperCase()} `);
  const remain = Math.max(0, width - title.length - 8);
  const tail = gradientText('━'.repeat(remain), PALETTE.violet, PALETTE.pink);
  return `${decoration}${label}${tail}`;
};

/** Section header with glyph. */
export const section = (title: string, glyph = '◆'): string => {
  return `\n${chalk.rgb(...PALETTE.cyan)(glyph)}  ${chalk.bold(title)}\n`;
};

/** Big celebratory success frame. */
export const success = (title: string, body?: string[]): string => {
  const lines = [
    chalk.green('   ╭──────────────────────────────────────────────╮'),
    chalk.green('   │   ') + chalk.bold.green('✔  ' + title.padEnd(40)) + chalk.green('  │'),
    ...(body ?? []).map(
      (b) => chalk.green('   │   ') + chalk.dim(b.padEnd(40)) + chalk.green('  │'),
    ),
    chalk.green('   ╰──────────────────────────────────────────────╯'),
  ];
  return lines.join('\n');
};

/** Bold failure frame. */
export const failure = (title: string, body?: string[]): string => {
  const lines = [
    chalk.red('   ╭──────────────────────────────────────────────╮'),
    chalk.red('   │   ') + chalk.bold.red('✖  ' + title.padEnd(40)) + chalk.red('  │'),
    ...(body ?? []).map((b) => chalk.red('   │   ') + chalk.dim(b.padEnd(40)) + chalk.red('  │')),
    chalk.red('   ╰──────────────────────────────────────────────╯'),
  ];
  return lines.join('\n');
};

/** Attention frame. */
export const attention = (title: string, body?: string[]): string => {
  const lines = [
    chalk.yellow('   ╭──────────────────────────────────────────────╮'),
    chalk.yellow('   │   ') + chalk.bold.yellow('⚠  ' + title.padEnd(40)) + chalk.yellow('  │'),
    ...(body ?? []).map(
      (b) => chalk.yellow('   │   ') + chalk.dim(b.padEnd(40)) + chalk.yellow('  │'),
    ),
    chalk.yellow('   ╰──────────────────────────────────────────────╯'),
  ];
  return lines.join('\n');
};

/** Small sparkles for completion summaries. */
export const sparkles = (): string =>
  chalk.rgb(...PALETTE.amber)('✦') +
  chalk.rgb(...PALETTE.pink)('✧') +
  chalk.rgb(...PALETTE.cyan)('✦') +
  chalk.rgb(...PALETTE.violet)('✧');

/** Tiny animated-looking rocket for "launching" moments. */
export const rocket = (): string =>
  `${chalk.rgb(...PALETTE.amber)('◢')}${chalk.rgb(...PALETTE.pink)('▬')}${chalk.rgb(...PALETTE.violet)('▬')}${chalk.rgb(...PALETTE.cyan)('▶')}`;

/** Step badge used in run/plan output: ╭─ 01 ─╮ style. */
export const stepBadge = (index: number, total: number): string => {
  const n = String(index).padStart(2, '0');
  const t = chalk.rgb(...PALETTE.muted)(`/${String(total).padStart(2, '0')}`);
  return `${chalk.rgb(...PALETTE.cyan)('▸')} ${chalk.bold.rgb(...PALETTE.violet)(n)}${t}`;
};

/** Colored provider / status pill. */
export const pill = (
  label: string,
  value: string,
  tone: 'ok' | 'warn' | 'err' | 'neutral' = 'neutral',
): string => {
  const tones: Record<string, (s: string) => string> = {
    ok: chalk.bgRgb(...PALETTE.green).black,
    warn: chalk.bgRgb(...PALETTE.amber).black,
    err: chalk.bgRgb(...PALETTE.red).white,
    neutral: chalk.bgRgb(...PALETTE.dim).white,
  };
  return `${chalk.rgb(...PALETTE.muted)(label)}${tones[tone](` ${value} `)}`;
};

/** Compact KV line with aligned keys. */
export const kv = (key: string, value: string, keyWidth = 16): string =>
  `  ${chalk.rgb(...PALETTE.muted)(key.padEnd(keyWidth))}${chalk.white(value)}`;

/** Colored severity tag, e.g., [info] [warning] [error]. */
export const tag = (severity: 'info' | 'warning' | 'error' | 'critical'): string => {
  const map: Record<string, [number, number, number]> = {
    info: PALETTE.cyan,
    warning: PALETTE.amber,
    error: PALETTE.red,
    critical: PALETTE.red,
  };
  const [r, g, b] = map[severity];
  return chalk.rgb(r, g, b).bold(`[${severity}]`);
};

/** Completion summary, used by `run` at the end of a task. */
export const completionSummary = (
  title: string,
  filesChanged: string[],
  durationMs: number,
  cost?: number,
): string => {
  const lines = [
    divider('done'),
    '',
    `  ${sparkles()} ${chalk.bold(title)}`,
    '',
    kv('duration', chalk.rgb(...PALETTE.cyan)(`${(durationMs / 1000).toFixed(1)}s`)),
    kv(
      'files changed',
      filesChanged.length
        ? chalk.rgb(...PALETTE.amber)(String(filesChanged.length))
        : chalk.dim('0'),
    ),
  ];
  if (cost !== undefined && cost > 0) {
    lines.push(kv('model cost', chalk.rgb(...PALETTE.pink)(`$${cost.toFixed(4)}`)));
  }
  if (filesChanged.length) {
    lines.push('');
    lines.push(chalk.rgb(...PALETTE.muted)('  files:'));
    for (const f of filesChanged.slice(0, 12)) {
      lines.push(`    ${chalk.rgb(...PALETTE.teal)('▸')} ${chalk.white(f)}`);
    }
    if (filesChanged.length > 12) {
      lines.push(chalk.rgb(...PALETTE.muted)(`    …and ${filesChanged.length - 12} more`));
    }
  }
  lines.push('');
  return lines.join('\n');
};

export { PALETTE };
