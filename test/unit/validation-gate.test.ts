/**
 * Validation gate tests. These are mostly focused on the validator detection logic, since the execution is just a thin wrapper around execa and we don't want to have tests that depend on global tools like tsc or eslint. The main points are to ensure that:
 *   The presence of a typecheck script in package.json is correctly detected and preferred.
 *   The presence of a lint script is also detected and included.
 *   The fallback to tsc --noEmit when a tsconfig.json is present but no scripts are defined works as expected.
 *   No validators are returned when nothing is configured.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { _pickValidatorsForTest as pick, runValidation } from '../../src/core/validation';

let tmp = '';

const write = (name: string, content: string): void => {
  fs.writeFileSync(path.join(tmp, name), content);
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-val-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('validation gate — validator detection', () => {
  it('prefers package.json scripts.typecheck when present', () => {
    write('package.json', JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } }));
    const cmds = pick(tmp);
    expect(cmds.some((c) => c.includes('typecheck'))).toBe(true);
  });

  it('adds lint when the script exists', () => {
    write('package.json', JSON.stringify({ scripts: { typecheck: 'tsc', lint: 'eslint .' } }));
    const cmds = pick(tmp);
    expect(cmds.some((c) => c.includes('lint'))).toBe(true);
  });

  it('falls back to tsc --noEmit when tsconfig exists but no scripts', () => {
    write('tsconfig.json', '{}');
    const cmds = pick(tmp);
    expect(cmds[0]).toContain('tsc');
    expect(cmds[0]).toContain('--noEmit');
  });

  it('returns no validators when nothing is configured', () => {
    expect(pick(tmp)).toEqual([]);
  });
});

describe('validation gate — execution', () => {
  it('is a no-op (ok=true) when no validators are configured', async () => {
    const res = await runValidation(tmp, { timeoutMs: 5_000 });
    expect(res.ok).toBe(true);
    expect(res.ran).toEqual([]);
  });

  it('fails with a compact message when the validator command exits non-zero', async () => {
    // Use a one-off script that always exits 1 so this test doesn't depend
    // on a global tsc/npm install.
    write('package.json', JSON.stringify({ scripts: { typecheck: 'exit 1' } }));
    const res = await runValidation(tmp, { timeoutMs: 5_000 });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Validation failed/);
    expect(res.ran[0]).toContain('typecheck');
  });
});
