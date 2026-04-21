/**
 * Release Download Tests.
 *
 * We stub `undici.request` so the resolver logic and the platform
 * mapping run without a real network. The signature-verification path
 * is covered by release-verify.test.ts; here we exercise the resolver's
 * filtering rules and the download file writer.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockRequest = vi.fn();
vi.mock('undici', () => ({
  request: (url: string, opts: unknown) => mockRequest(url, opts),
}));

import { platformArtifactName, resolveLatest, downloadFile } from '../../src/release/download';
import { ForgeRuntimeError } from '../../src/types/errors';

describe('platformArtifactName', () => {
  const origPlat = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const origArch = Object.getOwnPropertyDescriptor(process, 'arch')!;

  afterEach(() => {
    Object.defineProperty(process, 'platform', origPlat);
    Object.defineProperty(process, 'arch', origArch);
  });

  it('returns the correct artifact name for the current platform', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    Object.defineProperty(process, 'arch', { value: 'x64' });
    expect(platformArtifactName()).toBe('forge-linux-x64');
  });

  it('throws for an unsupported platform', () => {
    Object.defineProperty(process, 'platform', { value: 'freebsd' });
    Object.defineProperty(process, 'arch', { value: 'x64' });
    expect(() => platformArtifactName()).toThrow(ForgeRuntimeError);
  });
});

describe('resolveLatest', () => {
  const origPlat = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const origArch = Object.getOwnPropertyDescriptor(process, 'arch')!;

  beforeEach(() => {
    mockRequest.mockReset();
    Object.defineProperty(process, 'platform', { value: 'linux' });
    Object.defineProperty(process, 'arch', { value: 'x64' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', origPlat);
    Object.defineProperty(process, 'arch', origArch);
  });

  const mockReleases = (releases: unknown[]) => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: { json: async () => releases, text: async () => JSON.stringify(releases) },
    });
  };

  it('picks the newest non-prerelease, non-nightly release for stable', async () => {
    mockReleases([
      {
        tag_name: 'v0.3.0',
        prerelease: false,
        draft: false,
        assets: [
          { name: 'forge-linux-x64', browser_download_url: 'https://u/a', size: 10 },
          { name: 'manifest.json', browser_download_url: 'https://u/m', size: 2 },
          { name: 'manifest.sig', browser_download_url: 'https://u/s', size: 2 },
        ],
      },
    ]);
    const r = await resolveLatest('stable');
    expect(r?.tag).toBe('v0.3.0');
    expect(r?.artifactName).toBe('forge-linux-x64');
    expect(r?.signatureUrl).toBe('https://u/s');
  });

  it('filters out drafts and nightlies for the stable channel', async () => {
    mockReleases([
      { tag_name: 'v0.3.0-nightly.20260420', prerelease: false, draft: false, assets: [] },
      {
        tag_name: 'v0.2.0',
        prerelease: false,
        draft: false,
        assets: [
          { name: 'forge-linux-x64', browser_download_url: 'https://u/a', size: 10 },
          { name: 'manifest.json', browser_download_url: 'https://u/m', size: 2 },
        ],
      },
    ]);
    const r = await resolveLatest('stable');
    expect(r?.tag).toBe('v0.2.0');
  });

  it('returns null when the release listing is non-200', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 500,
      body: { json: async () => ({}), text: async () => '' },
    });
    const r = await resolveLatest('stable');
    expect(r).toBeNull();
  });

  it('returns null when no release has the needed assets', async () => {
    mockReleases([
      {
        tag_name: 'v0.2.0',
        prerelease: false,
        draft: false,
        assets: [{ name: 'other.tgz', browser_download_url: 'https://u/x', size: 1 }],
      },
    ]);
    const r = await resolveLatest('stable');
    expect(r).toBeNull();
  });

  it('picks a prerelease when channel=beta is requested', async () => {
    mockReleases([
      {
        tag_name: 'v0.3.0-beta.1',
        prerelease: true,
        draft: false,
        assets: [
          { name: 'forge-linux-x64', browser_download_url: 'https://u/a', size: 10 },
          { name: 'manifest.json', browser_download_url: 'https://u/m', size: 2 },
        ],
      },
    ]);
    const r = await resolveLatest('beta');
    expect(r?.tag).toBe('v0.3.0-beta.1');
    expect(r?.channel).toBe('beta');
  });
});

describe('downloadFile', () => {
  let tmp: string;

  beforeEach(() => {
    mockRequest.mockReset();
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-dl-')));
  });

  it('streams the response body to disk and renames from .part', async () => {
    const chunks = [Buffer.from('hello '), Buffer.from('world')];
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: (async function* () {
        for (const c of chunks) yield c;
      })(),
    });
    const dest = path.join(tmp, 'out.bin');
    await downloadFile('https://example/out.bin', dest);
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf8')).toBe('hello world');
    expect(fs.existsSync(dest + '.part')).toBe(false);
  });

  it('throws a retryable error on a 5xx response', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 503,
      body: (async function* () {
        yield Buffer.from('');
      })(),
    });
    await expect(downloadFile('https://example/x', path.join(tmp, 'x'))).rejects.toBeInstanceOf(
      ForgeRuntimeError,
    );
  });
});
