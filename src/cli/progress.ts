/**
 * Shared progress display for any CLI surface that drives `orchestrateRun`
 * (the `forge run` one-shot, the REPL turn loop). Subscribes to the
 * in-process event bus and reflects loop phases + streaming model output on
 * a single spinner line so the terminal never looks frozen.
 *
 * Behavior:
 *  - Spinner text tracks the current phase (classify → plan → approve →
 *    execute → verify) via TASK_* events.
 *  - On `TASK_PLANNED`, the spinner pauses so the approval prompt can render
 *    cleanly. It resumes on `TASK_APPROVED`.
 *  - Streaming model deltas print inline under the spinner in a dimmed
 *    "thinking" rail; the spinner remains visible below them. The rail is
 *    cleared between phases.
 *
 * Keep this module framework-free — it's imported by repl.ts on every turn
 * and by run.ts once per invocation.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import chalk from 'chalk';
import { spinner as makeSpinner } from './ui';
import { PALETTE } from './banners';
import { renderMarkdown } from './markdown';
import { eventBus, ModelDeltaEvent } from '../persistence/events';
import type { ForgeEvent } from '../types';
import type { Ora } from 'ora';

export interface ProgressHandle {
  stop(): void;
  /** Pause the spinner without unsubscribing — used to surface a prompt. */
  pause(): void;
  resume(text?: string): void;
  /**
   * True iff at least one streaming model delta was rendered. Callers use
   * this to decide whether the completion summary should repeat the task
   * result text (no — already on screen) or just show metadata.
   */
  didStream(): boolean;
}

const phaseText = (e: ForgeEvent): string | null => {
  switch (e.type) {
    case 'TASK_CREATED':
      return 'classifying request';
    case 'TASK_CLASSIFIED':
      return 'planning';
    case 'TASK_PLANNED':
      return 'plan ready';
    case 'TASK_APPROVED':
      return 'executing';
    case 'TASK_SCHEDULED':
      return 'scheduling';
    case 'TASK_STARTED':
      return 'running';
    case 'TASK_STEP_STARTED':
      return e.message.replace(/^→\s*/, '');
    case 'TASK_STEP_COMPLETED':
      return 'step complete';
    case 'TASK_VERIFYING':
      return 'verifying';
    case 'MODEL_WARMING': {
      const p = (e.payload as { provider?: string; model?: string } | undefined) ?? {};
      return p.model
        ? `warming ${p.model} · loading into memory (first call, ~30–60s)`
        : 'warming model · loading into memory (first call)';
    }
    case 'MODEL_WARMED': {
      const p = (e.payload as { model?: string; durationMs?: number } | undefined) ?? {};
      if (p.durationMs != null && p.model) {
        return `warmed ${p.model} in ${(p.durationMs / 1000).toFixed(1)}s`;
      }
      return 'model ready';
    }
    case 'MODEL_CALLED': {
      const p = (e.payload as { provider?: string; model?: string } | undefined) ?? {};
      return p.model ? `thinking · ${p.model}` : 'thinking';
    }
    case 'TOOL_CALLED':
      return e.message || 'running tool';
    case 'TOOL_COMPLETED':
      return e.message || 'tool complete';
    default:
      return null;
  }
};

export interface ProgressOptions {
  /** Print streaming deltas inline under the spinner. Default: true. */
  showDeltas?: boolean;
  /** Initial spinner text. */
  initial?: string;
  /** Task id to filter deltas by; if unset, shows all deltas in-process. */
  taskId?: string;
}

