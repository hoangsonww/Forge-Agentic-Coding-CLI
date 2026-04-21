/**
 * Updater Cache Tests.
 *
 * Targets the pure fetch/cache/compare branches in src/daemon/updater.ts.
 * We stub undici so the registry probe doesn't go out, and point
 * FORGE_HOME at a fresh temp directory so the cache file lives there.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockRequest = vi.fn();
vi.mock('undici', () => ({
  request: (url: string, opts: unknown) => mockRequest(url, opts),
}));

vi.mock('../../src/config/loader', () => ({
  loadGlobalConfig: () => ({
    update: {
      autoCheck: true,
      channel: 'stable',
      checkIntervalHours: 24,
      ignoredVersions: [],
    },
    permissions: { trust: { autoAllowAfter: 3 } },
    notifications: { enabled: false, channels: [], verbosity: 'normal', osNotifications: false },
  }),
  updateGlobalConfig: vi.fn(),
}));

// Redirect FORGE_HOME to a temp dir before importing the updater.
process.env.FORGE_HOME = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'forge-updater-home-')),
);

import { checkForUpdate, readCache, currentVersion } from '../../src/daemon/updater';

describe('updater', () => {
  beforeEach(() => mockRequest.mockReset());

  it('currentVersion returns a semver-shaped string', () => {
    const v = currentVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reports no update when latest === current', async () => {
    const current = currentVersion();
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({ 'dist-tags': { latest: current } }),
        text: async () => '',
      },
    });
    const result = await checkForUpdate({ force: true });
    expect(result?.hasUpdate).toBe(false);
    expect(result?.latestVersion).toBe(current);
  });

  it('reports an update when latest > current', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({ 'dist-tags': { latest: '999.0.0' } }),
        text: async () => '',
      },
    });
    const result = await checkForUpdate({ force: true });
    expect(result?.hasUpdate).toBe(true);
    expect(result?.latestVersion).toBe('999.0.0');
  });

  it('marks hasUpdate=false when the registry probe fails (fail-open)', async () => {
    mockRequest.mockRejectedValueOnce(new Error('network down'));
    const result = await checkForUpdate({ force: true });
    expect(result?.hasUpdate).toBe(false);
    expect(result?.latestVersion).toBe(result?.currentVersion);
  });

  it('writes a cache file that readCache() can reload', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({ 'dist-tags': { latest: '0.0.0' } }),
        text: async () => '',
      },
    });
    await checkForUpdate({ force: true });
    const cache = readCache();
    expect(cache).not.toBeNull();
    expect(cache?.channel).toBe('stable');
  });
});
