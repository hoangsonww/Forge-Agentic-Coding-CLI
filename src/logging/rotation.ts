/**
 * Log rotation. Caps `forge.log` at N bytes; when exceeded, renames to
 * `forge.log.1` and starts fresh. Keeps up to `keep` rotations. Cheap and
 * synchronous — runs once at startup and periodically from the daemon.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import * as fs from 'fs';
import * as path from 'path';
import { paths } from '../config/paths';

export interface RotateOptions {
  maxBytes?: number;
  keep?: number;
}

export const rotateIfNeeded = (opts: RotateOptions = {}): { rotated: boolean; size?: number } => {
  const maxBytes = opts.maxBytes ?? 20 * 1024 * 1024;
  const keep = opts.keep ?? 5;
  const logFile = path.join(paths.logs, 'forge.log');
  if (!fs.existsSync(logFile)) return { rotated: false };
  const size = fs.statSync(logFile).size;
  if (size < maxBytes) return { rotated: false, size };

  for (let i = keep - 1; i >= 1; i--) {
    const older = `${logFile}.${i}`;
    const newer = `${logFile}.${i + 1}`;
    if (fs.existsSync(older)) {
      try {
        fs.renameSync(older, newer);
      } catch {
        /* ignore */
      }
    }
  }
  try {
    fs.renameSync(logFile, `${logFile}.1`);
  } catch {
    /* ignore */
  }
  // Trim the oldest
  const oldest = `${logFile}.${keep + 1}`;
  if (fs.existsSync(oldest)) {
    try {
      fs.unlinkSync(oldest);
    } catch {
      /* ignore */
    }
  }
  return { rotated: true, size };
};
