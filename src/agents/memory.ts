/**
 * Memory agent — maintains the project's context graph. Invoked after
 * planning with a seed file (if any) to populate `imports` edges derived
 * from warm-memory traversal. Deliberately idempotent; safe to re-run.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Agent, AgentResult } from './base';
import { upsertNode, upsertEdge } from '../memory/graph';
import { collectRelated } from '../memory/warm';
import * as path from 'path';
import { log } from '../logging/logger';

export const memoryAgent: Agent = {
  name: 'memory',
  description: 'Maintains the project context graph and long-term memory.',
  async run(ctx): Promise<AgentResult> {
    try {
      const seed =
        ctx.task.profile?.scope === 'single-file'
          ? ctx.task.description?.match(/(^|[\s"'`])((?:\.\/)?[\w./-]+\.[a-z]{1,5})/)?.[2]
          : null;
      const touched: string[] = [];
      if (seed) {
        const absoluteSeed = path.resolve(ctx.projectRoot, seed);
        const related = collectRelated(absoluteSeed, ctx.projectRoot, {
          maxFiles: 20,
          maxDepth: 3,
        });
        for (const f of related) {
          const rel = path.relative(ctx.projectRoot, f);
          upsertNode(ctx.projectRoot, { id: `file:${rel}`, type: 'file', label: rel });
          touched.push(rel);
        }
        const seedRel = path.relative(ctx.projectRoot, absoluteSeed);
        for (const f of related.slice(1)) {
          const rel = path.relative(ctx.projectRoot, f);
          upsertEdge(ctx.projectRoot, {
            src: `file:${seedRel}`,
            dst: `file:${rel}`,
            kind: 'imports',
          });
        }
      }
      return { success: true, output: { filesIndexed: touched.length }, filesChanged: [] };
    } catch (err) {
      log.debug('memory agent non-fatal failure', { err: String(err) });
      return { success: true, message: String(err) };
    }
  },
};
