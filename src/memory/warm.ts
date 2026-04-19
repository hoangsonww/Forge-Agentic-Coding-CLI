/**
 * Warm memory: dependency-graph traversal plus lightweight symbol index.
 *
 * Built on-demand per task. Uses fast, language-agnostic heuristics —
 * imports/requires/use statements in common syntaxes. Not a tree-sitter
 * replacement; it's there to pull in adjacent files when you're working on
 * one specific file.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveSafe } from '../sandbox/fs';

const EXT_IMPORT_PATTERNS: Array<{ ext: string; patterns: RegExp[] }> = [
  {
    ext: '.ts',
    patterns: [/^import\s+(?:.+?from\s+)?['"](\.[^'"]+)['"]/gm, /require\(['"](\.[^'"]+)['"]\)/g],
  },
  {
    ext: '.tsx',
    patterns: [/^import\s+(?:.+?from\s+)?['"](\.[^'"]+)['"]/gm],
  },
  {
    ext: '.js',
    patterns: [/^import\s+(?:.+?from\s+)?['"](\.[^'"]+)['"]/gm, /require\(['"](\.[^'"]+)['"]\)/g],
  },
  { ext: '.jsx', patterns: [/^import\s+(?:.+?from\s+)?['"](\.[^'"]+)['"]/gm] },
  { ext: '.py', patterns: [/^from\s+\.([\w.]+)\s+import/gm, /^import\s+\.([\w.]+)/gm] },
  { ext: '.go', patterns: [/^\s*import\s+"([^"]+)"/gm] },
  { ext: '.rs', patterns: [/^use\s+crate::([\w:]+)/gm] },
];

const CANDIDATES = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs'];

const tryResolve = (from: string, spec: string, projectRoot: string): string | null => {
  // Handle relative only; non-relative paths are external packages we don't chase.
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const ext of CANDIDATES) {
    const candidate = base.endsWith(ext) ? base : base + ext;
    if (fs.existsSync(candidate)) {
      try {
        return resolveSafe(candidate, { projectRoot }, 'read');
      } catch {
        return null;
      }
    }
    // index.ts etc
    const indexCandidate = path.join(base, 'index' + ext);
    if (fs.existsSync(indexCandidate)) {
      try {
        return resolveSafe(indexCandidate, { projectRoot }, 'read');
      } catch {
        return null;
      }
    }
  }
  return null;
};

export const collectRelated = (
  seedFile: string,
  projectRoot: string,
  opts: { maxFiles?: number; maxDepth?: number } = {},
): string[] => {
  const maxFiles = opts.maxFiles ?? 12;
  const maxDepth = opts.maxDepth ?? 2;
  const visited = new Set<string>();
  const queue: Array<{ file: string; depth: number }> = [{ file: seedFile, depth: 0 }];
  const out: string[] = [];

  while (queue.length && out.length < maxFiles) {
    const { file, depth } = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);
    out.push(file);
    if (depth >= maxDepth) continue;
    const ext = path.extname(file);
    const rules = EXT_IMPORT_PATTERNS.find((r) => r.ext === ext);
    if (!rules) continue;
    let content = '';
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const re of rules.patterns) {
      // Matches global regex; reset lastIndex since RegExp state is shared.
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) && out.length < maxFiles) {
        const next = tryResolve(file, m[1], projectRoot);
        if (next && !visited.has(next)) {
          queue.push({ file: next, depth: depth + 1 });
        }
      }
    }
  }
  return out;
};

export const sampleFileExcerpts = (
  files: string[],
  bytesPerFile = 3000,
): Array<{ source: string; content: string }> => {
  return files.map((f) => {
    try {
      const buf = fs.readFileSync(f);
      const content =
        buf.length > bytesPerFile
          ? buf.slice(0, bytesPerFile).toString('utf8') + '\n…[truncated]'
          : buf.toString('utf8');
      return { source: f, content };
    } catch {
      return { source: f, content: '' };
    }
  });
};
