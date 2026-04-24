/**
 * Interactive numbered-select prompt.
 *
 * Users can pick a choice by either:
 *   - Pressing the digit that matches the item (1, 2, 3, …) for instant pick.
 *   - Using ↑/↓ (or j/k) to highlight and Enter to confirm.
 *
 * Why not just use `prompts` select? `prompts` supports arrow-nav but has no
 * digit hotkey path, and we want the common case (3–4 choices) to be a
 * single keystroke. Raw-mode stdin gives us that without a new dep.
 *
 * Falls back to `prompts` when stdin/stdout isn't a TTY (CI, pipes), so
 * scripts and test harnesses continue to work unchanged.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import prompts from 'prompts';
import chalk from 'chalk';
import { PALETTE } from './banners';

export interface NumberedChoice<T = string> {
  title: string;
  value: T;
  /** Optional trailing hint shown in dim color next to the title. */
  hint?: string;
  /** Optional color override for the title. */
  color?: 'green' | 'red' | 'yellow' | 'cyan' | 'default';
}

export interface NumberedSelectOptions<T> {
  message: string;
  choices: NumberedChoice<T>[];
  /** Default-highlighted index (0-based). */
  initial?: number;
  /** Emitted under the prompt; defaults to "press 1–N or ↑↓ + Enter". */
  hint?: string;
}

const cyan = chalk.rgb(...PALETTE.cyan);
const dim = chalk.rgb(...PALETTE.muted);
const green = chalk.rgb(...PALETTE.green);

const colorFor = (c: NumberedChoice['color']): ((s: string) => string) => {
  switch (c) {
    case 'green':
      return chalk.green;
    case 'red':
      return chalk.red;
    case 'yellow':
      return chalk.yellow;
    case 'cyan':
      return cyan;
    default:
      return (s: string) => s;
  }
};

export const chooseNumbered = async <T>(opts: NumberedSelectOptions<T>): Promise<T | undefined> => {
  const n = opts.choices.length;
  if (n === 0) return undefined;
  if (n > 9) {
    // Digit shortcuts only cover 1–9. For longer lists, fall through to the
    // arrow-only experience via the `prompts` library (still usable, just no
    // hotkeys). In practice Forge never shows more than 4 options.
    const resp = await prompts({
      type: 'select',
      name: 'value',
      message: opts.message,
      choices: opts.choices.map((c) => ({
        title: c.hint ? `${c.title} ${dim(c.hint)}` : c.title,
        value: c.value,
      })),
      initial: opts.initial ?? 0,
    });
    return resp?.value as T | undefined;
  }

  const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!tty) {
    const resp = await prompts({
      type: 'select',
      name: 'value',
      message: opts.message,
      choices: opts.choices.map((c, i) => ({
        title: `${i + 1}. ${c.title}${c.hint ? ' ' + dim(c.hint) : ''}`,
        value: c.value,
      })),
      initial: opts.initial ?? 0,
    });
    return resp?.value as T | undefined;
  }

  return runRawSelect(opts);
};

const runRawSelect = <T>(opts: NumberedSelectOptions<T>): Promise<T | undefined> => {
  const choices = opts.choices;
  const n = choices.length;
  let idx = Math.max(0, Math.min(n - 1, opts.initial ?? 0));

  const out = process.stdout;
  // Number of lines we've painted since the prompt header; tracked so we
  // can clear exactly that many on each re-render / exit without nuking
  // unrelated terminal output above.
  let linesDrawn = 0;

  const hintText = opts.hint ?? `press ${cyan('1')}–${cyan(String(n))} or ${cyan('↑↓ Enter')}`;

  const hideCursor = (): void => {
    out.write('\x1b[?25l');
  };
  const showCursor = (): void => {
    out.write('\x1b[?25h');
  };

  const clear = (): void => {
    if (linesDrawn === 0) return;
    // Move cursor up `linesDrawn` lines, clear each one top-down.
    out.write(`\x1b[${linesDrawn}A`);
    for (let i = 0; i < linesDrawn; i++) {
      out.write('\x1b[2K'); // clear entire line
      if (i < linesDrawn - 1) out.write('\x1b[1B'); // move down
    }
    out.write(`\x1b[${linesDrawn - 1}A`); // back to top
    out.write('\r');
    linesDrawn = 0;
  };

  const render = (): void => {
    clear();
    const lines: string[] = [];
    lines.push(`${green('?')} ${chalk.bold(opts.message)}  ${dim(hintText)}`);
    for (let i = 0; i < n; i++) {
      const c = choices[i];
      const color = colorFor(c.color);
      const num = cyan(`${i + 1}.`);
      const title = color(c.title);
      const hint = c.hint ? ` ${dim(c.hint)}` : '';
      if (i === idx) {
        lines.push(`  ${cyan('▸')} ${num} ${chalk.bold(title)}${hint}`);
      } else {
        lines.push(`    ${num} ${title}${hint}`);
      }
    }
    out.write(lines.join('\n') + '\n');
    linesDrawn = lines.length;
  };

  return new Promise<T | undefined>((resolve) => {
    const stdin = process.stdin;
    let finished = false;

    const finish = (value: T | undefined, picked?: number): void => {
      if (finished) return;
      finished = true;
      stdin.removeListener('data', onData);
      // Do NOT reset raw mode or pause stdin here. When called from the
      // REPL (via task-approval / permission prompts), the line editor
      // owns stdin and expects raw mode + a resumed stream. If we toggle
      // those off, the next readline.emitKeypressEvents tick gets nothing
      // and the REPL silently dies (Node exits once stdin is paused and
      // no other handles keep the loop alive). Let the outer owner manage
      // global stdin state; we only unregister our own data listener.
      // Replace the prompt with a compact "answered" summary line so the
      // scrollback stays tidy.
      clear();
      if (picked != null && picked >= 0 && picked < n) {
        const c = choices[picked];
        const color = colorFor(c.color);
        out.write(`${green('✔')} ${chalk.bold(opts.message)}  ${color(c.title)}\n`);
      } else {
        out.write(`${dim('·')} ${chalk.bold(opts.message)}  ${dim('(cancelled)')}\n`);
      }
      showCursor();
      resolve(value);
    };

    const onData = (chunk: Buffer): void => {
      const key = chunk.toString('utf8');
      // digit 1..9
      if (/^[1-9]$/.test(key)) {
        const pick = parseInt(key, 10) - 1;
        if (pick < n) {
          finish(choices[pick].value, pick);
        }
        return;
      }
      // Enter
      if (key === '\r' || key === '\n') {
        finish(choices[idx].value, idx);
        return;
      }
      // Ctrl-C or Esc → cancel
      if (key === '\x03' || key === '\x1b') {
        finish(undefined);
        return;
      }
      // Arrow up / k
      if (key === '\x1b[A' || key === 'k') {
        idx = (idx - 1 + n) % n;
        render();
        return;
      }
      // Arrow down / j
      if (key === '\x1b[B' || key === 'j') {
        idx = (idx + 1) % n;
        render();
        return;
      }
      // Home / 'g'
      if (key === '\x1b[H' || key === 'g') {
        idx = 0;
        render();
        return;
      }
      // End / 'G'
      if (key === '\x1b[F' || key === 'G') {
        idx = n - 1;
        render();
        return;
      }
    };

    try {
      stdin.setRawMode(true);
    } catch {
      // Non-TTY fell through earlier but be defensive: if raw mode fails,
      // fall back to the prompts() path synchronously inside the Promise.
      resolve(undefined);
      return;
    }
    stdin.resume();
    stdin.on('data', onData);
    hideCursor();
    render();
  });
};
