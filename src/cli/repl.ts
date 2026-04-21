/**
 * Forge REPL — production-grade interactive shell.
 *
 * Composed of three collaborators:
 *   • repl-input.ts      raw-mode line editor with ghost text + dropdown +
 *                        status line
 *   • repl-commands.ts   slash-command catalog + fuzzy ranker + semantic
 *                        prompt shortcuts (/ask, /explain, /fix, …)
 *   • this file          session state, routing, task execution, persistence
 *
 * Each turn flows:
 *   input  →  slash dispatch OR semantic expansion OR bare text
 *          →  orchestrateRun({ input, description = prior-turns + new })
 *          →  result recorded in state.turns + persisted to JSONL
 *          →  next prompt
 *
 * Multi-turn context lives in state.turns and is woven into the planner's
 * `description` field so the agent sees the conversation so far.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- JSON import via require avoids assert syntax churn
const pkg = require('../../package.json') as { version?: string };
import { Command, CommanderError } from 'commander';
import chalk from 'chalk';
import { PALETTE } from './banners';
import { ok, err, info, dim, accent, warn } from './ui';
import { bootstrap } from './bootstrap';
import { setConsoleOutput } from '../logging/logger';
import { orchestrateRun } from '../core/orchestrator';
import { findProjectRoot, loadGlobalConfig } from '../config/loader';
import { ensureProjectDir, FORGE_HOME } from '../config/paths';
import { Mode } from '../types';
import { PermissionFlags } from '../permissions/manager';
import { LineEditor, LineEditorHooks, Suggestion } from './repl-input';
import {
  SLASH_COMMANDS,
  SlashCommand,
  SemanticExpansion,
  findSlash,
  rankSlash,
} from './repl-commands';
import { listProviders } from '../models/provider';
import { renderMarkdown } from './markdown';
import {
  Conversation,
  ConversationTurn,
  TurnStatus,
  appendUserTurn,
  attachTurnResult,
  composeDescription,
  createConversation,
  deleteConversation,
  listConversations,
  loadConversation,
  newTurnId,
  renameConversation,
  watchConversationFile,
} from '../core/conversation';
import { ConversationWatcher } from '../persistence/conversation-store';
import { checkForUpdate, currentVersion } from '../daemon/updater';

// ---------- Types ----------

interface ReplState {
  conversation: Conversation;
  projectRoot: string;
  mode: Mode;
  flags: PermissionFlags;
  autoApprove: boolean;
  running: boolean;
  abort?: AbortController;
  provider: string;
  modelId: string;
  /** Watcher on the active conversation file so other writers (UI, other
   *  terminals, subagents) appear live. */
  watcher?: ConversationWatcher;
  /** Task ids emitted by the local process, so the watcher can skip echoing
   *  changes we already rendered. */
  localTaskIds: Set<string>;
  /** Count of unread notes from other writers since last render — surfaced
   *  in the status line so the user knows their view may be stale. */
  remoteUpdates: number;
}

/** Backwards-compat helpers: map between ConversationTurn (new source of
 *  truth) and the older ReplTurn shape used throughout the REPL. We keep the
 *  abstraction thin — the conversation stores everything, the REPL reads
 *  from it. */
const turnsOf = (state: ReplState): ConversationTurn[] => state.conversation.turns;

// ---------- History persistence ----------

const HISTORY_FILE = path.join(FORGE_HOME, 'history');
const HISTORY_MAX = 1000;

const loadHistory = (): string[] => {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(-HISTORY_MAX);
  } catch {
    return [];
  }
};

const appendHistory = (line: string): void => {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.appendFileSync(HISTORY_FILE, line + '\n', 'utf8');
  } catch {
    /* best-effort */
  }
};

// ---------- Rendering helpers ----------

const chip = (label: string, tone: 'ok' | 'warn' | 'dim' | 'info' = 'dim'): string => {
  const map = {
    ok: chalk.bgRgb(...PALETTE.teal).black,
    warn: chalk.bgRgb(...PALETTE.amber).black,
    info: chalk.bgRgb(...PALETTE.violet).white,
    dim: chalk.bgRgb(...PALETTE.dim).white,
  };
  return map[tone](` ${label} `);
};

const modeColor = (m: Mode): string => {
  const toneOf: Record<Mode, 'ok' | 'warn' | 'info'> = {
    fast: 'ok',
    balanced: 'ok',
    heavy: 'warn',
    plan: 'info',
    execute: 'warn',
    audit: 'info',
    debug: 'warn',
    architect: 'info',
    'offline-safe': 'ok',
  };
  return chip(m, toneOf[m] ?? 'dim');
};

const shortCwd = (root: string): string => {
  const home = os.homedir();
  if (root === home) return '~';
  if (root.startsWith(home + path.sep)) return '~/' + path.relative(home, root);
  const parts = root.split(path.sep).filter(Boolean);
  return parts.length <= 3 ? root : '…/' + parts.slice(-3).join('/');
};

// Rough token estimate: ~4 chars per token for English + code.
const approxTokens = (s: string): number => Math.ceil(s.length / 4);

