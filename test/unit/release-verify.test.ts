import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { verifyFileSha256, verifyRelease, Manifest } from '../../src/release/verify';

describe('release verify', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-rel-'));
  });
  afterAll(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });
  beforeEach(() => {
    delete process.env.FORGE_ALLOW_UNSIGNED;
  });

  it('verifies a correct sha256', () => {
    const fp = path.join(tmp, 'ok.bin');
    fs.writeFileSync(fp, 'hello');
    const sha = crypto.createHash('sha256').update('hello').digest('hex');
    expect(verifyFileSha256(fp, sha)).toBe(true);
  });

  it('rejects tampered content', () => {
    const fp = path.join(tmp, 'bad.bin');
    fs.writeFileSync(fp, 'hello');
    const sha = crypto.createHash('sha256').update('different').digest('hex');
    expect(verifyFileSha256(fp, sha)).toBe(false);
  });

  it('refuses missing signature without override', () => {
    const fp = path.join(tmp, 'r.bin');
    fs.writeFileSync(fp, 'x');
    const sha = crypto.createHash('sha256').update('x').digest('hex');
    const manifest: Manifest = {
      version: '1.0.0',
      channel: 'stable',
      releasedAt: new Date().toISOString(),
      artifacts: [{ name: 'r.bin', sha256: sha, size: 1 }],
    };
    const r = verifyRelease({
      artifactPath: fp,
      expectedName: 'r.bin',
      manifest,
      manifestJson: JSON.stringify(manifest),
    });
    expect(r.ok).toBe(false);
  });

  it('allows when FORGE_ALLOW_UNSIGNED=1', () => {
    process.env.FORGE_ALLOW_UNSIGNED = '1';
    const fp = path.join(tmp, 's.bin');
    fs.writeFileSync(fp, 'x');
    const sha = crypto.createHash('sha256').update('x').digest('hex');
    const manifest: Manifest = {
      version: '1.0.0',
      channel: 'stable',
      releasedAt: new Date().toISOString(),
      artifacts: [{ name: 's.bin', sha256: sha, size: 1 }],
    };
    const r = verifyRelease({
      artifactPath: fp,
      expectedName: 's.bin',
      manifest,
      manifestJson: JSON.stringify(manifest),
    });
    expect(r.ok).toBe(true);
  });
});
