/**
 * Updater module — responsible for checking for new versions of the Forge CLI, caching the results to avoid excessive network requests, and applying updates when requested by the user. The module interacts with the npm registry to fetch the latest version information, compares it with the currently installed version, and manages a local cache file to store the last check time and version details. It also provides functionality to ignore specific versions and to apply updates by downloading the latest release artifact.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import { request } from 'undici';
import { paths, ensureForgeHome } from '../config/paths';
import { loadGlobalConfig, updateGlobalConfig } from '../config/loader';
import { log } from '../logging/logger';
import { resolveLatest, downloadAndVerify } from '../release/download';

const CACHE_FILE = path.join(paths.logs, 'update-check.json');

interface CacheShape {
  lastChecked: string;
  latestVersion: string;
  currentVersion: string;
  hasUpdate: boolean;
  channel: string;
  notes?: string;
}

const readPkgVersion = (): string => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
    );
    return String(pkg.version ?? '0.0.0');
  } catch {
    return '0.0.0';
  }
};

const shouldCheckNow = (): boolean => {
  try {
    if (!fs.existsSync(CACHE_FILE)) return true;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as CacheShape;
    const last = new Date(raw.lastChecked).getTime();
    const intervalMs = loadGlobalConfig().update.checkIntervalHours * 3600_000;
    return Date.now() - last > intervalMs;
  } catch {
    return true;
  }
};

export const readCache = (): CacheShape | null => {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as CacheShape;
  } catch {
    return null;
  }
};

const writeCache = (data: CacheShape): void => {
  ensureForgeHome();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
};

const fetchLatest = async (channel: string): Promise<string | null> => {
  // Default to the npm registry; teams can host their own. We treat the
  // network fetch as best-effort and never block.
  try {
    const res = await request('https://registry.npmjs.org/@forge/cli', {
      method: 'GET',
      headersTimeout: 8000,
      bodyTimeout: 8000,
    });
    if (res.statusCode !== 200) return null;
    const body = (await res.body.json()) as {
      'dist-tags'?: Record<string, string>;
      versions?: Record<string, unknown>;
    };
    const tags = body['dist-tags'] ?? {};
    if (channel === 'beta' && tags.beta) return tags.beta;
    if (channel === 'nightly' && tags.nightly) return tags.nightly;
    return tags.latest ?? null;
  } catch (err) {
    log.debug('update check network error', { err: String(err) });
    return null;
  }
};

export const checkForUpdate = async (
  opts: { force?: boolean } = {},
): Promise<CacheShape | null> => {
  const cfg = loadGlobalConfig();
  if (!cfg.update.autoCheck && !opts.force) return null;
  if (!opts.force && !shouldCheckNow()) return readCache();

  const current = readPkgVersion();
  const latest = await fetchLatest(cfg.update.channel);
  if (!latest) {
    const cache: CacheShape = {
      lastChecked: new Date().toISOString(),
      latestVersion: current,
      currentVersion: current,
      hasUpdate: false,
      channel: cfg.update.channel,
    };
    writeCache(cache);
    return cache;
  }
  const hasUpdate =
    semver.valid(latest) && semver.valid(current)
      ? semver.gt(latest, current) && !cfg.update.ignoredVersions.includes(latest)
      : false;
  const cache: CacheShape = {
    lastChecked: new Date().toISOString(),
    latestVersion: latest,
    currentVersion: current,
    hasUpdate: Boolean(hasUpdate),
    channel: cfg.update.channel,
  };
  writeCache(cache);
  return cache;
};

export const ignoreVersion = (version: string): void => {
  updateGlobalConfig((cfg) => ({
    ...cfg,
    update: {
      ...cfg.update,
      ignoredVersions: [...new Set([...cfg.update.ignoredVersions, version])],
    },
  }));
};

export const currentVersion = (): string => readPkgVersion();

export const applyUpdate = async (
  channel: 'stable' | 'beta' | 'nightly' = 'stable',
): Promise<{ applied: boolean; path?: string; detail: string }> => {
  const release = await resolveLatest(channel);
  if (!release) {
    return { applied: false, detail: 'no release found' };
  }
  const result = await downloadAndVerify(release, paths.bin);
  return { applied: true, path: result.artifactPath, detail: `${release.tag}: ${result.detail}` };
};
