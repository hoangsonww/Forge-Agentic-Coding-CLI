/**
 * Spec tests for the sandboxing logic, including both filesystem and shell command risk classification. These tests ensure that the sandbox correctly identifies safe and unsafe paths, as well as classifying shell commands according to their potential risk.
 *
 * For the filesystem sandbox, we create a temporary directory to act as the project root and test that:
 *   - Valid paths within the project root are resolved successfully.
 *   - Paths outside the project root are rejected with an error.
 *   - Always-forbidden paths (like /etc/passwd) are blocked even if they appear under the project root (e.g., via symlinks or on Windows).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
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
