/**
 * Move (rename) a file or directory within the sandbox. This is a basic file operation that can be used for organizing files, implementing "save as" functionality, or moving generated files to their final location. Use `overwrite` to allow replacing existing files, and `createDirs` to automatically create parent directories if they don't exist.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { resolveSafe } from '../sandbox/fs';

interface Args {
  from: string;
  to: string;
  overwrite?: boolean;
  createDirs?: boolean;
}

export const moveFileTool: Tool<Args, { from: string; to: string }> = {
  schema: {
    name: 'move_file',
    description:
      'Move (rename) a file or directory within the sandbox. Missing parent directories at the destination are created automatically; pass createDirs:false to disable.',
    sideEffect: 'write',
    risk: 'medium',
    permissionDefault: 'ask',
    sensitivity: 'medium',
    timeoutMs: 10_000,
    inputSchema: {
      type: 'object',
      required: ['from', 'to'],
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        overwrite: { type: 'boolean' },
        createDirs: { type: 'boolean' },
      },
    },
  },
  async execute(args, ctx): Promise<ToolResult<{ from: string; to: string }>> {
    const start = Date.now();
    try {
      const src = resolveSafe(args.from, { projectRoot: ctx.projectRoot }, 'write');
      const dst = resolveSafe(args.to, { projectRoot: ctx.projectRoot }, 'write');
      if (!fs.existsSync(src)) {
        throw new ForgeRuntimeError({
          class: 'not_found',
          message: `source not found: ${args.from}`,
          retryable: false,
        });
      }
      if (fs.existsSync(dst) && !args.overwrite) {
        throw new ForgeRuntimeError({
          class: 'conflict',
          message: `destination exists: ${args.to}. pass overwrite=true to replace.`,
          retryable: false,
        });
      }
      // Match write_file semantics: mkdir-p is the default. Opt out with
      // `createDirs: false` if you want a missing destination parent to fail.
      if (args.createDirs !== false) fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.renameSync(src, dst);
      return {
        success: true,
        output: { from: args.from, to: args.to },
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
