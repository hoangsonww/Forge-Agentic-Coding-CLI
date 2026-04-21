import chalk from 'chalk';
import { spawn } from 'child_process';
import { ForgeEvent, Severity } from '../types';
import { loadGlobalConfig } from '../config/loader';
import { redact } from '../security/redact';

/**
 * Notification manager for Forge events. This module is responsible for handling notifications for various events that occur within the Forge system, such as model calls, errors, or other significant actions. It supports multiple channels for notifications, including CLI output and OS-level notifications, and allows users to configure their preferences for which channels to use and the verbosity of CLI notifications.
 *
 * The `notify` function is the main entry point, which takes a `ForgeEvent` and an optional list of channels to send the notification to. It checks the global configuration for notification preferences, formats the message appropriately for each channel, and sends the notification. For CLI notifications, it uses chalk to color-code messages based on severity. For OS notifications, it uses platform-specific commands to display notifications.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

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
