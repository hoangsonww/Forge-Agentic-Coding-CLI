import { Command } from 'commander';
import { bootstrap } from '../bootstrap';
import { loadGlobalConfig, updateGlobalConfig } from '../../config/loader';
import { ok, info } from '../ui';

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
    updateGlobalConfig((cfg) => {
      const clone = JSON.parse(JSON.stringify(cfg));
      setNested(clone, key, coerce(value));
      return clone;
    });
    ok(`Set ${key}=${value}`);
  });

configCommand
  .command('path')
  .description('Print config and data paths.')
  .action(() => {
    bootstrap();
    const { paths } = require('../../config/paths');
    info('Paths:');
    for (const [k, v] of Object.entries(paths)) {
      process.stdout.write(`  ${k.padEnd(16)} ${v}\n`);
    }
  });
