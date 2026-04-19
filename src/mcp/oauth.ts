/**
 * OAuth 2.0 Authorization Code + PKCE for MCP connections.
 *
 * Flow:
 *   1. Spawn a local callback server on a free loopback port.
 *   2. Generate a PKCE verifier + challenge.
 *   3. Open the user's browser to the provider's authorize URL.
 *   4. Wait for the redirect, exchange the code for an access/refresh token.
 *   5. Persist tokens via the keychain module.
 *
 * Token refresh on near-expiry is handled by `ensureAccessToken`.
 */
import * as http from 'http';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { request } from 'undici';
import { setSecret, getSecret } from '../keychain';
import { ForgeRuntimeError } from '../types/errors';
import { log } from '../logging/logger';

export interface OAuthConfig {
  id: string;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes?: string[];
  redirectPort?: number;
  audience?: string;
  extraAuthParams?: Record<string, string>;
}

export interface Tokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: number;
  scope?: string;
}

const base64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

const pkcePair = () => {
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
};

const openBrowser = (url: string): void => {
  const cmds: Record<string, [string, string[]]> = {
    darwin: ['open', [url]],
    win32: ['cmd', ['/c', 'start', '', url]],
    linux: ['xdg-open', [url]],
  };
  const entry = cmds[process.platform];
  if (!entry) {
    log.info(`Open this URL in your browser: ${url}`);
    return;
  }
  try {
    spawn(entry[0], entry[1], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    log.info(`Open this URL in your browser: ${url}`);
  }
};

const startCallback = (port: number, state: string): Promise<{ code: string }> => {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const gotState = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const errParam = url.searchParams.get('error');
      if (errParam) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('OAuth error: ' + errParam);
        server.close();
        reject(
          new ForgeRuntimeError({
            class: 'tool_error',
            message: `OAuth error: ${errParam}`,
            retryable: false,
          }),
        );
        return;
      }
      if (gotState !== state || !code) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('Invalid callback');
        server.close();
        reject(
          new ForgeRuntimeError({
            class: 'tool_error',
            message: 'OAuth state/code mismatch',
            retryable: false,
          }),
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(
        `<!doctype html><html><body style="font-family:system-ui;padding:40px"><h2>Forge: you can close this tab.</h2></body></html>`,
      );
      server.close();
      resolve({ code });
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1');
  });
};

export const authorize = async (cfg: OAuthConfig): Promise<Tokens> => {
  const port = cfg.redirectPort ?? 8787;
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const { verifier, challenge } = pkcePair();
  const state = base64url(crypto.randomBytes(16));
  const authUrl = new URL(cfg.authorizationUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  if (cfg.scopes?.length) authUrl.searchParams.set('scope', cfg.scopes.join(' '));
  if (cfg.audience) authUrl.searchParams.set('audience', cfg.audience);
  for (const [k, v] of Object.entries(cfg.extraAuthParams ?? {})) authUrl.searchParams.set(k, v);

  log.info('Opening browser for OAuth', { provider: cfg.id });
  openBrowser(authUrl.toString());

  const { code } = await startCallback(port, state);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: cfg.clientId,
    code_verifier: verifier,
  });
  if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret);

  const res = await request(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (res.statusCode !== 200) {
    const txt = await res.body.text();
    throw new ForgeRuntimeError({
      class: 'tool_error',
      message: `OAuth token exchange failed (${res.statusCode}): ${txt.slice(0, 300)}`,
      retryable: false,
    });
  }
  const payload = (await res.body.json()) as {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
  };
  const tokens: Tokens = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type ?? 'Bearer',
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    scope: payload.scope,
  };
  setSecret('mcp-oauth', cfg.id, JSON.stringify(tokens));
  return tokens;
};

export const loadTokens = (id: string): Tokens | null => {
  const raw = getSecret('mcp-oauth', id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
};

export const refreshIfNeeded = async (cfg: OAuthConfig): Promise<Tokens> => {
  const existing = loadTokens(cfg.id);
  if (!existing) {
    return authorize(cfg);
  }
  if (Date.now() < existing.expiresAt - 60_000) {
    return existing; // comfortably valid
  }
  if (!existing.refreshToken) {
    log.info('OAuth token expired and no refresh_token; re-authorizing.');
    return authorize(cfg);
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: existing.refreshToken,
    client_id: cfg.clientId,
  });
  if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret);
  const res = await request(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (res.statusCode !== 200) {
    log.warn('OAuth refresh failed; re-authorizing.', { status: res.statusCode });
    return authorize(cfg);
  }
  const payload = (await res.body.json()) as {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
  };
  const next: Tokens = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? existing.refreshToken,
    tokenType: payload.token_type ?? existing.tokenType,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    scope: payload.scope ?? existing.scope,
  };
  setSecret('mcp-oauth', cfg.id, JSON.stringify(next));
  return next;
};

export const ensureAccessToken = async (cfg: OAuthConfig): Promise<string> => {
  const t = await refreshIfNeeded(cfg);
  return t.accessToken;
};
