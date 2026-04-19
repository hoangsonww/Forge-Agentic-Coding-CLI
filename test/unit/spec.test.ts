import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadSpec } from '../../src/core/spec';

describe('loadSpec', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-spec-'));
  });
  afterAll(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('parses title + task list', () => {
    const fp = path.join(tmp, 'spec.md');
    fs.writeFileSync(
      fp,
      `# My Feature\n\nSome context.\n\n## Tasks\n- do A\n- do B\n- do C\n\n## Something else\nbody\n`,
    );
    const spec = loadSpec(fp);
    expect(spec.title).toBe('My Feature');
    expect(spec.tasks).toEqual(['do A', 'do B', 'do C']);
  });

  it('errors when file missing', () => {
    expect(() => loadSpec(path.join(tmp, 'nope.md'))).toThrow();
  });
});
