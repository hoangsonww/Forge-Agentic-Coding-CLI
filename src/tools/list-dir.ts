/**
 * List entries in a directory (non-recursive). Returns an array of entry names and types (file vs. directory). Use `maxEntries` to limit the number of entries returned and avoid overwhelming the system with very large directories. This is a read-only operation, but be cautious when listing directories with sensitive information or very large numbers of files.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { resolveSafe } from '../sandbox/fs';

interface Args {
  path?: string;
  maxEntries?: number;
}

interface Entry {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'other';
  size?: number;
}

export const listDirTool: Tool<Args, { entries: Entry[]; truncated: boolean }> = {
  schema: {
    name: 'list_dir',
    description: 'List entries in a directory (non-recursive).',
    sideEffect: 'readonly',
    risk: 'low',
    permissionDefault: 'allow',
    sensitivity: 'low',
    timeoutMs: 10_000,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        maxEntries: { type: 'number' },
      },
    },
  },
  async execute(args, ctx): Promise<ToolResult<{ entries: Entry[]; truncated: boolean }>> {
    const start = Date.now();
    try {
      const real = resolveSafe(args.path ?? '.', { projectRoot: ctx.projectRoot }, 'read');
      const stat = fs.statSync(real);
      if (!stat.isDirectory()) {
        throw new ForgeRuntimeError({
          class: 'tool_error',
          message: `${args.path} is not a directory.`,
          retryable: false,
        });
      }
      const max = args.maxEntries ?? 500;
      const names = fs.readdirSync(real);
      const truncated = names.length > max;
      const limited = names.slice(0, max);
      const entries: Entry[] = limited.map((name) => {
        const full = path.join(real, name);
        try {
          const s = fs.lstatSync(full);
          if (s.isSymbolicLink()) return { name, type: 'symlink' };
          if (s.isDirectory()) return { name, type: 'dir' };
          if (s.isFile()) return { name, type: 'file', size: s.size };
          return { name, type: 'other' };
        } catch {
          return { name, type: 'other' };
        }
      });
      return {
        success: true,
        output: { entries, truncated },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof ForgeRuntimeError
            ? err.toJSON()
            : { class: 'tool_error', message: String(err), retryable: false },
        durationMs: Date.now() - start,
      };
    }
  },
};
