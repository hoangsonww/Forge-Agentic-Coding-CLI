/**
 * Unified retrieval engine. Hybrid: FTS5 cold + dependency graph warm +
 * recency boost from the hot cache + failure-aware lookup from learning
 * memory. Returns a small, focused context bundle for the prompt assembler.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import * as path from 'path';
import { HotMemory } from './hot';
import { collectRelated, sampleFileExcerpts } from './warm';
import { search as coldSearch } from './cold';
import { relevantPatterns } from './learning';
import { fenceUntrusted } from '../security/injection';

export interface RetrievedContext {
  blocks: Array<{ source: string; content: string }>;
  coldHits: number;
  warmFiles: number;
  learningHits: number;
}

export interface RetrieveOptions {
  projectRoot: string;
  query: string;
  seedFile?: string;
  hot?: HotMemory;
  maxColdHits?: number;
  maxWarmFiles?: number;
  includeLearning?: boolean;
}

export const retrieve = (opts: RetrieveOptions): RetrievedContext => {
  const blocks: Array<{ source: string; content: string }> = [];
  let coldHits = 0;
  let warmFiles = 0;
  let learningHits = 0;

  // Hot snapshot goes first (already trusted since it's in-process).
  if (opts.hot) {
    for (const e of opts.hot.snapshot()) {
      blocks.push({ source: `hot:${e.source}`, content: e.content });
    }
  }

  // Warm: dependency graph traversal from seed file.
  if (opts.seedFile) {
    try {
      const related = collectRelated(opts.seedFile, opts.projectRoot, {
        maxFiles: opts.maxWarmFiles ?? 8,
      });
      const excerpts = sampleFileExcerpts(related);
      for (const ex of excerpts) {
        const rel = path.relative(opts.projectRoot, ex.source);
        blocks.push({
          source: `warm:${rel}`,
          content: fenceUntrusted(rel, ex.content),
        });
      }
      warmFiles = related.length;
    } catch {
      /* ignore */
    }
  }

  // Cold: BM25 search.
  try {
    const hits = coldSearch(opts.projectRoot, opts.query, opts.maxColdHits ?? 8);
    for (const h of hits) {
      blocks.push({
        source: `cold:${h.path}`,
        content: fenceUntrusted(h.path, h.snippet),
      });
    }
    coldHits = hits.length;
  } catch {
    /* ignore */
  }

  // Learning: failure-aware retrieval.
  if (opts.includeLearning !== false) {
    try {
      const patterns = relevantPatterns(opts.query, 3);
      if (patterns.length) {
        const body = patterns
          .map(
            (p) =>
              `- pattern: ${p.pattern}\n  confidence: ${p.confidence.toFixed(2)}\n  fix: ${p.fix}`,
          )
          .join('\n');
        blocks.push({
          source: 'learning',
          content: `Relevant past patterns (from Forge learning memory):\n${body}`,
        });
        learningHits = patterns.length;
      }
    } catch {
      /* ignore */
    }
  }

  return { blocks, coldHits, warmFiles, learningHits };
};
