import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveSafe, isPathSafe } from '../../src/sandbox/fs';
import { classifyCommandRisk, isBlocked } from '../../src/sandbox/shell';
import { ForgeRuntimeError } from '../../src/types/errors';

describe('fs sandbox', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));
    fs.writeFileSync(path.join(tmp, 'inside.txt'), 'ok');
  });
  afterAll(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('resolves paths inside the project root', () => {
    const p = resolveSafe('inside.txt', { projectRoot: tmp }, 'read');
    expect(p.endsWith('inside.txt')).toBe(true);
  });

  it('rejects paths outside the project root', () => {
    expect(() => resolveSafe('/etc/hosts', { projectRoot: tmp }, 'read')).toThrow(
      ForgeRuntimeError,
    );
  });

  it('blocks always-forbidden paths even under tmp', () => {
    expect(isPathSafe('/etc/passwd', { projectRoot: tmp }, 'read')).toBe(false);
  });
});

describe('shell risk classification', () => {
  it('blocks rm -rf /', () => {
    expect(isBlocked('rm -rf /')).toBe(true);
  });
  it('blocks sudo', () => {
    expect(isBlocked('sudo apt install foo')).toBe(true);
  });
  it('flags git push as high risk', () => {
    expect(classifyCommandRisk('git push origin main')).toBe('high');
  });
  it('flags npm install as medium risk', () => {
    expect(classifyCommandRisk('npm install lodash')).toBe('medium');
  });
  it('keeps innocuous commands low risk', () => {
    expect(classifyCommandRisk('ls -la')).toBe('low');
  });
});
