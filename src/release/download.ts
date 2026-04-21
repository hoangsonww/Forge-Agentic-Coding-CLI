/**
 * GitHub Releases downloader with resume + signature verification.
 *
 * Usage flow:
 *   1. resolve() → {tag, artifactUrl, manifestUrl, signatureUrl}
 *   2. downloadArtifact(...) → local path
 *   3. verifyRelease(...) → refuses to activate on failure
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import * as fs from 'fs';
import * as path from 'path';
import { request } from 'undici';
import { ForgeRuntimeError } from '../types/errors';
import { log } from '../logging/logger';
import { Manifest, verifyRelease } from './verify';

export interface Release {
  tag: string;
  channel: 'stable' | 'beta' | 'nightly';
  artifactName: string;
  artifactUrl: string;
  manifestUrl: string;
  signatureUrl?: string;
}

const GITHUB_REPO = process.env.FORGE_RELEASE_REPO ?? 'forge/forge';

interface GithubRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
}

export const platformArtifactName = (): string => {
  const plat = process.platform;
  const arch = process.arch;
  const map: Record<string, string> = {
    'darwin-x64': 'forge-macos-x64',
    'darwin-arm64': 'forge-macos-arm64',
    'linux-x64': 'forge-linux-x64',
    'linux-arm64': 'forge-linux-arm64',
    'win32-x64': 'forge-windows-x64.exe',
  };
  const key = `${plat}-${arch}`;
  const value = map[key];
  if (!value) {
    throw new ForgeRuntimeError({
      class: 'not_found',
      message: `Unsupported platform/arch combination: ${key}`,
      retryable: false,
    });
  }
  return value;
};

export const resolveLatest = async (
  channel: 'stable' | 'beta' | 'nightly' = 'stable',
): Promise<Release | null> => {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
  const res = await request(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'forge-release',
    },
  });
  if (res.statusCode !== 200) {
    log.debug('github releases listing failed', { status: res.statusCode });
    return null;
  }
  const list = (await res.body.json()) as GithubRelease[];
  const candidates = list.filter((r) => {
    if (r.draft) return false;
    if (channel === 'stable') return !r.prerelease && !r.tag_name.includes('nightly');
    if (channel === 'beta') return r.prerelease && !r.tag_name.includes('nightly');
    return r.tag_name.includes('nightly');
  });
  const chosen = candidates[0];
  if (!chosen) return null;
  const artifactName = platformArtifactName();
  const artifact = chosen.assets.find((a) => a.name === artifactName);
  const manifest = chosen.assets.find((a) => a.name === 'manifest.json');
  const signature = chosen.assets.find((a) => a.name === 'manifest.sig');
  if (!artifact || !manifest) return null;
  return {
    tag: chosen.tag_name,
    channel,
    artifactName,
    artifactUrl: artifact.browser_download_url,
    manifestUrl: manifest.browser_download_url,
    signatureUrl: signature?.browser_download_url,
  };
};

export const downloadFile = async (
  url: string,
  destination: string,
  opts: { timeoutMs?: number } = {},
): Promise<void> => {
  const res = await request(url, {
    method: 'GET',
    headers: { 'user-agent': 'forge-release' },
    maxRedirections: 5,
    bodyTimeout: opts.timeoutMs ?? 120_000,
    headersTimeout: opts.timeoutMs ?? 120_000,
  });
  if (res.statusCode !== 200) {
    throw new ForgeRuntimeError({
      class: 'tool_error',
      message: `Download ${url} failed: HTTP ${res.statusCode}`,
      retryable: res.statusCode >= 500,
    });
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const tmp = destination + '.part';
  const out = fs.createWriteStream(tmp);
  for await (const chunk of res.body) out.write(chunk);
  await new Promise<void>((r) => out.end(r));
  fs.renameSync(tmp, destination);
};

export const downloadAndVerify = async (
  release: Release,
  destDir: string,
): Promise<{ artifactPath: string; verified: boolean; detail: string }> => {
  const artifactPath = path.join(destDir, release.artifactName);
  const manifestPath = path.join(destDir, 'manifest.json');
  const sigPath = path.join(destDir, 'manifest.sig');
  await downloadFile(release.manifestUrl, manifestPath);
  if (release.signatureUrl) await downloadFile(release.signatureUrl, sigPath);
  await downloadFile(release.artifactUrl, artifactPath);
  const manifestJson = fs.readFileSync(manifestPath, 'utf8');
  let manifest: Manifest;
  try {
    manifest = JSON.parse(manifestJson) as Manifest;
  } catch (err) {
    throw new ForgeRuntimeError({
      class: 'tool_error',
      message: `Malformed release manifest: ${String(err)}`,
      retryable: false,
    });
  }
  const signatureBase64 = fs.existsSync(sigPath)
    ? fs.readFileSync(sigPath, 'utf8').trim()
    : undefined;
  const result = verifyRelease({
    artifactPath,
    expectedName: release.artifactName,
    manifest,
    manifestJson,
    signatureBase64,
  });
  if (!result.ok) {
    // Never keep an unverified binary.
    try {
      fs.unlinkSync(artifactPath);
    } catch {
      /* ignore */
    }
    throw new ForgeRuntimeError({
      class: 'policy_violation',
      message: `Release verification failed: ${result.detail}`,
      retryable: false,
      recoveryHint: 'Set FORGE_ALLOW_UNSIGNED=1 only in development.',
    });
  }
  return { artifactPath, verified: true, detail: result.detail };
};
