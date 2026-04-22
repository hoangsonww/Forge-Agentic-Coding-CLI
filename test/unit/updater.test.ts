/**
 * Updater tests — exercise checkForUpdate's caching + config gating without
 * touching the network. We stub `undici.request` so fetchLatest resolves
 * deterministically, and rely on the shared FORGE_HOME fixture (test/setup-env.ts)
 * so the write-through cache file under `<FORGE_HOME>/logs/update-check.json`
 * lives in a disposable tmpdir.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const mockRequest = vi.fn();
vi.mock('undici', () => ({
  request: (...args: unknown[]) => mockRequest(...args),
}));

import { paths } from '../../src/config/paths';
import { saveGlobalConfig, loadGlobalConfig } from '../../src/config/loader';
import { checkForUpdate, ignoreVersion } from '../../src/daemon/updater';

const CACHE_FILE = path.join(paths.logs, 'update-check.json');

const npmBody = (tag: string, version: string) => ({
  statusCode: 200,
  body: {
    // Match undici's `.body.json()` interface.
    json: async () => ({ 'dist-tags': { [tag]: version } }),
  },
});

const resetCache = (): void => {
  try {
    fs.rmSync(CACHE_FILE);
  } catch {
    /* absent is fine */
  }
};

beforeEach(() => {
  mockRequest.mockReset();
  resetCache();
  // Start each test with a clean defaults-shaped config.
  const base = loadGlobalConfig(true);
  saveGlobalConfig({
    ...base,
    update: {
      ...base.update,
      autoCheck: true,
      notify: true,
      checkIntervalHours: 24,
      channel: 'stable',
      ignoredVersions: [],
    },
  });
});

afterEach(() => {
  resetCache();
});

describe('updater — checkForUpdate', () => {
  it('returns null when autoCheck is disabled and force is not set', async () => {
    const cfg = loadGlobalConfig();
    saveGlobalConfig({ ...cfg, update: { ...cfg.update, autoCheck: false } });
    const res = await checkForUpdate();
    expect(res).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('still runs when autoCheck is off but force=true', async () => {
    const cfg = loadGlobalConfig();
    saveGlobalConfig({ ...cfg, update: { ...cfg.update, autoCheck: false } });
    mockRequest.mockResolvedValueOnce(npmBody('latest', '99.0.0'));
    const res = await checkForUpdate({ force: true });
    expect(res).not.toBeNull();
    expect(res!.latestVersion).toBe('99.0.0');
    expect(res!.hasUpdate).toBe(true);
  });

  it('writes a cache entry on the first check', async () => {
    mockRequest.mockResolvedValueOnce(npmBody('latest', '99.0.0'));
    const res = await checkForUpdate();
    expect(res).not.toBeNull();
    expect(fs.existsSync(CACHE_FILE)).toBe(true);
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    expect(cached.latestVersion).toBe('99.0.0');
  });

  it('short-circuits to the cached value inside checkIntervalHours', async () => {
    mockRequest.mockResolvedValueOnce(npmBody('latest', '99.0.0'));
    await checkForUpdate();
    expect(mockRequest).toHaveBeenCalledTimes(1);

    // Second call inside the default 24h window should NOT hit the network.
    const second = await checkForUpdate();
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(second!.latestVersion).toBe('99.0.0');
  });

  it('force=true bypasses the cache and re-fetches', async () => {
    mockRequest
      .mockResolvedValueOnce(npmBody('latest', '99.0.0'))
      .mockResolvedValueOnce(npmBody('latest', '99.1.0'));
    await checkForUpdate();
    const again = await checkForUpdate({ force: true });
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(again!.latestVersion).toBe('99.1.0');
  });

  it('hasUpdate is false when the latest version is in ignoredVersions', async () => {
    ignoreVersion('99.0.0');
    expect(loadGlobalConfig(true).update.ignoredVersions).toContain('99.0.0');

    mockRequest.mockResolvedValueOnce(npmBody('latest', '99.0.0'));
    const res = await checkForUpdate({ force: true });
    expect(res!.latestVersion).toBe('99.0.0');
    expect(res!.hasUpdate).toBe(false);
  });

  it('returns a "no update" entry when the registry is unreachable', async () => {
    mockRequest.mockRejectedValueOnce(new Error('ENETUNREACH'));
    const res = await checkForUpdate({ force: true });
    expect(res).not.toBeNull();
    expect(res!.hasUpdate).toBe(false);
    // current + latest collapse to the same string when the fetch fails.
    expect(res!.latestVersion).toBe(res!.currentVersion);
  });

  it('hits the real package on the npm registry (not an unrelated @forge/cli)', async () => {
    // Regression guard: an earlier version hardcoded `@forge/cli`, an
    // unrelated package at 12.18.0, so `forge` told users to update to a
    // wildly wrong version. The URL must be derived from package.json#name.
    mockRequest.mockResolvedValueOnce(npmBody('latest', '99.0.0'));
    await checkForUpdate({ force: true });
    const url = String(mockRequest.mock.calls[0][0]);
    expect(url).toContain('registry.npmjs.org');
    expect(url).toContain('@hoangsonw');
    // %2F is the correct npm-registry encoding for the scope separator.
    expect(url).toContain('%2Fforge');
    expect(url).not.toContain('@forge/cli');
  });

  it('honours the beta channel dist-tag', async () => {
    const cfg = loadGlobalConfig();
    saveGlobalConfig({ ...cfg, update: { ...cfg.update, channel: 'beta' } });
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({
          'dist-tags': { latest: '1.0.0', beta: '2.0.0-beta.1' },
        }),
      },
    });
    const res = await checkForUpdate({ force: true });
    expect(res!.latestVersion).toBe('2.0.0-beta.1');
    expect(res!.channel).toBe('beta');
  });
});
