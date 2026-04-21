/**
 * Pluggable web search. Supports:
 *   - tavily (if TAVILY_API_KEY is set)
 *   - brave (if BRAVE_SEARCH_API_KEY is set)
 *   - duckduckgo HTML fallback (no key, best-effort)
 *
 * Provider precedence follows the env vars above. Results are normalized to a
 * common shape and always traverse the injection/redaction pipeline before
 * being returned to a caller.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { request } from 'undici';
import { redactString } from '../security/redact';
import { htmlToText, truncateText } from './sanitize';
import { log } from '../logging/logger';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  timeoutMs?: number;
}

const tavily = async (opts: SearchOptions): Promise<SearchResult[] | null> => {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  const res = await request('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query: opts.query,
      max_results: opts.limit ?? 5,
      search_depth: 'basic',
    }),
    bodyTimeout: opts.timeoutMs ?? 10_000,
    headersTimeout: opts.timeoutMs ?? 10_000,
  });
  if (res.statusCode !== 200) return null;
  const body = (await res.body.json()) as {
    results?: Array<{ title: string; url: string; content: string }>;
  };
  return (body.results ?? []).map((r) => ({
    title: redactString(r.title ?? ''),
    url: r.url,
    snippet: redactString(r.content ?? '').slice(0, 500),
  }));
};

const brave = async (opts: SearchOptions): Promise<SearchResult[] | null> => {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return null;
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', opts.query);
  url.searchParams.set('count', String(opts.limit ?? 5));
  const res = await request(url.toString(), {
    headers: { 'X-Subscription-Token': key, accept: 'application/json' },
    bodyTimeout: opts.timeoutMs ?? 10_000,
    headersTimeout: opts.timeoutMs ?? 10_000,
  });
  if (res.statusCode !== 200) return null;
  const body = (await res.body.json()) as {
    web?: { results?: Array<{ title: string; url: string; description: string }> };
  };
  return (body.web?.results ?? []).map((r) => ({
    title: redactString(r.title ?? ''),
    url: r.url,
    snippet: redactString(r.description ?? '').slice(0, 500),
  }));
};

const duckduckgo = async (opts: SearchOptions): Promise<SearchResult[] | null> => {
  const url = new URL('https://duckduckgo.com/html/');
  url.searchParams.set('q', opts.query);
  try {
    const res = await request(url.toString(), {
      headers: {
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
        accept: 'text/html',
      },
      bodyTimeout: opts.timeoutMs ?? 10_000,
      headersTimeout: opts.timeoutMs ?? 10_000,
    });
    if (res.statusCode !== 200) return [];
    const html = await res.body.text();
    const results: SearchResult[] = [];
    // DDG html results live in <a class="result__a" href="..."> ... </a>
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && results.length < (opts.limit ?? 5)) {
      const url = m[1];
      const titleHtml = m[2];
      const title = htmlToText(titleHtml).text;
      results.push({ title, url, snippet: '' });
    }
    // Fetch snippets from result__snippet
    const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let i = 0;
    let sm: RegExpExecArray | null;
    while ((sm = snippetRe.exec(html)) && i < results.length) {
      results[i].snippet = truncateText(htmlToText(sm[1]).text, 400);
      i++;
    }
    return results;
  } catch (err) {
    log.debug('duckduckgo search failed', { err: String(err) });
    return [];
  }
};

export const webSearch = async (opts: SearchOptions): Promise<SearchResult[]> => {
  try {
    const t = await tavily(opts);
    if (t && t.length) return t;
  } catch (err) {
    log.debug('tavily failed, trying next', { err: String(err) });
  }
  try {
    const b = await brave(opts);
    if (b && b.length) return b;
  } catch (err) {
    log.debug('brave failed, trying next', { err: String(err) });
  }
  return (await duckduckgo(opts)) ?? [];
};
