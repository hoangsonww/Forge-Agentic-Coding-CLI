/**
 * Raw-mode line editor for the Forge REPL.
 *
 * Why a custom editor instead of readline? readline is one-line-at-a-time
 * and gives no hooks for rendering below the input (live suggestions, ghost
 * text, status line). We use Node's keypress parser (readline.emitKeypressEvents)
 * plus raw-mode stdin to own the render loop end-to-end.
 *
 * Rendering model: we keep track of how many rows we drew below the input
 * line on the last frame (`belowRows`). On each keystroke we:
 *   1. Move cursor to column 0 of the input line.
 *   2. Clear from here to end of screen (wipes old dropdown + status).
 *   3. Write prompt + input + inline ghost-text suggestion.
 *   4. Write the dropdown (if any), then the status line.
 *   5. Move cursor back up to the input row and into position.
 *
 * The layout:
 *
 *   [1] forge ❯ /stat|        us          ← cursor; "us" is dim ghost text
 *               ╭──────────────────────────────────────╮
 *               │ ▸ /status      show runtime status   │
 *               │   /spec        specification flow    │
 *               ╰──────────────────────────────────────╯
 *     ⚡ balanced · ollama:qwen2.5 · ~/proj · ctx 820/32k · turn 3 · $0.002
 *
 * The editor itself only deals with input + presentation. The REPL passes
 * in callbacks for prompt/status/suggestions/history/onSubmit/etc.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as readline from 'readline';
import chalk from 'chalk';

// ---------- Public types ----------

export interface Suggestion {
  label: string; // what gets rendered (e.g. "/status")
  value: string; // what gets substituted into the input on selection
  description?: string;
  score?: number;
}

export interface LineEditorHooks {
  prompt(): string; // visible prompt string (ANSI allowed)
  statusLine(): string; // single-line status footer
  suggestions(input: string): Suggestion[]; // ranked, already filtered
  history: string[]; // newest-last
  onSubmit(line: string, picked?: Suggestion): Promise<void> | void;
  onExit(): void; // Ctrl+D at empty or explicit
  onCancel(): void; // Ctrl+C (during idle)
  isRunning?: () => boolean; // if true, Ctrl+C signals task cancel; Enter is no-op
}

// ---------- Utilities ----------

// eslint-disable-next-line no-control-regex -- ANSI CSI sequences need the ESC byte.
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const visibleWidth = (s: string): number => stripAnsi(s).length;

const esc = {
  clearScreenDown: '\x1b[0J',
  clearLine: '\x1b[2K',
  cursorUp: (n: number) => (n > 0 ? `\x1b[${n}A` : ''),
  cursorDown: (n: number) => (n > 0 ? `\x1b[${n}B` : ''),
  cursorRight: (n: number) => (n > 0 ? `\x1b[${n}C` : ''),
  cursorCol0: '\r',
  cursorTo: (col: number) => `\r${col > 0 ? `\x1b[${col}C` : ''}`,
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  fullClear: '\x1b[2J\x1b[H',
};

// ---------- Core class ----------

export class LineEditor {
  private buf = '';
  private cursor = 0;
  private historyIdx = -1; // -1 = live buffer, 0..n-1 = history entries (newest→oldest)
  private historyStash = ''; // what was being typed before user entered history
  private sel = 0; // selected suggestion index
  private lastSuggestions: Suggestion[] = [];
  private done = false;
  private blocked = false; // true while onSubmit handler is running
  private resolveDone?: () => void;
  private readonly hooks: LineEditorHooks;

  // Number of rows currently painted ABOVE the prompt row for the slash-
  // command dropdown. Tracked precisely so per-keystroke redraws can rewind
  // exactly that many rows, clear from there to end-of-screen, and repaint
  // — no guessing, no save/restore cursor escapes, no drift.
  private dropdownRowsAbove = 0;

  // Kill ring — last text removed by Ctrl+U / Ctrl+K / Ctrl+W / Alt+Backspace.
  // Retrieved via Ctrl+Y (yank). Single-slot for simplicity; good enough.
  private killRing = '';

  // Reverse-i-search state. When active, keystrokes feed `searchQuery` and we
  // render a `(reverse-i-search)'q': match` prompt. Esc cancels (restore
  // original buffer); Enter accepts (copy match into buffer); Ctrl+R steps
  // older; any navigation key exits search mode with the match applied.
  private searchMode = false;
  private searchQuery = '';
  private searchCursor = -1; // index in `history` (0 = oldest) of current match; -1 = no match
  private searchStash = '';
  private searchStashCursor = 0;

  // Double-Esc detection (clear buffer).
  private lastEsc = 0;

  constructor(hooks: LineEditorHooks) {
    this.hooks = hooks;
  }

  async run(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolveDone = resolve;
      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdin.resume();
      this.render(true);
      process.stdin.on('keypress', this.onKey);
    });
  }

  /** Pause input without teardown (used during task execution). */
  suspend(): void {
    process.stdin.off('keypress', this.onKey);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    // clear our rendered region so command output lands cleanly
    this.eraseBelowAndPromptRow();
  }

  /** Resume after task completion. */
  resume(): void {
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', this.onKey);
    this.render(true);
  }

  close(): void {
    if (this.done) return;
    this.done = true;
    this.eraseBelowAndPromptRow();
    process.stdin.off('keypress', this.onKey);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write(esc.showCursor);
    this.resolveDone?.();
  }

  // ---------- Key handling ----------

  private readonly onKey = (str: string | undefined, key: readline.Key): void => {
    if (this.done) return;
    const name = key?.name ?? '';
    const ctrl = Boolean(key?.ctrl);
    const meta = Boolean(key?.meta);
    const shift = Boolean(key?.shift);

    // While submitting / task running: only Ctrl+C is honoured (→ task cancel)
    if (this.blocked || this.hooks.isRunning?.()) {
      if (ctrl && name === 'c') this.hooks.onCancel();
      return;
    }

    // Reverse-i-search mode owns its own key handling.
    if (this.searchMode) {
      this.handleSearchKey(str, key);
      return;
    }

    // Idle Ctrl+C:
    //   - non-empty buffer → clear the line (like zsh/bash)
    //   - empty buffer → delegate to the hook, which tracks double-press exit
    if (ctrl && name === 'c') {
      if (this.buf.length > 0) {
        this.buf = '';
        this.cursor = 0;
        this.historyIdx = -1;
        this.sel = 0;
        // echo ^C then redraw a fresh prompt on the next line
        process.stdout.write(chalk.dim('^C\n'));
        this.render(true);
        return;
      }
      this.hooks.onCancel();
      return;
    }

    // Ctrl+D: exit if buffer empty, else delete-at-cursor
    if (ctrl && name === 'd') {
      if (this.buf.length === 0) {
        this.hooks.onExit();
        return;
      }
      this.deleteAtCursor();
      this.render();
      return;
    }

    // Ctrl+L: clear screen and redraw
    if (ctrl && name === 'l') {
      process.stdout.write(esc.fullClear);
      this.render(true);
      return;
    }

    // Ctrl+A / Home: start of line
    if ((ctrl && name === 'a') || name === 'home') {
      this.cursor = 0;
      this.render();
      return;
    }

    // Ctrl+E / End: end of line
    if ((ctrl && name === 'e') || name === 'end') {
      this.cursor = this.buf.length;
      this.render();
      return;
    }

    // Ctrl+U: delete to start (→ kill ring)
    if (ctrl && name === 'u') {
      this.killRing = this.buf.slice(0, this.cursor);
      this.buf = this.buf.slice(this.cursor);
      this.cursor = 0;
      this.render();
      return;
    }

    // Ctrl+K: delete to end (→ kill ring)
    if (ctrl && name === 'k') {
      this.killRing = this.buf.slice(this.cursor);
      this.buf = this.buf.slice(0, this.cursor);
      this.render();
      return;
    }

    // Ctrl+W / Alt+Backspace: delete word backward (→ kill ring)
    if ((ctrl && name === 'w') || (meta && name === 'backspace')) {
      const left = this.buf.slice(0, this.cursor);
      const right = this.buf.slice(this.cursor);
      const trimmed = left.replace(/\S+\s*$/, '');
      this.killRing = left.slice(trimmed.length);
      this.cursor = trimmed.length;
      this.buf = trimmed + right;
      this.render();
      return;
    }

    // Ctrl+Y: yank from kill ring at cursor
    if (ctrl && name === 'y') {
      if (this.killRing) {
        this.buf = this.buf.slice(0, this.cursor) + this.killRing + this.buf.slice(this.cursor);
        this.cursor += this.killRing.length;
        this.render();
      }
      return;
    }

    // Ctrl+T: transpose the two chars around cursor (emacs classic)
    if (ctrl && name === 't') {
      if (this.buf.length >= 2) {
        const pos = this.cursor === this.buf.length ? this.cursor - 1 : this.cursor;
        if (pos >= 1) {
          const chars = this.buf.split('');
          [chars[pos - 1], chars[pos]] = [chars[pos], chars[pos - 1]];
          this.buf = chars.join('');
          if (this.cursor < this.buf.length) this.cursor++;
        }
      }
      this.render();
      return;
    }

    // Alt+B: move cursor one word back
    if (meta && name === 'b') {
      const left = this.buf.slice(0, this.cursor);
      const m = left.match(/(?:\s*\S+)\s*$/);
      if (m) {
        const trimmed = left.replace(/(?:\s*\S+)\s*$/, (x) => {
          // keep leading whitespace, move only past the last word
          const trailing = x.match(/\s*$/)?.[0] ?? '';
          return x.slice(0, x.length - (x.length - trailing.length));
        });
        this.cursor = Math.max(
          0,
          this.cursor - (m[0].length - (m[0].match(/\s*$/)?.[0].length ?? 0)),
        );
        // simpler: recompute
        const idx = this.buf.slice(0, this.cursor).search(/\S(?!.*\S)/);
        void trimmed;
        void idx;
      }
      // Re-derive cleanly: find start of previous word
      let p = this.cursor;
      while (p > 0 && /\s/.test(this.buf[p - 1])) p--;
      while (p > 0 && !/\s/.test(this.buf[p - 1])) p--;
      this.cursor = p;
      this.render();
      return;
    }

    // Alt+F: move cursor one word forward
    if (meta && name === 'f') {
      let p = this.cursor;
      while (p < this.buf.length && /\s/.test(this.buf[p])) p++;
      while (p < this.buf.length && !/\s/.test(this.buf[p])) p++;
      this.cursor = p;
      this.render();
      return;
    }

    // Ctrl+R: enter reverse-i-search
    if (ctrl && name === 'r') {
      this.enterSearchMode();
      return;
    }

    // Alt+Enter or Ctrl+J: insert newline at cursor (multi-line compose)
    if ((meta && (name === 'return' || name === 'enter')) || (ctrl && name === 'j')) {
      this.buf = this.buf.slice(0, this.cursor) + '\n' + this.buf.slice(this.cursor);
      this.cursor++;
      this.render();
      return;
    }

    // F1: /help  ·  F2: /sessions  ·  F3: /new
    if (name === 'f1') {
      void this.submitLiteral('/help');
      return;
    }
    if (name === 'f2') {
      void this.submitLiteral('/sessions');
      return;
    }
    if (name === 'f3') {
      void this.submitLiteral('/new');
      return;
    }

    // Enter: submit
    if (name === 'return' || name === 'enter') {
      if (this.hooks.isRunning?.()) return; // ignore while a task runs
      void this.submit();
      return;
    }

    // Tab: accept suggestion (or cycle)
    if (name === 'tab' && !shift) {
      if (this.lastSuggestions.length) {
        const pick = this.lastSuggestions[this.sel] ?? this.lastSuggestions[0];
        this.buf = pick.value + ' ';
        this.cursor = this.buf.length;
        this.sel = 0;
        this.render();
      }
      return;
    }
    if (name === 'tab' && shift) {
      if (this.lastSuggestions.length) {
        this.sel = (this.sel - 1 + this.lastSuggestions.length) % this.lastSuggestions.length;
        this.render();
      }
      return;
    }

    // Arrow up/down: if dropdown visible, navigate; else history
    if (name === 'up') {
      if (this.lastSuggestions.length > 1) {
        this.sel = (this.sel - 1 + this.lastSuggestions.length) % this.lastSuggestions.length;
        this.render();
      } else {
        this.historyPrev();
      }
      return;
    }
    if (name === 'down') {
      if (this.lastSuggestions.length > 1) {
        this.sel = (this.sel + 1) % this.lastSuggestions.length;
        this.render();
      } else {
        this.historyNext();
      }
      return;
    }

    // Arrow left/right: cursor nav
    if (name === 'left') {
      if (this.cursor > 0) this.cursor--;
      this.render();
      return;
    }
    if (name === 'right') {
      // if at end and we have a ghost suggestion, accept the ghost
      if (this.cursor === this.buf.length && this.ghostSuffix()) {
        const g = this.ghostSuffix();
        if (g) {
          this.buf += g;
          this.cursor = this.buf.length;
        }
      } else if (this.cursor < this.buf.length) {
        this.cursor++;
      }
      this.render();
      return;
    }

    // Backspace
    if (name === 'backspace') {
      if (this.cursor > 0) {
        this.buf = this.buf.slice(0, this.cursor - 1) + this.buf.slice(this.cursor);
        this.cursor--;
      }
      this.render();
      return;
    }

    // Delete
    if (name === 'delete') {
      this.deleteAtCursor();
      this.render();
      return;
    }

    // Escape: once dismisses dropdown selection; pressing Esc again within
    // 500ms clears the whole buffer (zsh-like).
    if (name === 'escape') {
      const now = Date.now();
      if (now - this.lastEsc < 500 && this.buf.length > 0) {
        this.buf = '';
        this.cursor = 0;
        this.historyIdx = -1;
        this.sel = 0;
        this.lastEsc = 0;
      } else {
        this.sel = 0;
        this.lastEsc = now;
      }
      this.render();
      return;
    }

    // Printable char insertion
    if (str && !meta && !ctrl && str.length === 1 && str.charCodeAt(0) >= 32) {
      this.buf = this.buf.slice(0, this.cursor) + str + this.buf.slice(this.cursor);
      this.cursor++;
      this.historyIdx = -1;
      this.sel = 0;
      this.render();
      return;
    }

    // Bracketed paste or multi-char input: insert verbatim, minus newlines
    if (str && str.length > 1 && !ctrl && !meta) {
      const clean = str.replace(/[\r\n]+/g, ' ');
      this.buf = this.buf.slice(0, this.cursor) + clean + this.buf.slice(this.cursor);
      this.cursor += clean.length;
      this.render();
      return;
    }
  };

  private deleteAtCursor(): void {
    if (this.cursor < this.buf.length) {
      this.buf = this.buf.slice(0, this.cursor) + this.buf.slice(this.cursor + 1);
    }
  }

  private historyPrev(): void {
    const h = this.hooks.history;
    if (!h.length) return;
    if (this.historyIdx === -1) this.historyStash = this.buf;
    this.historyIdx = Math.min(this.historyIdx + 1, h.length - 1);
    this.buf = h[h.length - 1 - this.historyIdx] ?? '';
    this.cursor = this.buf.length;
    this.render();
  }

  private historyNext(): void {
    const h = this.hooks.history;
    if (!h.length || this.historyIdx === -1) return;
    this.historyIdx--;
    if (this.historyIdx === -1) {
      this.buf = this.historyStash;
    } else {
      this.buf = h[h.length - 1 - this.historyIdx] ?? '';
    }
    this.cursor = this.buf.length;
    this.render();
  }

  // ---------- Submit ----------

  private async submit(): Promise<void> {
    const raw = this.buf;
    let picked: Suggestion | undefined;
    // Slash-command dispatch at submit. Two cases the user might want:
    //   1. They navigated the dropdown with ↑/↓ and pressed Enter — honor
    //      that selection even if the literal buffer would exactly-match a
    //      different command.
    //   2. They just typed a full command and pressed Enter with no
    //      navigation — fall through to the literal text (no rewrite).
    // The earlier version always picked `lastSuggestions[0]` and ignored
    // `this.sel`, so arrow-key selection never applied.
    if (raw.startsWith('/') && this.lastSuggestions.length) {
      const head = raw.slice(1).split(/\s+/, 1)[0] ?? '';
      const exact = this.lastSuggestions.find((s) => s.value.slice(1) === head);
      // User-navigated selection beats top-of-list. If they didn't move
      // the cursor (`this.sel === 0`) and the buffer already exactly-matches
      // a command, leave the buffer alone — they typed what they meant.
      const userNavigated = this.sel > 0;
      if (userNavigated) {
        picked = this.lastSuggestions[this.sel];
      } else if (!exact) {
        picked = this.lastSuggestions[0];
      }
    }
    this.eraseBelowAndPromptRow();
    // Echo the line as entered (with picked hint if any)
    const prompt = this.hooks.prompt();
    const line = picked ? chalk.white(raw) + chalk.dim(`  ↳ ${picked.label}`) : chalk.white(raw);
    process.stdout.write(prompt + line + '\n');

    this.buf = '';
    this.cursor = 0;
    this.historyIdx = -1;
    this.sel = 0;
    this.lastSuggestions = [];

    const final = picked
      ? picked.value + raw.slice(raw.indexOf(' ') >= 0 ? raw.indexOf(' ') : raw.length)
      : raw;
    this.blocked = true;
    try {
      await this.hooks.onSubmit(final.trim(), picked);
    } catch (e) {
      process.stdout.write(
        chalk.red(`\nEditor submit error: ${e instanceof Error ? e.message : String(e)}\n`),
      );
    } finally {
      // Sub-prompts fired during the task (chooseNumbered for plan approval
      // / permission decisions, the ask_user tool) grab stdin and restore it
      // to a sensible-for-them state on exit — which is NOT our state.
      // Specifically, chooseNumbered calls `stdin.pause()` + `setRawMode(false)`
      // at the end. If we just re-render without reacquiring stdin, the REPL
      // silently dies: no keypress events flow, no other event-loop work is
      // pending, Node exits. Reacquire here so the editor is always ready
      // for the next turn.
      try {
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
        process.stdin.resume();
      } catch {
        // best-effort; if TTY semantics changed under us, render will still
        // paint and the user can at least see state.
      }
      this.blocked = false;
    }
    if (!this.done) this.render(true);
  }

  /** Fire a command without going through user editing — used by F-keys. */
  private async submitLiteral(text: string): Promise<void> {
    this.buf = text;
    this.cursor = text.length;
    this.sel = 0;
    this.lastSuggestions = this.hooks.suggestions(text);
    await this.submit();
  }

  // ---------- Reverse-i-search ----------

  private enterSearchMode(): void {
    this.searchMode = true;
    this.searchQuery = '';
    this.searchCursor = -1;
    this.searchStash = this.buf;
    this.searchStashCursor = this.cursor;
    this.sel = 0;
    this.lastSuggestions = [];
    this.renderSearch();
  }

  private exitSearchMode(apply: boolean): void {
    this.searchMode = false;
    if (apply && this.searchCursor >= 0) {
      const match = this.hooks.history[this.searchCursor];
      if (match !== undefined) {
        this.buf = match;
        this.cursor = match.length;
      }
    } else {
      this.buf = this.searchStash;
      this.cursor = this.searchStashCursor;
    }
    this.searchQuery = '';
    this.searchCursor = -1;
    this.render(true);
  }

  private findMatch(startAt: number, backwards = true): number {
    const h = this.hooks.history;
    const q = this.searchQuery.toLowerCase();
    if (!q) return -1;
    // history is newest-last; "reverse" means newer → older.
    for (let i = startAt; backwards ? i >= 0 : i < h.length; i += backwards ? -1 : 1) {
      if ((h[i] ?? '').toLowerCase().includes(q)) return i;
    }
    return -1;
  }

  private handleSearchKey(str: string | undefined, key: readline.Key): void {
    const name = key?.name ?? '';
    const ctrl = Boolean(key?.ctrl);
    const meta = Boolean(key?.meta);

    // Cancel — restore pre-search buffer
    if (ctrl && name === 'c') {
      this.exitSearchMode(false);
      return;
    }
    if (name === 'escape') {
      this.exitSearchMode(false);
      return;
    }

    // Accept match into buffer, exit search mode, but don't auto-submit.
    if (name === 'return' || name === 'enter') {
      this.exitSearchMode(true);
      return;
    }

    // Ctrl+R: find next older match
    if (ctrl && name === 'r') {
      const h = this.hooks.history;
      const from = this.searchCursor === -1 ? h.length - 1 : this.searchCursor - 1;
      const idx = this.findMatch(from, true);
      if (idx >= 0) this.searchCursor = idx;
      this.renderSearch();
      return;
    }

    // Ctrl+S: find next newer match (if terminal doesn't swallow it)
    if (ctrl && name === 's') {
      const from = this.searchCursor === -1 ? 0 : this.searchCursor + 1;
      const idx = this.findMatch(from, false);
      if (idx >= 0) this.searchCursor = idx;
      this.renderSearch();
      return;
    }

    // Backspace: shrink query
    if (name === 'backspace') {
      this.searchQuery = this.searchQuery.slice(0, -1);
      this.searchCursor = this.findMatch(this.hooks.history.length - 1, true);
      this.renderSearch();
      return;
    }

    // Navigation or Tab — accept the match, exit search, keep the key's behaviour
    if (
      name === 'left' ||
      name === 'right' ||
      name === 'home' ||
      name === 'end' ||
      name === 'tab'
    ) {
      this.exitSearchMode(true);
      return;
    }

    // Printable char: extend query
    if (str && !meta && !ctrl && str.length === 1 && str.charCodeAt(0) >= 32) {
      this.searchQuery += str;
      // search from the current position (so successive chars narrow the same match)
      const startFrom =
        this.searchCursor === -1 ? this.hooks.history.length - 1 : this.searchCursor;
      this.searchCursor = this.findMatch(startFrom, true);
      this.renderSearch();
      return;
    }
  }

  private renderSearch(): void {
    // Layout:
    //   (reverse-i-search)`query': matched text
    //   <status line>
    this.eraseBelowAndPromptRow();
    const h = this.hooks.history;
    const match = this.searchCursor >= 0 ? (h[this.searchCursor] ?? '') : '';
    const label = chalk.yellow('(reverse-i-search)');
    const q = chalk.bold(`'${this.searchQuery}'`);
    const result =
      this.searchCursor >= 0
        ? chalk.white(match)
        : this.searchQuery
          ? chalk.red('(no match)')
          : chalk.dim('(type to search · ↵ accept · esc cancel · C-r older · C-s newer)');
    process.stdout.write(`${label}${q}: ${result}`);
    // status line below
    process.stdout.write('\n\n' + this.hooks.statusLine());
    // position cursor at end of query (purely cosmetic — edits are query-only)
    process.stdout.write(esc.cursorUp(2));
    const cursorCol = stripAnsi(`(reverse-i-search)'${this.searchQuery}`).length;
    process.stdout.write(esc.cursorTo(cursorCol));
  }

  // ---------- Rendering ----------

  private ghostSuffix(): string | null {
    if (!this.buf.startsWith('/')) return null;
    if (!this.lastSuggestions.length) return null;
    const top = this.lastSuggestions[this.sel] ?? this.lastSuggestions[0];
    if (!top) return null;
    if (!top.value.startsWith(this.buf)) return null;
    return top.value.slice(this.buf.length);
  }

  private render(initial = false): void {
    this.lastSuggestions = this.hooks.suggestions(this.buf);
    if (this.sel >= this.lastSuggestions.length) this.sel = 0;

    // Layout (top → bottom, painted once per render):
    //
    //   <status line>       ← only on initial / resume / post-submit
    //   <dropdown row 1>    ─┐
    //   <dropdown row 2>     ├ painted only when buf starts with '/'; tracked
    //   …                    │ in this.dropdownRowsAbove so the next render
    //   <dropdown row N>    ─┘ can rewind precisely.
    //   <prompt> <input>    ← cursor lives here
    //
    // Key invariant: the prompt row is always the LAST row of the editor's
    // painted region. Nothing is painted below it. Per-keystroke, we rewind
    // `dropdownRowsAbove` rows from the prompt row, clear from there to end
    // of screen, and repaint dropdown + prompt. The status line is NEVER
    // part of the per-keystroke redraw — it stays stable up-scroll.
    const prompt = this.hooks.prompt();
    const promptWidth = visibleWidth(prompt);
    const NL_GLYPH = chalk.dim('↵ ');
    const renderBuf = this.buf.replace(/\n/g, NL_GLYPH);
    const ghost = this.ghostSuffix();
    const inputSegment = renderBuf + (ghost ? chalk.dim(ghost) : '');
    const newlinesBefore = (this.buf.slice(0, this.cursor).match(/\n/g) ?? []).length;
    const cursorCol = promptWidth + this.cursor + newlinesBefore;
    const dropdownRows = this.renderDropdown();

    if (initial) {
      // First paint / resume / post-submit: status line, then dropdown (if
      // any), then prompt row. All newlines flow downward — no cursor-up
      // gymnastics.
      process.stdout.write(esc.clearScreenDown);
      process.stdout.write(this.hooks.statusLine() + '\n');
      for (const line of dropdownRows) process.stdout.write(line + '\n');
      process.stdout.write(prompt + inputSegment);
      process.stdout.write(esc.cursorTo(cursorCol));
      this.dropdownRowsAbove = dropdownRows.length;
      return;
    }

    // Per-keystroke: rewind to the top of (dropdown ∪ prompt) region, clear
    // to end of screen, repaint dropdown + prompt.
    process.stdout.write('\r');
    if (this.dropdownRowsAbove > 0) {
      process.stdout.write(esc.cursorUp(this.dropdownRowsAbove));
    }
    process.stdout.write(esc.clearScreenDown);
    for (const line of dropdownRows) process.stdout.write(line + '\n');
    process.stdout.write(prompt + inputSegment);
    process.stdout.write(esc.cursorTo(cursorCol));
    this.dropdownRowsAbove = dropdownRows.length;
  }

  private renderDropdown(): string[] {
    const s = this.lastSuggestions;
    if (!s.length || !this.buf.startsWith('/')) return [];
    const maxShown = 6;
    const visible = s.slice(0, maxShown);

    // Layout budget. The inner row is built as:
    //   " ▸ <label:labelCol> <desc:descBudget>"
    // where everything between the │ borders is exactly `innerW` visible chars.
    const pad = ' '.repeat(12);
    const termCols =
      process.stdout.columns && process.stdout.columns > 30 ? process.stdout.columns : 120;
    const maxBox = Math.min(86, Math.max(44, termCols - pad.length - 2));
    const innerW = maxBox - 2; // between │ and │
    const labelCol = Math.min(20, Math.max(12, Math.floor(innerW * 0.28)));
    // " " + arrow + " " + label + " " + desc  → fixed chrome width = 4
    const descBudget = Math.max(8, innerW - labelCol - 4);

    // Truncate a plain string to fit `max` visible chars. Ellipsis on overflow.
    const fit = (raw: string, max: number): string => {
      if (raw.length <= max) return raw + ' '.repeat(max - raw.length);
      if (max <= 1) return '…'.slice(0, max);
      return raw.slice(0, max - 1) + '…';
    };

    const lines: string[] = [];
    lines.push(pad + chalk.dim('╭' + '─'.repeat(innerW) + '╮'));

    visible.forEach((sg, i) => {
      const isSel = i === this.sel;
      const arrow = isSel ? chalk.bold.cyan('▸') : ' ';
      const labelText = fit(sg.label, labelCol);
      const descText = fit(sg.description ?? '', descBudget);
      const labelColored = isSel ? chalk.bold.cyan(labelText) : chalk.cyan(labelText);
      const descColored = chalk.dim(descText);
      const row = ` ${arrow} ${labelColored} ${descColored}`;
      const surplus = visibleWidth(row) - innerW;
      const safeRow = surplus > 0 ? row.slice(0, row.length - surplus) : row;
      lines.push(pad + chalk.dim('│') + safeRow + chalk.dim('│'));
    });

    if (s.length > maxShown) {
      const text = fit(` …+${s.length - maxShown} more`, innerW);
      lines.push(pad + chalk.dim('│') + chalk.dim(text) + chalk.dim('│'));
    }

    lines.push(pad + chalk.dim('╰' + '─'.repeat(innerW) + '╯'));
    return lines;
  }

  private eraseBelowAndPromptRow(): void {
    // Clear the editor's painted region — dropdown rows above us + the
    // prompt row we're on. Status line (even further above) is left intact
    // so it stays visible while we echo the submitted line.
    process.stdout.write(esc.cursorCol0);
    if (this.dropdownRowsAbove > 0) {
      process.stdout.write(esc.cursorUp(this.dropdownRowsAbove));
    }
    process.stdout.write(esc.clearScreenDown);
    this.dropdownRowsAbove = 0;
  }
}
