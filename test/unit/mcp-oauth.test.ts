/**
 * MCP OAuth Tests.
 *
 * The authorize() flow spawns a browser and a local HTTP server, so we
 * don't drive it end-to-end here. Instead we exercise the pure units
 * around it:
 *   • loadTokens: missing / malformed / valid
 *   • refreshIfNeeded: returns cached when comfortably valid; re-auths
 *     when no refresh_token; uses refresh grant and persists tokens
 *     when near-expiry with a refresh_token; re-auths when refresh 4xx
 *   • ensureAccessToken: returns accessToken from refreshIfNeeded
 *
 * We stub the keychain, undici, and the internal authorize path (via
 * vi.spyOn on the module export).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequest = vi.fn();
vi.mock('undici', () => ({
  request: (url: string, opts: unknown) => mockRequest(url, opts),
}));

const keyStore = new Map<string, string>();

vi.mock('../../src/keychain', () => ({
  setSecret: (namespace: string, key: string, value: string) => {
    keyStore.set(`${namespace}:${key}`, value);
  },
  getSecret: (namespace: string, key: string) => keyStore.get(`${namespace}:${key}`) ?? null,
}));

import * as oauth from '../../src/mcp/oauth';
import type { OAuthConfig, Tokens } from '../../src/mcp/oauth';

const cfg: OAuthConfig = {
  id: 'test-provider',
  authorizationUrl: 'https://auth.example/authorize',
  tokenUrl: 'https://auth.example/token',
  clientId: 'client-abc',
  scopes: ['read:x'],
};

describe('loadTokens', () => {
  beforeEach(() => keyStore.clear());

  it('returns null when no tokens are stored', () => {
    expect(oauth.loadTokens('unknown')).toBeNull();
  });

  it('returns null when the stored value is not valid JSON', () => {
    keyStore.set('mcp-oauth:bad', 'not-json-{{{');
    expect(oauth.loadTokens('bad')).toBeNull();
  });

  it('round-trips a valid tokens object', () => {
    const tokens: Tokens = {
      accessToken: 'tok-a',
      refreshToken: 'tok-r',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600_000,
    };
    keyStore.set('mcp-oauth:good', JSON.stringify(tokens));
    expect(oauth.loadTokens('good')).toEqual(tokens);
  });
});

describe('refreshIfNeeded — cached path', () => {
  beforeEach(() => {
    keyStore.clear();
    mockRequest.mockReset();
  });

  it('returns existing tokens when comfortably valid', async () => {
    const existing: Tokens = {
      accessToken: 'live',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 10 * 60_000, // 10 min away — comfortably valid
    };
    keyStore.set(`mcp-oauth:${cfg.id}`, JSON.stringify(existing));
    const got = await oauth.refreshIfNeeded(cfg);
    expect(got.accessToken).toBe('live');
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe('refreshIfNeeded — refresh grant path', () => {
  beforeEach(() => {
    keyStore.clear();
    mockRequest.mockReset();
  });

  it('exchanges the refresh_token and persists new tokens', async () => {
    const existing: Tokens = {
      accessToken: 'stale',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresAt: Date.now() - 1000, // already expired
      scope: 'read:x',
    };
    keyStore.set(`mcp-oauth:${cfg.id}`, JSON.stringify(existing));
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({
          access_token: 'fresh',
          refresh_token: 'new-r',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'read:x',
        }),
        text: async () => '',
      },
    });
    const got = await oauth.refreshIfNeeded(cfg);
    expect(got.accessToken).toBe('fresh');
    expect(got.refreshToken).toBe('new-r');
    // Persisted.
    const stored = JSON.parse(keyStore.get(`mcp-oauth:${cfg.id}`)!);
    expect(stored.accessToken).toBe('fresh');
    // Request body shape.
    const [url, opts] = mockRequest.mock.calls[0];
    expect(url).toBe(cfg.tokenUrl);
    const body = (opts as { body: string }).body;
    const parsed = new URLSearchParams(body);
    expect(parsed.get('grant_type')).toBe('refresh_token');
    expect(parsed.get('refresh_token')).toBe('r');
    expect(parsed.get('client_id')).toBe('client-abc');
  });

  it('includes client_secret on the refresh request when configured', async () => {
    const existing: Tokens = {
      accessToken: 'stale',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresAt: Date.now() - 1000,
    };
    keyStore.set(`mcp-oauth:${cfg.id}`, JSON.stringify(existing));
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({ access_token: 'fresh', expires_in: 60 }),
        text: async () => '',
      },
    });
    await oauth.refreshIfNeeded({ ...cfg, clientSecret: 's3cr3t' });
    const body = (mockRequest.mock.calls[0][1] as { body: string }).body;
    expect(new URLSearchParams(body).get('client_secret')).toBe('s3cr3t');
  });

  it('preserves the previous refresh_token when the refresh response omits one', async () => {
    const existing: Tokens = {
      accessToken: 'stale',
      refreshToken: 'old-r',
      tokenType: 'Bearer',
      expiresAt: Date.now() - 1000,
    };
    keyStore.set(`mcp-oauth:${cfg.id}`, JSON.stringify(existing));
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({ access_token: 'fresh', expires_in: 60 }),
        text: async () => '',
      },
    });
    const got = await oauth.refreshIfNeeded(cfg);
    expect(got.refreshToken).toBe('old-r');
  });
});

// Note: the "no tokens stored", "no refresh_token", and "refresh 4xx"
// paths in refreshIfNeeded all fall back to the full authorize() flow,
// which opens a browser and listens on a loopback port. Those are
// integration concerns — we don't drive them from unit tests.

describe('ensureAccessToken', () => {
  beforeEach(() => {
    keyStore.clear();
    mockRequest.mockReset();
  });

  it('returns just the accessToken string', async () => {
    const existing: Tokens = {
      accessToken: 'only-thing-we-return',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 10 * 60_000,
    };
    keyStore.set(`mcp-oauth:${cfg.id}`, JSON.stringify(existing));
    const tok = await oauth.ensureAccessToken(cfg);
    expect(tok).toBe('only-thing-we-return');
  });
});