const contextEstimate = (state: ReplState): { used: number; max: number } => {
  const used = turnsOf(state).reduce((acc, t) => {
    const body = `${t.input}\n${t.result?.summary ?? ''}\n${(t.result?.filesChanged ?? []).join(' ')}`;
    return acc + approxTokens(body);
  }, 0);
  // rough ceiling by provider default; real value comes from model descriptor
  const modelCtx: Record<string, number> = {
    ollama: 32_000,
    anthropic: 200_000,
    openai: 128_000,
    llamacpp: 8_192,
  };
  return { used, max: modelCtx[state.provider] ?? 32_000 };
};

const fmtTokens = (n: number): string => {
  if (n < 1000) return String(n);
  if (n < 1000000) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
  return (n / 1000000).toFixed(1) + 'M';
};

const sessionCost = (state: ReplState): number =>
  turnsOf(state).reduce((acc, t) => acc + (t.result?.costUsd ?? 0), 0);

const prompt = (state: ReplState): string => {
  const n = chalk.dim(`[${turnsOf(state).length + 1}]`);
  const arrow = chalk.bold.rgb(...PALETTE.teal)('❯');
  return `${n} ${chalk.bold('forge')} ${arrow} `;
};

const statusLine = (state: ReplState): string => {
  const ctx = contextEstimate(state);
  const pctUsed = ctx.used / ctx.max;
  const ctxStr = `${fmtTokens(ctx.used)}/${fmtTokens(ctx.max)}`;
  const ctxColor =
    pctUsed > 0.85
      ? chalk.rgb(...PALETTE.red)
      : pctUsed > 0.6
        ? chalk.rgb(...PALETTE.amber)
        : chalk.rgb(...PALETTE.teal);

  const bits: string[] = [];
  bits.push(chalk.rgb(...PALETTE.teal)('◆') + ' ' + modeColor(state.mode));
  bits.push(chalk.dim(state.provider) + chalk.rgb(...PALETTE.muted)(':' + state.modelId));
  bits.push(chalk.rgb(...PALETTE.violet)(shortCwd(state.projectRoot)));
  bits.push(chalk.dim('ctx ') + ctxColor(ctxStr));
  bits.push(chalk.dim(`turn ${turnsOf(state).length + 1}`));
  const cost = sessionCost(state);
  if (cost > 0) bits.push(chalk.rgb(...PALETTE.pink)('$' + cost.toFixed(4)));
  if (state.autoApprove) bits.push(chip('auto', 'warn'));
  if (state.flags.strict) bits.push(chip('strict', 'warn'));
  if (state.flags.allowFiles) bits.push(chip('+files', 'warn'));
  if (state.flags.allowShell) bits.push(chip('+shell', 'warn'));
  if (state.flags.allowNetwork) bits.push(chip('+net', 'warn'));
  if (state.flags.allowWeb) bits.push(chip('+web', 'warn'));
  if (state.flags.allowMcp) bits.push(chip('+mcp', 'warn'));
  // Remote writers (UI, another terminal) indicator — click-for-details via /turns.
  if (state.remoteUpdates > 0) {
    bits.push(chalk.bgRgb(...PALETTE.violet).white(` ⇣${state.remoteUpdates} new `));
  }
  // Conversation source badge so the user knows where this lives.
  bits.push(
    state.conversation.meta.source === 'chat'
      ? chalk.dim('chat:') + chalk.rgb(...PALETTE.violet)(state.conversation.meta.id.slice(0, 18))
      : chalk.dim('repl:') + chalk.rgb(...PALETTE.teal)(state.conversation.meta.id.slice(0, 18)),
  );
  return '  ' + bits.join(chalk.dim(' · '));
};

const hero = (_state: ReplState, version: string): string => {
  const lines = [
    '',
    '  ' +
      chalk.bold.rgb(...PALETTE.teal)('forge') +
      chalk.dim(` v${version}  · interactive session`),
    '  ' +
      chalk.rgb(...PALETTE.muted)(
        'Type a prompt to run. Start with / for a command. Tab to accept. ↑/↓ to browse.',
      ),
    '  ' +
      chalk.rgb(...PALETTE.muted)('Try: ') +
      chalk.white('"add a /health endpoint"') +
      chalk.dim(' · ') +
      chalk.white('/ask how does the scheduler work?') +
      chalk.dim(' · ') +
      chalk.white('/help'),
    '',
  ];
  return lines.join('\n');
};

