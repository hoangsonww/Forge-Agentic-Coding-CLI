import chalk from 'chalk';
import { spawn } from 'child_process';
import { ForgeEvent, Severity } from '../types';
import { loadGlobalConfig } from '../config/loader';
import { redact } from '../security/redact';

type Channel = 'cli' | 'ui' | 'os';

const severityPrefix = (s: Severity): string => {
  switch (s) {
    case 'info':
      return chalk.blue('ℹ');
    case 'warning':
      return chalk.yellow('⚠');
    case 'error':
      return chalk.red('✖');
    case 'critical':
      return chalk.bgRed.white.bold(' ! ');
  }
};

const sendOsNotification = (title: string, body: string): void => {
  try {
    if (process.platform === 'darwin') {
      spawn(
        'osascript',
        [
          '-e',
          `display notification "${body.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`,
        ],
        { detached: true, stdio: 'ignore' },
      ).unref();
    } else if (process.platform === 'linux') {
      spawn('notify-send', [title, body], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    }
  } catch {
    // Non-fatal.
  }
};

export const notify = (event: ForgeEvent, channels: Channel[] = ['cli']): void => {
  const cfg = loadGlobalConfig();
  if (!cfg.notifications.enabled) return;
  const allow = new Set([...cfg.notifications.channels, ...channels]);

  const sanitized = redact(event.payload) as Record<string, unknown> | undefined;

  if (allow.has('cli') && cfg.notifications.verbosity !== 'minimal') {
    const line = `${severityPrefix(event.severity)} ${chalk.dim(event.type)} ${event.message}`;
    if (event.severity === 'error' || event.severity === 'critical') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
    if (cfg.notifications.verbosity === 'verbose' && sanitized) {
      process.stdout.write(chalk.dim(`   ${JSON.stringify(sanitized)}\n`));
    }
  }
  if (allow.has('os') && cfg.notifications.osNotifications) {
    sendOsNotification(event.type, event.message);
  }
};
