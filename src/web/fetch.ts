/**
 * URL fetch with size caps, content-type guard, and markdown-ish extraction.
 */
import { request } from 'undici';
import { ForgeRuntimeError } from '../types/errors';
import { htmlToText, truncateText, SanitizeResult } from './sanitize';
import { redactString } from '../security/redact';

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  title: string | null;
  text: string;
  bytesReceived: number;
  flaggedInjection: boolean;
}

export interface FetchOptions {
  url: string;
  maxBytes?: number;
  timeoutMs?: number;
  maxChars?: number;
}

const PRIVATE_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fe80:/i,
];

const guardUrl = (raw: string): URL => {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ForgeRuntimeError({
      class: 'user_input',
      message: `Invalid URL: ${raw}`,
      retryable: false,
    });
  }
  if (!/^https?:$/.test(u.protocol)) {
    throw new ForgeRuntimeError({
      class: 'sandbox_violation',
      message: `Protocol ${u.protocol} is not allowed (http/https only).`,
      retryable: false,
    });
  }
  const host = u.hostname;
  for (const re of PRIVATE_HOSTS) {
    if (re.test(host)) {
      throw new ForgeRuntimeError({
        class: 'sandbox_violation',
        message: `SSRF guard: ${host} is a private/loopback address.`,
        retryable: false,
      });
    }
  }
  return u;
};

export const webFetch = async (opts: FetchOptions): Promise<FetchResult> => {
  const u = guardUrl(opts.url);
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const res = await request(u.toString(), {
    method: 'GET',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': 'Forge/0.1 (+https://github.com/forge/forge)',
    },
    maxRedirections: 5,
    bodyTimeout: opts.timeoutMs ?? 15_000,
    headersTimeout: opts.timeoutMs ?? 15_000,
  });
  const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
  if (
    !contentType.includes('text/') &&
    !contentType.includes('application/json') &&
    !contentType.includes('xml')
  ) {
    throw new ForgeRuntimeError({
      class: 'tool_error',
      message: `Refusing to fetch non-text content-type: ${contentType}`,
      retryable: false,
    });
  }
  let chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of res.body) {
    const buf = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
    chunks.push(buf);
    bytes += buf.length;
    if (bytes > maxBytes) break;
  }
  const raw = Buffer.concat(chunks, Math.min(bytes, maxBytes)).toString('utf8');
  let body: SanitizeResult;
  if (contentType.includes('html') || contentType.includes('xml')) {
    body = htmlToText(raw);
  } else {
    body = { text: raw, title: null, flaggedInjection: false };
  }
  const text = redactString(truncateText(body.text, opts.maxChars ?? 20_000));
  return {
    url: opts.url,
    finalUrl: u.toString(),
    status: res.statusCode ?? 0,
    contentType,
    title: body.title,
    text,
    bytesReceived: bytes,
    flaggedInjection: body.flaggedInjection,
  };
};
