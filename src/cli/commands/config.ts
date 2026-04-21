/**
 * Configuration command: read/write config keys and print config/data paths.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { ZodError } from 'zod';
import { bootstrap } from '../bootstrap';
import { loadGlobalConfig, updateGlobalConfig } from '../../config/loader';
import { paths } from '../../config/paths';
import { ok, info, err } from '../ui';

const setNested = (obj: Record<string, any>, keyPath: string, value: any): void => {
  const parts = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
};

const coerce = (raw: string): any => {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
  return raw;
};

export const configCommand = new Command('config').description('Configuration.');

configCommand
  .command('get [key]')
  .description('Read a config key (or the whole config if omitted).')
  .action((key?: string) => {
    bootstrap();
    const cfg = loadGlobalConfig() as any;
    if (!key) {
      process.stdout.write(JSON.stringify(cfg, null, 2) + '\n');
      return;
    }
    const parts = key.split('.');
    let cur: any = cfg;
    for (const p of parts) cur = cur?.[p];
    process.stdout.write((cur === undefined ? '(unset)' : JSON.stringify(cur, null, 2)) + '\n');
  });

configCommand
  .command('set <key> <value>')
  .description('Write a config key. Dots denote nesting (e.g. update.channel).')
  .action((key: string, value: string) => {
    bootstrap();
    try {
      updateGlobalConfig((cfg) => {
        const clone = JSON.parse(JSON.stringify(cfg));
        setNested(clone, key, coerce(value));
        return clone;
      });
      ok(`Set ${key}=${value}`);
    } catch (e) {
      // Zod validation failures produce verbose JSON; flatten into a
      // one-line human-friendly error with the allowed enum values.
      if (e instanceof ZodError) {
        for (const issue of e.issues) {
          const path = issue.path.join('.');
          if (issue.code === 'invalid_enum_value' && 'options' in issue) {
            err(`invalid ${path}=${value} — allowed: ${issue.options.join(' · ')}`);
          } else {
            err(`invalid ${path}: ${issue.message}`);
          }
        }
        process.exitCode = 2;
        return;
      }
      err(e instanceof Error ? e.message : String(e));
      process.exitCode = 2;
    }
  });

configCommand
  .command('path')
  .description('Print config and data paths.')
  .action(() => {
    bootstrap();
    info('Paths:');
    for (const [k, v] of Object.entries(paths)) {
      process.stdout.write(`  ${k.padEnd(16)} ${v}\n`);
    }
  });
