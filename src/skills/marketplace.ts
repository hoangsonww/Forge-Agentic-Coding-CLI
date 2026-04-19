/**
 * Skill marketplace / remote registry. Today's implementation pulls skill
 * manifests from any HTTPS URL; the user is always asked before we fetch or
 * install. Results live in `~/.forge/skills/<name>.md`. A hosted registry
 * can be layered on top later — the surface stays the same.
 */
import * as fs from 'fs';
import * as path from 'path';
import { request } from 'undici';
import { paths, ensureForgeHome } from '../config/paths';
import { ForgeRuntimeError } from '../types/errors';
import { scanForInjection } from '../security/injection';
import { redactString } from '../security/redact';
import { log } from '../logging/logger';

export interface RegistryEntry {
  name: string;
  description: string;
  url: string;
  source: string;
}

const DEFAULT_REGISTRY =
  process.env.FORGE_SKILLS_REGISTRY ??
  'https://raw.githubusercontent.com/forge/skills/main/registry.json';

export const fetchRegistry = async (url: string = DEFAULT_REGISTRY): Promise<RegistryEntry[]> => {
  const res = await request(url, {
    method: 'GET',
    headers: { 'user-agent': 'forge-skills', accept: 'application/json' },
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
  });
  if (res.statusCode !== 200) return [];
  try {
    const body = (await res.body.json()) as { skills?: RegistryEntry[] };
    return body.skills ?? [];
  } catch (err) {
    log.debug('registry parse failed', { err: String(err) });
    return [];
  }
};

export const searchRegistry = async (query: string): Promise<RegistryEntry[]> => {
  const entries = await fetchRegistry();
  const q = query.toLowerCase();
  return entries.filter(
    (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
  );
};

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
  if (u.protocol !== 'https:') {
    throw new ForgeRuntimeError({
      class: 'policy_violation',
      message: `Only https:// skill URLs are allowed (got ${u.protocol}).`,
      retryable: false,
    });
  }
  return u;
};

export const installFromUrl = async (
  name: string,
  url: string,
  opts: { overwrite?: boolean } = {},
): Promise<{ path: string; injectionFlagged: boolean }> => {
  guardUrl(url);
  ensureForgeHome();
  const safeName = name.replace(/[^a-z0-9-_]/gi, '_');
  const target = path.join(paths.skills, `${safeName}.md`);
  if (fs.existsSync(target) && !opts.overwrite) {
    throw new ForgeRuntimeError({
      class: 'conflict',
      message: `Skill '${name}' already exists. Pass overwrite=true to replace.`,
      retryable: false,
    });
  }
  const res = await request(url, {
    method: 'GET',
    headers: { 'user-agent': 'forge-skills', accept: 'text/plain, text/markdown' },
    maxRedirections: 5,
    bodyTimeout: 15_000,
    headersTimeout: 15_000,
  });
  if (res.statusCode !== 200) {
    throw new ForgeRuntimeError({
      class: 'tool_error',
      message: `Skill download failed: HTTP ${res.statusCode}`,
      retryable: true,
    });
  }
  const body = await res.body.text();
  const scan = scanForInjection(body);
  const sanitized = redactString(body);
  fs.writeFileSync(target, sanitized, 'utf8');
  return { path: target, injectionFlagged: scan.flagged };
};
