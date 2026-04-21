import * as fs from 'fs';
import * as path from 'path';
import { paths } from '../config/paths';
import { redact } from '../security/redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let currentLevel: LogLevel = (process.env.FORGE_LOG_LEVEL as LogLevel) || 'info';

/**
 *  When false, warn/error/info are NOT written to stderr/stdout — only to
 *  the rotating file under ~/.forge/logs/forge.log. Used by the interactive
 *  REPL so provider errors don't corrupt the rendered TUI frame. File
 *  logging is unaffected, so the same info is still discoverable after the
 *  session.
 *
 *  @author Son Nguyen <hoangson091104@gmail.com>
 */
let consoleEnabled = !process.env.FORGE_LOG_QUIET;

export const setLevel = (level: LogLevel): void => {
  currentLevel = level;
};

export const setConsoleOutput = (enabled: boolean): void => {
  consoleEnabled = enabled;
};

export const getLevel = (): LogLevel => currentLevel;

const shouldLog = (level: LogLevel): boolean => LEVEL_RANK[level] >= LEVEL_RANK[currentLevel];

const logFile = (): string => {
  try {
    fs.mkdirSync(paths.logs, { recursive: true });
  } catch {
    // ignore — best effort
  }
  return path.join(paths.logs, 'forge.log');
};

let fileStream: fs.WriteStream | null = null;
const getStream = (): fs.WriteStream | null => {
  if (fileStream) return fileStream;
  try {
    // Lazy rotation check on first write (cheap). Daemon also runs it.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { rotateIfNeeded } = require('./rotation');
      rotateIfNeeded();
    } catch {
      /* ignore */
    }
    fileStream = fs.createWriteStream(logFile(), { flags: 'a' });
    return fileStream;
  } catch {
    return null;
  }
};

const format = (level: LogLevel, msg: string, meta?: Record<string, unknown>): string => {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  return JSON.stringify(entry);
};

const write = (level: LogLevel, msg: string, meta?: Record<string, unknown>): void => {
  if (!shouldLog(level)) return;
  const line = format(level, msg, meta);
  const stream = getStream();
  stream?.write(line + '\n');
  if (!consoleEnabled) return;
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else if (process.env.FORGE_LOG_STDOUT) {
    process.stdout.write(line + '\n');
  }
};

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};

export const closeLogs = (): void => {
  if (fileStream) {
    fileStream.end();
    fileStream = null;
  }
};
