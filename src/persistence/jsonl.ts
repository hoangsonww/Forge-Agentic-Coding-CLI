/**
 * Append-only JSONL writer. Failures to serialize are logged and dropped —
 * never crash the pipeline for a log write.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import * as readline from 'readline';
import { redact } from '../security/redact';

export const appendJsonl = (filePath: string, entry: unknown): void => {
  try {
    const line = JSON.stringify(redact(entry)) + '\n';
    fs.appendFileSync(filePath, line, { encoding: 'utf8' });
  } catch (err) {
    process.stderr.write(`[forge] jsonl write failed for ${filePath}: ${String(err)}\n`);
  }
};

export const readJsonl = async <T = unknown>(filePath: string): Promise<T[]> => {
  if (!fs.existsSync(filePath)) return [];
  const out: T[] = [];
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // Corrupted line: skip, don't abort. Matches "skip invalid lines" rule.
    }
  }
  return out;
};

export const streamJsonl = async function* <T = unknown>(
  filePath: string,
): AsyncGenerator<T, void, void> {
  if (!fs.existsSync(filePath)) return;
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line) as T;
    } catch {
      // skip
    }
  }
};
