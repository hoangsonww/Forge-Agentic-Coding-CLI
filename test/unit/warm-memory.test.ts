/**
 * Warm memory traversal tests. These are not meant to be exhaustive, just to verify that the basic traversal and sampling logic works as expected. We rely on the fact that the traversal and sampling logic is deterministic, so we can test it with a simple fixture. The tests cover:
 *   - collectRelated correctly follows relative imports and collects related files.
 *   - sampleFileExcerpts returns excerpts with source metadata that matches the input files.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectRelated, sampleFileExcerpts } from '../../src/memory/warm';

describe('warm memory traversal', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-warm-'));
    fs.writeFileSync(
      path.join(tmp, 'a.ts'),
      `import { b } from './b';\nimport { c } from './sub/c';\n`,
    );
    fs.writeFileSync(path.join(tmp, 'b.ts'), `export const b = 1;\n`);
    fs.mkdirSync(path.join(tmp, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'sub', 'c.ts'), `export const c = 2;\n`);
  });
  afterAll(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('follows relative imports', () => {
    const files = collectRelated(path.join(tmp, 'a.ts'), tmp, { maxFiles: 5 });
    const basenames = files.map((f) => path.basename(f));
    expect(basenames).toContain('a.ts');
    expect(basenames).toContain('b.ts');
    expect(basenames).toContain('c.ts');
  });

  it('samples excerpts with source metadata', () => {
    const excerpts = sampleFileExcerpts([path.join(tmp, 'a.ts')], 10);
    expect(excerpts[0].source.endsWith('a.ts')).toBe(true);
  });
});
