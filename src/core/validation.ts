/**
 * Post-step validation gate.
 *
 * When an executor step writes files, we give the project a quick sanity
 * check before returning success. Any failure is surfaced to the model as
 * structured feedback so it can repair the file (or escalate). Validators
 * are discovered conservatively — we only run what the project clearly
 * opted into (package.json scripts, a visible tsconfig).
 */
import * as fs from 'fs';
import * as path from 'path';
import { runCommand } from '../sandbox/shell';
import { log } from '../logging/logger';

export interface ValidationResult {
  ok: boolean;
  ran: string[];
  /**
   * Compact failure digest safe to feed back into the model. Truncated.
   */
  message?: string;
}

const TRUNCATE = 2_000;

const truncate = (s: string): string =>
  s.length <= TRUNCATE ? s : s.slice(0, TRUNCATE) + `\n…[truncated ${s.length - TRUNCATE}B]`;

const readPackageScripts = (projectRoot: string): Record<string, string> | null => {
  const pkg = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkg)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(pkg, 'utf8'));
    return (parsed.scripts ?? null) as Record<string, string> | null;
  } catch {
    return null;
  }
};

/**
 * Pick validators the project has configured. Order matters — cheapest
 * first so a type error surfaces before lint noise.
 */
const pickValidators = (projectRoot: string): string[] => {
  const scripts = readPackageScripts(projectRoot);
  const cmds: string[] = [];
  if (scripts) {
    if (scripts.typecheck) cmds.push('npm run -s typecheck');
    else if (scripts['type-check']) cmds.push('npm run -s type-check');
    if (scripts.lint) cmds.push('npm run -s lint');
  }
  if (!cmds.length && fs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
    cmds.push('npx --no-install tsc -p tsconfig.json --noEmit');
  }
  return cmds;
};

/**
 * Run the configured validators in sequence. Stops at the first failure so
 * the model sees one focused error, not a cascade.
 */
export const runValidation = async (
  projectRoot: string,
  opts: { timeoutMs?: number } = {},
): Promise<ValidationResult> => {
  const cmds = pickValidators(projectRoot);
  if (!cmds.length) return { ok: true, ran: [] };

  const ran: string[] = [];
  for (const command of cmds) {
    ran.push(command);
    try {
      const res = await runCommand(command, {
        cwd: projectRoot,
        timeoutMs: opts.timeoutMs ?? 60_000,
      });
      if (res.exitCode !== 0 || res.timedOut) {
        const output = [res.stdout, res.stderr].filter(Boolean).join('\n').trim();
        return {
          ok: false,
          ran,
          message: `Validation failed: \`${command}\` (exit=${res.exitCode}${
            res.timedOut ? ', timed out' : ''
          })\n\n${truncate(output || '(no output)')}`,
        };
      }
    } catch (err) {
      log.debug('validator threw', { command, err: String(err) });
      return {
        ok: false,
        ran,
        message: `Validation threw while running \`${command}\`: ${String(err)}`,
      };
    }
  }
  return { ok: true, ran };
};

/**
 * Exposed for tests so the detection logic can be exercised without spawning
 * child processes.
 */
export const _pickValidatorsForTest = pickValidators;
