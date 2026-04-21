/**
 * JSONL Persistence Tests.
 *
 * Covers appendJsonl/readJsonl/streamJsonl on real files, including
 * the "skip corrupted lines" rule, missing-file handling, and the
 * redaction pipeline on write.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { appendJsonl, readJsonl, streamJsonl } from '../../src/persistence/jsonl';

describe('jsonl persistence', () => {
  let tmp: string;
  let file: string;

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-jsonl-')));
    file = path.join(tmp, 'out.jsonl');
  });

  it('appends and reads entries round-trip', async () => {
    appendJsonl(file, { a: 1 });
    appendJsonl(file, { b: 'two' });
    const rows = await readJsonl<Record<string, unknown>>(file);
    expect(rows).toEqual([{ a: 1 }, { b: 'two' }]);
  });

  it('returns [] for a missing file', async () => {
    const rows = await readJsonl(path.join(tmp, 'nope.jsonl'));
    expect(rows).toEqual([]);
  });

  it('skips corrupted lines rather than aborting', async () => {
    fs.writeFileSync(file, '{"ok":true}\nnot-json\n{"ok":false}\n', 'utf8');
    const rows = await readJsonl<Record<string, unknown>>(file);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual({ ok: true });
    expect(rows[1]).toEqual({ ok: false });
  });

  it('streams entries in order', async () => {
    appendJsonl(file, { i: 0 });
    appendJsonl(file, { i: 1 });
    appendJsonl(file, { i: 2 });
    const seen: number[] = [];
    for await (const row of streamJsonl<{ i: number }>(file)) {
      seen.push(row.i);
    }
    expect(seen).toEqual([0, 1, 2]);
  });

  it('stream on missing file yields nothing', async () => {
    const seen: unknown[] = [];
    for await (const row of streamJsonl(path.join(tmp, 'nope.jsonl'))) {
      seen.push(row);
    }
    expect(seen).toEqual([]);
  });

  it('redacts obvious secrets in the written line', async () => {
    appendJsonl(file, { token: 'sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).not.toContain('sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  });
});
