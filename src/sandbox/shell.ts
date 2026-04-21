import { spawn, SpawnOptions } from 'child_process';
import { ForgeRuntimeError } from '../types/errors';
import { Risk } from '../types';

/**
 * Shell command execution with risk classification and blocklisting. This module provides utilities to classify the risk of shell commands based on regex patterns, determine if a command is blocklisted, and execute commands in a sandboxed environment with timeouts and output capture. The blocklist includes patterns for destructive operations (like `rm -rf /`), privilege escalation (`sudo`), and other high-risk commands. The risk classification allows the system to warn users about potentially dangerous commands without outright blocking them.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

// Commands we actively BLOCK unless the user has explicitly unlocked them.
const BLOCKLIST: RegExp[] = [
  /\brm\s+-rf\s+\/($|\s)/,
  /\brm\s+-rf\s+~($|\s|\/)/,
  /\bsudo\s+/,
  /\bdd\s+.*of=\/dev\//,
  /\bmkfs(\.\w+)?\s+/,
  /:(){\s*:\|:&\s*};:/, // fork bomb
  /\bchmod\s+-R\s+/, // conservative: recursive chmod requires approval
  /\bchown\s+-R\s+/,
  /\bcurl\s+[^|]*\|\s*(bash|sh)\b/, // pipe-to-shell from curl
  /\bwget\s+.*\s*-O-\s*\|\s*(bash|sh)\b/,
];

// Patterns that bump risk without blocking.
const HIGH_RISK: RegExp[] = [
  /\bgit\s+push\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bnpm\s+publish\b/,
  /\bdocker\s+push\b/,
  /\bterraform\s+(apply|destroy)\b/,
  /\bkubectl\s+(delete|apply)\b/,
];

const MEDIUM_RISK: RegExp[] = [
  /\bnpm\s+(install|uninstall|ci)\b/,
  /\bpnpm\s+(install|add|remove)\b/,
  /\byarn\s+(add|remove|install)\b/,
  /\bpip\s+install\b/,
  /\bcargo\s+(install|build|run)\b/,
  /\bgit\s+commit\b/,
  /\bmake\b/,
];

export const classifyCommandRisk = (command: string): Risk => {
  const c = command.trim();
  for (const pat of BLOCKLIST) {
    if (pat.test(c)) return 'critical';
  }
  for (const pat of HIGH_RISK) {
    if (pat.test(c)) return 'high';
  }
  for (const pat of MEDIUM_RISK) {
    if (pat.test(c)) return 'medium';
  }
  return 'low';
};

export const isBlocked = (command: string): boolean => {
  const c = command.trim();
  return BLOCKLIST.some((p) => p.test(c));
};

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
}

export interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  stdin?: string;
  maxBufferBytes?: number;
}

export const runCommand = async (command: string, options: RunOptions): Promise<CommandResult> => {
  if (isBlocked(command)) {
    throw new ForgeRuntimeError({
      class: 'sandbox_violation',
      message: `Command is blocklisted: ${command}`,
      retryable: false,
      recoveryHint: 'Rephrase the command to avoid destructive/privileged operations.',
    });
  }

  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxBuf = options.maxBufferBytes ?? 5 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    const start = Date.now();
    // Use a shell so pipes/redirects work, but always with a dedicated cwd and
    // a controlled environment.
    const opts: SpawnOptions = {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      shell: '/bin/bash',
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    };
    const child = spawn(command, opts);
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1000);
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > maxBuf) stdout = stdout.slice(0, maxBuf) + '\n[TRUNCATED]';
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > maxBuf) stderr = stderr.slice(0, maxBuf) + '\n[TRUNCATED]';
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new ForgeRuntimeError({
          class: 'tool_error',
          message: `Failed to spawn: ${command} (${String(err)})`,
          retryable: true,
          cause: err,
        }),
      );
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal,
        durationMs: Date.now() - start,
        timedOut,
      });
    });

    if (options.stdin) {
      child.stdin?.end(options.stdin);
    }
  });
};
