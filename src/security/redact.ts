/**
 * Secret redaction. Applied before any persisted write (logs, session JSONL,
 * notifications) and before every model prompt. See planning doc "Final
 * Integrated Control & Reliability Layer" §11 — this is mandatory across all
 * execution paths.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const REDACTED = '****REDACTED****';

// Keep patterns anchored and greedy-safe. Order matters — more specific first.
const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'aws_access_key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'aws_secret_key', re: /\b[A-Za-z0-9/+=]{40}\b(?=(?:.{0,40}aws|.{0,40}secret)?)/gi },
  { name: 'github_token', re: /\bghp_[A-Za-z0-9]{36}\b/g },
  { name: 'github_oauth', re: /\bgho_[A-Za-z0-9]{36}\b/g },
  { name: 'github_app', re: /\bghs_[A-Za-z0-9]{36}\b/g },
  { name: 'openai_key', re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: 'anthropic_key', re: /\bsk-ant-[A-Za-z0-9-_]{20,}\b/g },
  { name: 'slack_token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  { name: 'bearer', re: /\b(?:Bearer|bearer)\s+[A-Za-z0-9._~+/=-]{16,}\b/g },
  {
    name: 'private_key',
    re: /-----BEGIN[^-]+PRIVATE KEY-----[\s\S]+?-----END[^-]+PRIVATE KEY-----/g,
  },
];

const ENV_KEYS_TO_REDACT = [
  'API_KEY',
  'SECRET',
  'TOKEN',
  'PASSWORD',
  'PASSWD',
  'PRIVATE_KEY',
  'ACCESS_KEY',
  'AUTH',
  'CREDENTIAL',
];

const isSensitiveKey = (key: string): boolean => {
  const upper = key.toUpperCase();
  return ENV_KEYS_TO_REDACT.some((s) => upper.includes(s));
};

export const redactString = (input: string): string => {
  let out = input;
  for (const { re } of PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  // Common key=value patterns (env-like)
  out = out.replace(/(\b[A-Z][A-Z0-9_]{2,}\s*=\s*)(["']?)([^\s"']+)\2/g, (match, key, q) => {
    const rawKey = (match.split('=')[0] || '').trim();
    if (isSensitiveKey(rawKey)) {
      return `${key}${q}${REDACTED}${q}`;
    }
    return match;
  });
  return out;
};

export const redact = (value: unknown): unknown => {
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k) && typeof v === 'string') {
        out[k] = REDACTED;
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
};

export const redactEnv = (
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> => {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    out[k] = isSensitiveKey(k) ? REDACTED : v;
  }
  return out;
};