export const startProgress = (opts: ProgressOptions = {}): ProgressHandle => {
  const showDeltas = opts.showDeltas !== false;
  const spinner = makeSpinner(opts.initial ?? 'working').start();
  // Streaming rail: accumulate chars on the current "thinking" line; when the
  // spinner advances to a new phase we drop the rail so the terminal doesn't
  // keep a half-formed paragraph around.
  // Streaming prose, two-pass:
  //   Pass 1 (live): tokens get written to stdout immediately with a fixed
  //     2-space indent and soft-wrap at the terminal width. The user sees
  //     characters appear as the model emits them — no perceptible batching.
  //   Pass 2 (finalize): when a paragraph boundary (\n\n outside an open
  //     fenced ``` block) is crossed, we rewind the cursor over exactly the
  //     terminal rows we painted, clear them, and rewrite that block through
  //     renderMarkdown. Same region, now with headings/lists/code styled.
  //
  // Consequences we care about:
  //   - Zero output duplication (we replace, we don't append).
  //   - Works per-block — a 2000-token answer re-renders paragraph by
  //     paragraph as each one completes, never all-at-once at the end.
  //   - Only the currently-unfinished block is rewritable. Finalized blocks
  //     above remain untouched even if the answer keeps growing.
  //   - `didStream()` lets callers skip the duplicate completion summary.
  let streamBuffer = '';
  let streamedSomething = false;
  // Cursor bookkeeping for the currently-in-flight block. rawLines is the
  // number of `\n` we've emitted since the block started (= rows above the
  // current cursor row). currentCol is the column of the cursor on the row
  // we're currently painting. Updated on every write so we can rewind
  // precisely when the block finalizes.
  let rawLines = 0;
  let currentCol = 0;
  const BLOCK_INDENT = '  ';
  const termWidth = (): number => Math.max(20, process.stdout.columns ?? 100);
  const closeRail = (): void => {
    // Phase-break separator so the next spinner line doesn't crash into
    // the just-rendered text. Only relevant after a fully-flushed block.
    if (streamedSomething && streamBuffer.length === 0) {
      process.stdout.write('\n');
    }
  };
  const dim = chalk.rgb(...PALETTE.muted);

  const accent = chalk.rgb(...PALETTE.cyan);

  // Print a step's completion summary above the spinner. The executor uses
  // jsonMode (so streaming is off), which means the *only* user-visible proof
  // that the model did something useful is the `summary` field it returns per
  // step. Dump it to stdout as the step finishes so the user watches work
  // accumulate in real time instead of staring at a bare spinner.
  const printStepSummary = (stepId: string, summary: string): void => {
    pauseSpinner(spinner);
    const body = summary.trim();
    if (!body) return;
    process.stdout.write(`\n  ${accent('◇')} ${chalk.bold(stepId)} ${dim('·')} ${body}\n`);
  };

  const onEvent = (e: ForgeEvent): void => {
    if (opts.taskId && e.taskId && e.taskId !== opts.taskId) return;
    // TASK_STEP_COMPLETED carries the model's per-step prose in the payload.
    // Render it inline so the user sees the work being produced — otherwise
    // a task like "summarize X" looks like it output nothing until the final
    // completion box.
    if (e.type === 'TASK_STEP_COMPLETED') {
      const payload = (e.payload as { summary?: string } | undefined) ?? {};
      const stepId = (e.message || '').replace(/^✔\s*/, '') || 'step';
      if (payload.summary && payload.summary.trim().length > 0) {
        printStepSummary(stepId, payload.summary);
      }
      // Fall through to also update spinner text below.
    }
    const text = phaseText(e);
    if (!text) return;
    closeRail();
    if (e.type === 'TASK_PLANNED') {
      // About to hit the approval prompt. Yield the terminal.
      try {
        spinner.stopAndPersist({ symbol: '◆', text: chalk.dim('plan ready · awaiting approval') });
      } catch {
        spinner.stop();
      }
      return;
    }
    try {
      spinner.text = text;
      if (!spinner.isSpinning) spinner.start();
    } catch {
      // ora can throw if the terminal was torn down; ignore.
    }
  };

  // True if `text` currently has an unclosed ``` fence — we must NOT try to
  // render a partial code block as markdown, it'll mangle. Counts triple
  // backticks at line starts; odd count = open fence.
  const hasOpenFence = (text: string): boolean => {
    let count = 0;
    for (const line of text.split('\n')) {
      if (/^\s*```/.test(line)) count++;
    }
    return count % 2 !== 0;
  };

  // Write raw tokens live with 2-space indent and soft-wrap. We keep
  // `rawLines` (= newlines emitted since block start) and `currentCol`
  // (visible column on the current line) in sync with what we painted, so
  // `clearRawBlock` can rewind precisely.
  const writeRaw = (text: string): void => {
    if (!text) return;
    if (!streamedSomething) {
      pauseSpinner(spinner);
      // Separator from any preceding spinner/step-summary output.
      process.stdout.write('\n');
      streamedSomething = true;
    }
    const width = termWidth();
    for (const ch of text) {
      if (ch === '\n') {
        process.stdout.write('\n');
        rawLines++;
        currentCol = 0;
        continue;
      }
      if (currentCol === 0) {
        process.stdout.write(BLOCK_INDENT);
        currentCol = BLOCK_INDENT.length;
      }
      process.stdout.write(ch);
      currentCol++;
      // Soft-wrap one column early so the terminal's own auto-wrap doesn't
      // advance the cursor without us noticing — our rewind math depends on
      // every row transition going through our counter.
      if (currentCol >= width) {
        process.stdout.write('\n');
        rawLines++;
        currentCol = 0;
      }
    }
  };

  // Rewind the cursor to the start of the current block and erase down to
  // the end of the screen. Used right before replacing the raw paint with
  // the markdown-rendered version.
  const clearRawBlock = (): void => {
    // Move to the start of the current line.
    process.stdout.write('\r');
    // If we're below the block's first line, walk back up.
    if (rawLines > 0) {
      process.stdout.write(`\x1b[${rawLines}A`);
    }
    // Erase from cursor to end of screen — wipes the raw-painted region.
    process.stdout.write('\x1b[J');
    rawLines = 0;
    currentCol = 0;
  };

  // Finalize a completed block: rewind over its raw paint and write the
  // markdown-rendered version in the same region. Trailing `\n\n` gives
  // paragraph spacing before the next (possibly already in-progress) block.
  const finalizeBlock = (content: string): void => {
    if (!content.trim()) {
      // Still clear whatever we painted so we don't leave orphaned text.
      clearRawBlock();
      return;
    }
    clearRawBlock();
    const rendered = renderMarkdown(content, { indent: 2 }).replace(/\s+$/, '');
    if (rendered) process.stdout.write(rendered + '\n\n');
  };

  const flushAll = (): void => {
    if (!streamBuffer.trim()) {
      streamBuffer = '';
      return;
    }
    finalizeBlock(streamBuffer);
    streamBuffer = '';
  };

  const onDelta = (d: ModelDeltaEvent): void => {
    if (!showDeltas) return;
    if (opts.taskId && d.taskId && d.taskId !== opts.taskId) return;
    if (d.done) {
      flushAll();
      return;
    }
    if (!d.text) return;
    // Live paint first — this is what makes streaming feel responsive.
    writeRaw(d.text);
    streamBuffer += d.text;
    // Then opportunistically finalize the prefix up to the last paragraph
    // break outside an open fence. This replaces the raw paint of that
    // prefix with its markdown-rendered form, and continues painting any
    // bytes past the break as the start of the next block.
    if (!streamBuffer.includes('\n\n')) return;
    let splitAt = streamBuffer.lastIndexOf('\n\n');
    while (splitAt > 0 && hasOpenFence(streamBuffer.slice(0, splitAt))) {
      splitAt = streamBuffer.lastIndexOf('\n\n', splitAt - 1);
    }
    if (splitAt <= 0) return;
    const ready = streamBuffer.slice(0, splitAt);
    const rest = streamBuffer.slice(splitAt + 2);
    // We painted the entire `ready + \n\n + rest` region as raw. Clear it
    // all, write the rendered version, then re-paint the `rest` as raw so
    // streaming continues from the right visible position.
    finalizeBlock(ready);
    streamBuffer = rest;
    if (rest) writeRaw(rest);
  };

  eventBus.on('event', onEvent);
  eventBus.on('delta', onDelta);

  return {
    stop(): void {
      eventBus.off('event', onEvent);
      eventBus.off('delta', onDelta);
      // Flush anything left over so we never drop a partial answer.
      flushAll();
      try {
        spinner.stop();
      } catch {
        // ignore
      }
    },
    pause(): void {
      closeRail();
      pauseSpinner(spinner);
    },
    resume(text?: string): void {
      if (text) spinner.text = text;
      try {
        if (!spinner.isSpinning) spinner.start();
      } catch {
        // ignore
      }
    },
    didStream(): boolean {
      return streamedSomething;
    },
  };
};

const pauseSpinner = (s: Ora): void => {
  try {
    if (s.isSpinning) s.stop();
  } catch {
    // ignore
  }
};
