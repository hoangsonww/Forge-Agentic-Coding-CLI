/**
 * Post-edit code formatter. Runs the project's preferred formatter against
 * the touched files after successful plan steps. Non-blocking: formatter
 * failure is logged but doesn't fail the task.
 */
import * as path from 'path';
import { runCommand } from '../sandbox/shell';
import { log } from '../logging/logger';

interface FormatterRule {
  extensions: string[];
  probe: string;
  format: (files: string[]) => string;
}

const RULES: FormatterRule[] = [
  {
    extensions: [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.json',
      '.md',
      '.yaml',
      '.yml',
      '.css',
    ],
    probe: 'node_modules/.bin/prettier',
    format: (files) => `./node_modules/.bin/prettier --write ${files.map(q).join(' ')}`,
  },
  {
    extensions: ['.py'],
    probe: 'command -v black',
    format: (files) => `black -q ${files.map(q).join(' ')}`,
  },
  {
    extensions: ['.py'],
    probe: 'command -v ruff',
    format: (files) => `ruff format ${files.map(q).join(' ')}`,
  },
  {
    extensions: ['.go'],
    probe: 'command -v gofmt',
    format: (files) => `gofmt -w ${files.map(q).join(' ')}`,
  },
  {
    extensions: ['.rs'],
    probe: 'command -v rustfmt',
    format: (files) => `rustfmt ${files.map(q).join(' ')}`,
  },
];

const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

const hasProbe = async (cwd: string, probe: string): Promise<boolean> => {
  try {
    const r = await runCommand(probe, { cwd, timeoutMs: 3000 });
    return r.exitCode === 0;
  } catch {
    return false;
  }
};

export const formatTouchedFiles = async (
  projectRoot: string,
  files: string[],
): Promise<{ formatted: number; skipped: number }> => {
  if (!files.length) return { formatted: 0, skipped: 0 };
  let formatted = 0;
  let skipped = 0;
  const groups = new Map<FormatterRule, string[]>();
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const rule = RULES.find((r) => r.extensions.includes(ext));
    if (!rule) {
      skipped++;
      continue;
    }
    groups.set(rule, [...(groups.get(rule) ?? []), f]);
  }
  for (const [rule, batch] of groups) {
    if (!(await hasProbe(projectRoot, rule.probe))) {
      skipped += batch.length;
      continue;
    }
    try {
      const res = await runCommand(rule.format(batch), {
        cwd: projectRoot,
        timeoutMs: 60_000,
      });
      if (res.exitCode === 0) formatted += batch.length;
      else log.debug('formatter non-zero exit', { stderr: res.stderr.slice(0, 200) });
    } catch (err) {
      log.debug('formatter skipped', { err: String(err) });
    }
  }
  return { formatted, skipped };
};
