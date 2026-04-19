/**
 * HTML → markdown-ish plain text + injection-aware scrubbing.
 *
 * We deliberately avoid heavy HTML parsers; a sequence of regex passes gets
 * us 95% of the signal for LLM context at a fraction of the size. For JS-
 * rendered pages we rely on the Playwright-backed `web.browse` tool that
 * already returns rendered text.
 */
import { scanForInjection } from '../security/injection';

const removeBetween = (html: string, tag: string): string =>
  html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');

const stripTags = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ');

const decodeEntities = (s: string): string =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');

export interface SanitizeResult {
  text: string;
  title: string | null;
  flaggedInjection: boolean;
}

export const htmlToText = (html: string): SanitizeResult => {
  let cleaned = html;
  cleaned = removeBetween(cleaned, 'script');
  cleaned = removeBetween(cleaned, 'style');
  cleaned = removeBetween(cleaned, 'noscript');
  cleaned = removeBetween(cleaned, 'template');
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(cleaned);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : null;
  cleaned = cleaned.replace(/<head\b[\s\S]*?<\/head>/gi, ' ');
  cleaned = stripTags(cleaned);
  cleaned = decodeEntities(cleaned);
  cleaned = cleaned
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').trim();
  const injection = scanForInjection(cleaned);
  return {
    text: injection.cleanContent,
    title,
    flaggedInjection: injection.flagged,
  };
};

export const truncateText = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n…[truncated]';
};
