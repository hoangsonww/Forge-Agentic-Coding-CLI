import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { PALETTE } from './banners';

/**
 * Interactive animation kit: banner reveal, typewriter output, progress bars,
 * pulsing spinners, and status ticks. Every helper respects NO_COLOR,
 * TTY absence, and a global `FORGE_NO_ANIM=1` escape hatch. Non-TTY callers
 * get instant, un-decorated output.
 */

const noAnim =
  !process.stdout.isTTY ||
  process.env.NO_COLOR === '1' ||
  process.env.FORGE_NO_ANIM === '1' ||
  process.env.CI === 'true';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Reveal lines top-down with a small delay. Good for the startup banner. */
export const revealLines = async (text: string, delayMs = 40): Promise<void> => {
  if (noAnim) {
    process.stdout.write(text + '\n');
    return;
  }
  const lines = text.split('\n');
  for (const line of lines) {
    process.stdout.write(line + '\n');
    if (line.trim().length) await sleep(delayMs);
  }
};

/** Type out a string character-by-character. Caps total time so long strings don't drag. */
export const typeWriter = async (
  text: string,
  opts: { perCharMs?: number; capMs?: number } = {},
): Promise<void> => {
  if (noAnim) {
    process.stdout.write(text);
    return;
  }
  const per = opts.perCharMs ?? 18;
  const cap = opts.capMs ?? 1_800;
  const total = text.length * per;
  const step = total > cap ? cap / Math.max(1, text.length) : per;
  for (const ch of text) {
    process.stdout.write(ch);
    await sleep(step);
  }
};

/** Animated ellipsis (".." "..." "....") while awaiting a promise. */
export const pending = async <T>(label: string, work: () => Promise<T>): Promise<T> => {
  if (noAnim) return work();
  const frames = ['·  ', '·· ', '···', ' ··', '  ·', '   '];
  let i = 0;
  const tag = chalk.rgb(...PALETTE.cyan)('▸') + ' ' + chalk.bold(label);
  const interval = setInterval(() => {
    process.stdout.write(`\r${tag} ${chalk.rgb(...PALETTE.muted)(frames[i++ % frames.length])} `);
  }, 120);
  try {
    const out = await work();
    clearInterval(interval);
    process.stdout.write(
      `\r${tag}  ${chalk.bold.rgb(...PALETTE.green)('✔')}                     \n`,
    );
    return out;
  } catch (err) {
    clearInterval(interval);
    process.stdout.write(`\r${tag}  ${chalk.bold.rgb(...PALETTE.red)('✖')}                     \n`);
    throw err;
  }
};

/** Bright progress bar, with gradient fill. */
export interface Bar {
  tick(increment?: number): void;
  update(current: number, message?: string): void;
  finish(message?: string): void;
}

export const progressBar = (total: number, label: string): Bar => {
  const width = 28;
  let current = 0;
  let lastMessage = '';

  const render = () => {
    if (noAnim) return;
    const pct = Math.min(1, current / Math.max(1, total));
    const filled = Math.floor(pct * width);
    const left = '█'.repeat(filled);
    const right = '░'.repeat(width - filled);
    const percent = `${Math.floor(pct * 100)}%`.padStart(4);
    const bar = chalk.rgb(...PALETTE.cyan)(left) + chalk.rgb(...PALETTE.dim)(right);
    const suffix = lastMessage ? chalk.dim(' · ' + lastMessage) : '';
    process.stdout.write(
      `\r  ${chalk.bold(label.padEnd(14))} ${bar} ${chalk.rgb(...PALETTE.violet)(percent)}${suffix}   `,
    );
  };

  render();
  return {
    tick(increment = 1) {
      current += increment;
      render();
    },
    update(c, message) {
      current = c;
      if (message !== undefined) lastMessage = message;
      render();
    },
    finish(message) {
      current = total;
      if (message) lastMessage = message;
      render();
      if (!noAnim) process.stdout.write('\n');
    },
  };
};

/** Multi-message spinner that rotates a hint underneath. */
export const multilineSpinner = (label: string, hints: string[]): Ora => {
  const s = ora({ text: `${label}`, color: 'cyan' });
  if (!noAnim && hints.length) {
    let i = 0;
    s.start();
    const interval = setInterval(() => {
      s.text = `${label} ${chalk.dim('· ' + hints[i++ % hints.length])}`;
    }, 1500);
    const origSucceed = s.succeed.bind(s);
    const origFail = s.fail.bind(s);
    const origStop = s.stop.bind(s);
    s.succeed = (t) => {
      clearInterval(interval);
      return origSucceed(t);
    };
    s.fail = (t) => {
      clearInterval(interval);
      return origFail(t);
    };
    s.stop = () => {
      clearInterval(interval);
      return origStop();
    };
  } else {
    s.start();
  }
  return s;
};

/** Short, punchy "ready" flourish. */
export const readyFlourish = async (): Promise<void> => {
  if (noAnim) return;
  const frames = ['▱▱▱▱▱', '▰▱▱▱▱', '▰▰▱▱▱', '▰▰▰▱▱', '▰▰▰▰▱', '▰▰▰▰▰'];
  for (const f of frames) {
    process.stdout.write(
      `\r  ${chalk.rgb(...PALETTE.cyan)('warming up')} ${chalk.rgb(...PALETTE.pink)(f)} `,
    );
    await sleep(80);
  }
  process.stdout.write(
    `\r  ${chalk.rgb(...PALETTE.green)('ready      ')} ${chalk.rgb(...PALETTE.green)('▰▰▰▰▰')}\n`,
  );
};

/** Compact breadcrumb: «phase ▸ phase ▸ phase». */
export const breadcrumbs = (stages: string[], currentIndex: number): string => {
  return stages
    .map((s, i) => {
      if (i < currentIndex) return chalk.rgb(...PALETTE.green)(`✓ ${s}`);
      if (i === currentIndex) return chalk.bold.rgb(...PALETTE.cyan)(`▸ ${s}`);
      return chalk.rgb(...PALETTE.muted)(`○ ${s}`);
    })
    .join(chalk.rgb(...PALETTE.muted)('  →  '));
};

/** Pulse-fade line, emitted as a single newline-terminated entry. */
export const pulse = async (text: string, times = 2): Promise<void> => {
  if (noAnim) {
    process.stdout.write(text + '\n');
    return;
  }
  for (let i = 0; i < times; i++) {
    process.stdout.write('\r' + chalk.dim(text));
    await sleep(220);
    process.stdout.write('\r' + chalk.bold(text));
    await sleep(220);
  }
  process.stdout.write('\n');
};

export const isAnimEnabled = (): boolean => !noAnim;