const helpCard = (): string => {
  const col = (k: string, v: string) =>
    '  ' + chalk.bold.rgb(...PALETTE.teal)(k.padEnd(28)) + chalk.dim(v);
  const header = (s: string) => '\n  ' + chalk.bold.rgb(...PALETTE.violet)(s);
  const byCat = new Map<string, SlashCommand[]>();
  for (const c of SLASH_COMMANDS) {
    const arr = byCat.get(c.category) ?? [];
    arr.push(c);
    byCat.set(c.category, arr);
  }
  const ordered = [
    'Agentic',
    'Shortcut',
    'Session',
    'Modes',
    'Knowledge',
    'Models',
    'Infrastructure',
  ];
  const out: string[] = [''];
  out.push(header('Input'));
  out.push(col('<text>', 'run as a task; prior turns thread into the planner'));
  out.push(col('/<command> [args]', 'commander passthrough or REPL action'));
  out.push(col('Tab / Shift+Tab', 'accept suggestion · cycle backward'));
  out.push(col('↑ / ↓', 'navigate suggestions (when dropdown open) or history'));
  out.push(col('→ at end', 'accept ghost-text suggestion'));
  out.push(col('Ctrl+R', 'reverse-i-search through history (Ctrl+S newer · Esc cancel)'));
  out.push(col('Alt+Enter · Ctrl+J', 'insert newline (multi-line compose)'));
  out.push(col('Ctrl+A/E · Home/End', 'line start / line end'));
  out.push(col('Alt+B · Alt+F', 'word back / word forward'));
  out.push(col('Ctrl+U · Ctrl+K', 'kill to start / kill to end'));
  out.push(col('Ctrl+W · Alt+Bksp', 'kill word backward'));
  out.push(col('Ctrl+Y', 'yank last killed text'));
  out.push(col('Ctrl+T', 'transpose characters around cursor'));
  out.push(col('Ctrl+L', 'clear screen'));
  out.push(col('F1 / F2 / F3', 'help / sessions / new conversation'));
  out.push(col('Esc · Esc Esc', 'dismiss dropdown · clear buffer'));
  out.push(
    col('Ctrl+C', 'non-empty: clear line · empty: press twice to exit · during task: cancel'),
  );
  out.push(col('Ctrl+D', 'exit'));
  for (const cat of ordered) {
    const group = byCat.get(cat);
    if (!group) continue;
    out.push(header(cat));
    for (const c of group) {
      const aliases = c.aliases?.length
        ? chalk.dim(` (${c.aliases.map((a) => '/' + a).join(' ')})`)
        : '';
      // eslint-disable-next-line no-control-regex -- stripping ANSI CSI SGR sequences
      out.push(col('/' + c.name + aliases.replace(/\x1b\[[0-9;]*m/g, ''), c.description));
    }
  }
  out.push('');
  return out.join('\n');
};

// ---------- Turn persistence + threading ----------

// ---------- Session summary rendering ----------

const printResumedSummary = (state: ReplState): void => {
  const turns = turnsOf(state);
  if (!turns.length) {
    info(`Resumed ${state.conversation.meta.id} · no prior turns on disk.`);
    return;
  }
  const n = turns.length;
  process.stdout.write(
    '\n  ' +
      chalk.bold.rgb(...PALETTE.teal)('Resumed ') +
      chalk.white(state.conversation.meta.id) +
      chalk.dim(`  ·  ${n} prior turn${n === 1 ? '' : 's'}\n\n`),
  );
  const show = turns.slice(-5);
  const offset = turns.length - show.length;
  show.forEach((t, idx) => {
    const num = chalk.dim(`  ${String(offset + idx + 1).padStart(2, '0')}.`);
    const head = chalk.white(t.input.replace(/\s+/g, ' ').slice(0, 100));
    process.stdout.write(`${num} ${head}\n`);
    if (t.result) {
      const ok = t.result.success
        ? chalk.rgb(...PALETTE.green)('✓')
        : chalk.rgb(...PALETTE.red)('✗');
      const meta =
        `${(t.result.durationMs / 1000).toFixed(1)}s · ${t.result.filesChanged.length} files` +
        (t.result.costUsd ? ` · $${t.result.costUsd.toFixed(4)}` : '');
      process.stdout.write(
        '      ' +
          ok +
          ' ' +
          chalk.dim((t.result.summary ?? '').replace(/\s+/g, ' ').slice(0, 100)) +
          chalk.dim(`  (${meta})`) +
          '\n',
      );
    }
  });
  if (turns.length > show.length) {
    process.stdout.write(chalk.dim(`  …+${turns.length - show.length} earlier\n`));
  }
  process.stdout.write(
    chalk.dim(
      '  Continue the conversation below. Forge will thread the prior turns into the next plan.\n\n',
    ),
  );
};

const relativeTime = (iso: string): string => {
  const age = Date.now() - new Date(iso).getTime();
  if (age < 60_000) return 'just now';
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h ago`;
  return `${Math.floor(age / 86_400_000)}d ago`;
};

const printSessionsList = (state: ReplState): void => {
  const list = listConversations(state.projectRoot);
  if (!list.length) {
    info('No prior conversations in this project.');
    return;
  }
  process.stdout.write('\n');
  for (const s of list.slice(0, 20)) {
    const sourceTag =
      s.source === 'repl'
        ? chalk.bgRgb(...PALETTE.cyan).black(' REPL ')
        : chalk.bgRgb(...PALETTE.violet).white(' CHAT ');
    const id = chalk.rgb(...PALETTE.teal)(s.id);
    const turnsLabel = chalk.dim(`${s.turns} turn${s.turns === 1 ? '' : 's'}`);
    const active =
      s.id === state.conversation.meta.id ? chalk.rgb(...PALETTE.amber)('  ← current') : '';
    process.stdout.write(
      `  ${sourceTag} ${id}  ${turnsLabel}  ${chalk.dim(relativeTime(s.lastAt))}${active}\n`,
    );
    if (s.title && s.title !== 'New conversation' && s.title !== 'Untitled') {
      process.stdout.write('    ' + chalk.dim(s.title.slice(0, 100)) + '\n');
    }
  }
  if (list.length > 20) process.stdout.write(chalk.dim(`  …+${list.length - 20} older\n`));
  process.stdout.write(chalk.dim('\n  load one with: /load <sessionId>\n\n'));
};

const renderTurnSummaryLine = (idx: number, t: ConversationTurn): void => {
  const head = chalk.bold.rgb(...PALETTE.teal)(`  ${idx + 1}.`);
  process.stdout.write(`${head} ${chalk.white(t.input.slice(0, 200))}\n`);
  if (t.result) {
    const tag = t.result.success
      ? chalk.rgb(...PALETTE.green)('     ✓')
      : chalk.rgb(...PALETTE.red)('     ✗');
    const meta = chalk.dim(
      `(${(t.result.durationMs / 1000).toFixed(1)}s · ${t.result.filesChanged.length} files${
        t.result.costUsd ? ` · $${t.result.costUsd.toFixed(4)}` : ''
      })`,
    );
    process.stdout.write(`${tag} ${chalk.dim((t.result.summary ?? '').slice(0, 200))} ${meta}\n`);
  }
};

// ---------- Internal slash handlers ----------

const parseArgv = (input: string): string[] => {
  const out: string[] = [];
  let buf = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && input[i + 1]) buf += input[++i];
      else buf += c;
    } else if (c === '"' || c === "'") quote = c;
    else if (/\s/.test(c)) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
    } else buf += c;
  }
  if (buf) out.push(buf);
  return out;
};

const togglePermission = (state: ReplState, flag: string, enable: boolean): string | null => {
  const key = flag.toLowerCase();
  if (key === 'all') {
    state.flags.allowFiles = enable;
    state.flags.allowShell = enable;
    state.flags.allowNetwork = enable;
    state.flags.allowWeb = enable;
    state.flags.allowMcp = enable;
    return `all → ${enable ? 'on' : 'off'}`;
  }
  const map: Record<string, keyof PermissionFlags> = {
    files: 'allowFiles',
    shell: 'allowShell',
    net: 'allowNetwork',
    network: 'allowNetwork',
    web: 'allowWeb',
    mcp: 'allowMcp',
    strict: 'strict',
  };
  const field = map[key];
  if (!field) return null;
  (state.flags as Record<string, boolean>)[field as string] = enable;
  return `${String(field)} → ${enable ? 'on' : 'off'}`;
};

const printTurns = (state: ReplState): void => {
  const turns = turnsOf(state);
  if (!turns.length) {
    info('No turns yet in this session.');
    return;
  }
  process.stdout.write('\n');
  turns.forEach((t, i) => renderTurnSummaryLine(i, t));
  process.stdout.write('\n');
};

const handleInternalSlash = async (
  state: ReplState,
  cmd: SlashCommand,
  rest: string[],
  closeRepl: () => void,
): Promise<boolean> => {
  switch (cmd.name) {
    case 'help':
      process.stdout.write(helpCard());
      return true;
    case 'exit':
      closeRepl();
      return true;
    case 'clear':
      process.stdout.write('\x1b[2J\x1b[H');
      return true;
    case 'new': {
      // Create a fresh conversation atomically (await the disk write) so the
      // next frame renders against the new state, not the stale old one.
      state.watcher?.close();
      state.conversation = await createConversation({
        projectPath: state.projectRoot,
        source: 'repl',
        mode: state.mode,
      });
      state.remoteUpdates = 0;
      attachWatcher(state);
      ok(`Started a fresh conversation: ${state.conversation.meta.id}`);
      return true;
    }
    case 'turns':
      // Reviewing the turn list counts as acknowledging remote updates.
      state.remoteUpdates = 0;
      printTurns(state);
      return true;
    case 'pwd':
      info(state.projectRoot);
      return true;
    case 'cd': {
      const target = rest.join(' ') || os.homedir();
      try {
        const resolved = path.resolve(state.projectRoot, target);
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
          err(`not a directory: ${resolved}`);
          return true;
        }
        process.chdir(resolved);
        state.projectRoot = findProjectRoot(resolved) ?? resolved;
        ensureProjectDir(state.projectRoot);
        ok(`cwd → ${state.projectRoot}`);
      } catch (e) {
        err(`cd failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      return true;
    }
    case 'mode': {
      const name = rest[0];
      const valid: Mode[] = [
        'fast',
        'balanced',
        'heavy',
        'plan',
        'execute',
        'audit',
        'debug',
        'architect',
        'offline-safe',
      ];
      if (!name) {
        info(`current mode: ${accent(state.mode)}   (one of: ${valid.join(', ')})`);
        return true;
      }
      if (!valid.includes(name as Mode)) {
        err(`unknown mode: ${name}. one of: ${valid.join(', ')}`);
        return true;
      }
      state.mode = name as Mode;
      ok(`mode → ${accent(state.mode)}`);
      return true;
    }
    case 'yes':
      state.autoApprove = !state.autoApprove;
      ok(`auto-approve → ${state.autoApprove ? 'on' : 'off'}`);
      return true;
    case 'strict':
      state.flags.strict = !state.flags.strict;
      ok(`strict → ${state.flags.strict ? 'on' : 'off'}`);
      return true;
    case 'allow': {
      const msg = togglePermission(state, rest[0] ?? '', true);
      if (!msg) err('usage: /allow files|shell|network|web|mcp|all');
      else ok(msg);
      return true;
    }
    case 'deny': {
      const msg = togglePermission(state, rest[0] ?? '', false);
      if (!msg) err('usage: /deny files|shell|network|web|mcp|all');
      else ok(msg);
      return true;
    }
    case 'retry': {
      const turns = turnsOf(state);
      const last = turns[turns.length - 1];
      if (!last) {
        err('No previous turn to retry.');
        return true;
      }
      info(`Retrying: ${last.input.slice(0, 120)}`);
      return false;
    }
    case 'undo': {
      try {
        execSync('git stash push -u -m forge-repl-undo', {
          cwd: state.projectRoot,
          stdio: 'ignore',
        });
        ok('Stashed local changes (git stash pop to restore).');
      } catch (e) {
        err(`/undo requires git; ${e instanceof Error ? e.message : String(e)}`);
      }
      return true;
    }
    case 'sessions':
      printSessionsList(state);
      return true;
    case 'load': {
      const id = rest[0];
      if (!id) {
        err('usage: /load <sessionId>');
        return true;
      }
      // Normalise: accept bare id, repl-<id>, chat-<id>, or conv-<id>.
      const sessionId =
        id.startsWith('repl-') || id.startsWith('chat-') || id.startsWith('conv-')
          ? id
          : `repl-${id}`;
      const loaded = loadConversation(state.projectRoot, sessionId);
      if (!loaded) {
        err(`No conversation found for ${sessionId}`);
        return true;
      }
      state.watcher?.close();
      state.conversation = loaded;
      state.remoteUpdates = 0;
      attachWatcher(state);
      ok(
        `Loaded ${loaded.turns.length} turn${loaded.turns.length === 1 ? '' : 's'} from ${sessionId}  (${loaded.meta.source.toUpperCase()})`,
      );
      printResumedSummary(state);
      return true;
    }
    case 'continue': {
      const list = listConversations(state.projectRoot).filter(
        (s) => s.id !== state.conversation.meta.id,
      );
      if (!list.length) {
        info('No other conversations to continue.');
        return true;
      }
      const target = list[0]; // newest first
      const loaded = loadConversation(state.projectRoot, target.id);
      if (!loaded) {
        err(`Could not load ${target.id}`);
        return true;
      }
      state.watcher?.close();
      state.conversation = loaded;
      state.remoteUpdates = 0;
      attachWatcher(state);
      ok(
        `Continuing ${loaded.meta.id} (${loaded.meta.source.toUpperCase()}) with ${loaded.turns.length} prior turn${loaded.turns.length === 1 ? '' : 's'}.`,
      );
      printResumedSummary(state);
      return true;
    }
    case 'rename': {
      const title = rest.join(' ').trim();
      if (!title) {
        info(`current title: ${accent(state.conversation.meta.title)}`);
        return true;
      }
      await renameConversation(state.projectRoot, state.conversation.meta.id, title);
      // Refresh meta from disk.
      const reloaded = loadConversation(state.projectRoot, state.conversation.meta.id);
      if (reloaded) state.conversation = reloaded;
      ok(`Renamed to: ${accent(title)}`);
      return true;
    }
    case 'delete': {
      const raw = rest[0];
      const targetId = raw
        ? raw.startsWith('repl-') || raw.startsWith('chat-') || raw.startsWith('conv-')
          ? raw
          : `repl-${raw}`
        : state.conversation.meta.id;
      const isCurrent = targetId === state.conversation.meta.id;
      const target = loadConversation(state.projectRoot, targetId);
      if (!target) {
        err(`No conversation ${targetId}`);
        return true;
      }
      const gone = deleteConversation(state.projectRoot, targetId);
      if (!gone) {
        err(`Delete failed for ${targetId}`);
        return true;
      }
      if (isCurrent) {
        // Roll over to a fresh conversation so the user has somewhere to type.
        state.watcher?.close();
        state.conversation = await createConversation({
          projectPath: state.projectRoot,
          source: 'repl',
          mode: state.mode,
        });
        state.remoteUpdates = 0;
        attachWatcher(state);
      }
      ok(`Deleted ${targetId}.`);
      return true;
    }
    case 'export': {
      const destRaw = rest.join(' ').trim();
      const dest = destRaw
        ? path.resolve(state.projectRoot, destRaw)
        : path.join(state.projectRoot, `${state.conversation.meta.id}.json`);
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const payload = JSON.stringify(state.conversation, null, 2);
        fs.writeFileSync(dest, payload, 'utf8');
        ok(
          `Exported ${state.conversation.turns.length} turn${state.conversation.turns.length === 1 ? '' : 's'} → ${dest}`,
        );
      } catch (e) {
        err(`export failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      return true;
    }
    default:
      return false;
  }
};

// ---------- Commander passthrough ----------

/** Recursively install exitOverride on every command so neither the root nor
 *  any subcommand ever calls process.exit — even on help/version/parse errors. */
const installExitOverride = (cmd: Command): void => {
  cmd.exitOverride();
  for (const sub of cmd.commands) installExitOverride(sub);
};

const runCommanderPassthrough = async (
  program: Command,
  argv: string[],
  _state?: ReplState,
): Promise<void> => {
  installExitOverride(program);
  process.exitCode = 0;

  // Safety net: if anything in the passthrough tries to call process.exit
  // directly (e.g. a subcommand action with a legacy exit), intercept it so
  // the REPL stays alive.
  const originalExit = process.exit;
  let interceptedCode: number | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process as unknown as { exit: (code?: number) => never }).exit = ((code?: number) => {
    interceptedCode = code;
    throw Object.assign(new Error('[REPL intercepted process.exit]'), {
      __replInterceptedExit: true,
      __code: code,
    });
    // never reached
  }) as typeof process.exit;

  try {
    await program.parseAsync(['node', 'forge', ...argv]);
  } catch (e) {
    const isIntercept = e && typeof e === 'object' && '__replInterceptedExit' in (e as object);
    if (isIntercept) {
      // Give the user visible context: a command tried to exit the process.
      const code = (e as { __code?: number }).__code ?? 0;
      if (code !== 0) {
        err(`/${argv[0]} exited with code ${code} (REPL stayed open).`);
      } else {
        // exit code 0 is usually an "OK, I'm done" signal — stay silent.
      }
    } else if (e instanceof CommanderError) {
      const quiet = new Set([
        'commander.help',
        'commander.version',
        'commander.helpDisplayed',
        'commander.missingMandatoryOptionValue',
      ]);
      if (!quiet.has(e.code)) {
        err(`/${argv[0]}: ${e.message}`);
      }
      // help-like exits are expected — the help card was already printed.
    } else {
      err(`/${argv[0]} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  } finally {
    // Restore the real exit so the next Ctrl+D / clean shutdown still works.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process as unknown as { exit: typeof process.exit }).exit = originalExit;
    if (interceptedCode !== undefined && interceptedCode !== 0) {
      process.exitCode = interceptedCode;
    }
  }
};

// ---------- Orchestrator turn ----------

const runTaskTurn = async (
  state: ReplState,
  rawInput: string,
  semantic?: SemanticExpansion,
): Promise<void> => {
  const now = new Date().toISOString();
  const effectiveInput = semantic?.prompt ?? rawInput;
  const turn: ConversationTurn = {
    id: newTurnId(),
    at: now,
    input: rawInput,
    mode: semantic?.mode ?? state.mode,
    status: 'running',
  };
  // Local-first in-memory update so status bar reflects the turn immediately,
  // then persist. The watcher will re-deliver this event to our own process;
  // we dedupe by id in applyRemoteUpdate.
  state.conversation.turns.push(turn);
  // Submitting a turn implicitly acknowledges any remote updates seen since
  // the last prompt — the user has now participated again.
  state.remoteUpdates = 0;
  try {
    await appendUserTurn(state.projectRoot, state.conversation.meta.id, turn);
  } catch (e) {
    warn(`turn persist failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  state.running = true;
  state.abort = new AbortController();

  const composed = composeDescription(effectiveInput, state.conversation.turns.slice(0, -1));
  process.stdout.write('\n');
  try {
    const out = await orchestrateRun({
      input: effectiveInput,
      description: composed,
      mode: turn.mode,
      autoApprove: state.autoApprove || semantic?.autoApprove,
      planOnly: turn.mode === 'plan' || Boolean(semantic?.planOnly),
      flags: { ...state.flags },
    });
    const r = out.result;
    const result = {
      taskId: out.task.id,
      success: r.success,
      summary: r.summary ?? '',
      filesChanged: r.filesChanged ?? [],
      durationMs: r.durationMs ?? 0,
      costUsd: r.costUsd,
    };
    const status: TurnStatus = r.success ? 'done' : 'failed';
    turn.taskId = out.task.id;
    turn.status = status;
    turn.result = result;
    state.localTaskIds.add(out.task.id);
    try {
      await attachTurnResult(state.projectRoot, state.conversation.meta.id, {
        turnId: turn.id,
        taskId: out.task.id,
        result,
        status,
      });
    } catch (e) {
      warn(`turn result persist failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    process.stdout.write('\n');
    if (r.success) {
      const costBit = r.costUsd && r.costUsd > 0 ? chalk.dim(` · $${r.costUsd.toFixed(4)}`) : '';
      ok(
        `turn ${turnsOf(state).length} done  ${chalk.dim(
          `(${((r.durationMs ?? 0) / 1000).toFixed(1)}s · ${r.filesChanged?.length ?? 0} files)`,
        )}${costBit}`,
      );
      if (r.summary) {
        process.stdout.write('\n' + renderMarkdown(r.summary, { indent: 2 }) + '\n');
      }
      if (r.filesChanged?.length) {
        process.stdout.write('\n');
        for (const f of r.filesChanged.slice(0, 8)) {
          process.stdout.write(`   ${chalk.rgb(...PALETTE.teal)('▸')} ${chalk.white(f)}\n`);
        }
        if (r.filesChanged.length > 8) {
          process.stdout.write(chalk.dim(`   …+${r.filesChanged.length - 8} more\n`));
        }
      }
    } else {
      err(`turn ${turnsOf(state).length} failed`);
      if (r.summary) {
        process.stdout.write('\n' + renderMarkdown(r.summary, { indent: 2 }) + '\n');
      }
    }
  } catch (e) {
    const result = {
      taskId: 'unknown',
      success: false,
      summary: e instanceof Error ? e.message : String(e),
      filesChanged: [],
      durationMs: 0,
    };
    turn.status = 'failed';
    turn.result = result;
    try {
      await attachTurnResult(state.projectRoot, state.conversation.meta.id, {
        turnId: turn.id,
        taskId: turn.taskId ?? 'unknown',
        result,
        status: 'failed',
      });
    } catch {
      /* double-fault — already reported via err() below */
    }
    err(`Turn crashed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    state.running = false;
    state.abort = undefined;
  }
};

// ---------- Watcher wiring ----------

/**
 * Attach a watcher to the active conversation file. When another writer
 * appends an event (another terminal, the UI, or a subagent recording a
 * task result that we didn't originate), sync it into local state and
 * increment the unread counter. The cursor redraws on the next keystroke
 * via statusLine().
 */
const attachWatcher = (state: ReplState): void => {
  state.watcher?.close();
  state.watcher = watchConversationFile(state.projectRoot, state.conversation.meta.id, (update) => {
    let remoteAdded = 0;
    for (const nt of update.newTurns) {
      // Did we author this turn? If yes, the local push already accounted
      // for it; skip to avoid duplication.
      const already = state.conversation.turns.some((t) => t.id === nt.id);
      if (already) continue;
      state.conversation.turns.push(nt);
      remoteAdded++;
    }
    for (const { turn } of update.completedTurns) {
      const mine = turn.taskId ? state.localTaskIds.has(turn.taskId) : false;
      if (mine) continue;
      const idx = state.conversation.turns.findIndex((t) => t.id === turn.id);
      if (idx >= 0) state.conversation.turns[idx] = turn;
      // If the completed turn arrived as a pure result without the user
      // event, the newTurns branch above already added it.
    }
    if (
      remoteAdded ||
      update.completedTurns.some((c) => !state.localTaskIds.has(c.turn.taskId ?? ''))
    ) {
      state.remoteUpdates += remoteAdded;
    }
  });
};

// ---------- Entry point ----------

export const startRepl = async (
  program: Command,
  opts: { resumeSessionId?: string } = {},
): Promise<void> => {
  bootstrap();
  // During interactive REPL, silence logger stderr/stdout output — provider
  // failures etc. would otherwise corrupt the rendered frame. File logging
  // continues so the user can inspect ~/.forge/logs/forge.log after.
  setConsoleOutput(false);
  const cfg = loadGlobalConfig();
  const projectRoot = findProjectRoot() ?? process.cwd();
  ensureProjectDir(projectRoot);

  // Pull a readable "provider:model" label for the status line.
  const providers = (() => {
    try {
      return listProviders().map((p) => p.name);
    } catch {
      return [];
    }
  })();
  const provider = cfg.provider ?? providers[0] ?? 'local';
  const modelId =
    cfg.models?.[cfg.defaultMode as keyof typeof cfg.models] ?? cfg.models?.balanced ?? 'default';

  // Resolve conversation: resume an existing one (accepting any prefix), or
  // create a fresh REPL-sourced conversation.
  let conversation: Conversation | null = null;
  if (opts.resumeSessionId) {
    const normalised =
      opts.resumeSessionId.startsWith('repl-') ||
      opts.resumeSessionId.startsWith('chat-') ||
      opts.resumeSessionId.startsWith('conv-')
        ? opts.resumeSessionId
        : `repl-${opts.resumeSessionId}`;
    conversation = loadConversation(projectRoot, normalised);
  }
  if (!conversation) {
    conversation = await createConversation({
      projectPath: projectRoot,
      source: 'repl',
      mode: (cfg.defaultMode as Mode) ?? 'balanced',
    });
  }

  const state: ReplState = {
    conversation,
    projectRoot,
    mode: (cfg.defaultMode as Mode) ?? 'balanced',
    flags: {
      skipRoutine: false,
      allowFiles: false,
      allowShell: false,
      allowNetwork: false,
      allowWeb: false,
      allowMcp: false,
      strict: false,
      nonInteractive: false,
    },
    autoApprove: false,
    running: false,
    provider,
    modelId: String(modelId),
    localTaskIds: new Set<string>(),
    remoteUpdates: 0,
  };
  attachWatcher(state);

  process.stdout.write(hero(state, pkg.version ?? '0.1.0'));
  if (conversation.turns.length) printResumedSummary(state);

  // Fire-and-forget update check on every REPL start. `shouldCheckNow` in the
  // updater rate-limits actual network hits to `cfg.update.checkIntervalHours`
  // (default 24h) so this is cheap (cache read) on repeat boots. Print a
  // single-line notice when an update is available and the user hasn't
  // opted out via `update.notify = false`.
  void (async () => {
    try {
      const res = await checkForUpdate();
      if (!res || !res.hasUpdate) return;
      if (!loadGlobalConfig().update.notify) return;
      const msg =
        '  ' +
        chalk.bgRgb(...PALETTE.violet).white(' update ') +
        '  ' +
        chalk.white(`Forge ${res.latestVersion} available`) +
        chalk.dim(` (you're on ${currentVersion()}).`) +
        chalk.dim(' Run ') +
        chalk.bold('/update') +
        chalk.dim(' to install · ') +
        chalk.bold('/update ignore ' + res.latestVersion) +
        chalk.dim(' to silence.\n');
      process.stdout.write('\n' + msg + '\n');
    } catch {
      /* best-effort — never block the REPL */
    }
  })();

  const history = loadHistory();

  let editor: LineEditor | null = null;
  let lastSigint = 0;
  let closed = false;

  const hooks: LineEditorHooks = {
    prompt: () => prompt(state),
    statusLine: () => statusLine(state),
    suggestions: (input) => {
      const ranked = rankSlash(input, 8);
      return ranked.map<Suggestion>((r) => ({
        label: r.label,
        value: r.value,
        description: r.description,
        score: r.score,
      }));
    },
    history,
    isRunning: () => state.running,
    onCancel: () => {
      const now = Date.now();
      // During a running task: cancel it.
      if (state.running) {
        warn('Cancelling current task …');
        try {
          process.kill(process.pid, 'SIGINT');
        } catch {
          /* noop */
        }
        state.running = false;
        return;
      }
      // Idle + buffer was empty (editor handles the non-empty case itself).
      // Two presses within 2s exits. Otherwise just print a hint.
      if (now - lastSigint < 2000) {
        editor?.close();
        return;
      }
      lastSigint = now;
      process.stdout.write('\n' + chalk.dim('  (Ctrl+C again to exit · Ctrl+D also exits)\n'));
    },
    onExit: () => {
      editor?.close();
    },
    onSubmit: async (line, picked) => {
      if (!line) return;

      appendHistory(line);
      history.push(line);

      // Slash command?
      if (line.startsWith('/')) {
        const body = line.slice(1);
        const parts = parseArgv(body);
        const head = (parts[0] ?? '').toLowerCase();
        const rest = parts.slice(1);
        const cmd = findSlash(head);
        if (!cmd) {
          err(`Unknown command: /${head}  ${chalk.dim('(type /help)')}`);
          return;
        }
        if (cmd.kind === 'internal') {
          const handled = await handleInternalSlash(state, cmd, rest, () => {
            closed = true;
            editor?.close();
          });
          // retry falls through to run
          if (cmd.name === 'retry' && !handled) {
            const turns = turnsOf(state);
            const last = turns[turns.length - 1];
            if (last) await runTaskTurn(state, last.input);
          }
          return;
        }
        if (cmd.kind === 'passthrough') {
          await runCommanderPassthrough(program, [cmd.passthroughTo ?? cmd.name, ...rest]);
          return;
        }
        if (cmd.kind === 'semantic' && cmd.template) {
          const args = rest.join(' ');
          const expansion = cmd.template(args);
          await runTaskTurn(state, `/${cmd.name} ${args}`.trim(), expansion);
          return;
        }
        return;
      }

      // Bare text → task turn
      await runTaskTurn(state, line);
      void picked; // unused for bare text
    },
  };

  editor = new LineEditor(hooks);
  await editor.run();

  // Tear down watcher; otherwise fs watchers keep the process alive.
  state.watcher?.close();
  // Restore logger console output for subsequent CLI invocations in the
  // same process (unusual, but safe to do).
  setConsoleOutput(true);

  if (!closed) process.stdout.write('\n');
  process.stdout.write(dim(`  session ${state.conversation.meta.id} saved.`) + '\n');
  process.stdout.write(
    dim(`  resume with: forge repl --resume ${state.conversation.meta.id}`) + '\n\n',
  );
};
