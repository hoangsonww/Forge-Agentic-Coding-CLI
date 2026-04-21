/**
 * Delete a file or directory inside the sandbox. For directories, set `recursive=true` to delete non-empty directories. Use with caution, as this is irreversible and can cause breakage if used improperly.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { resolveSafe } from '../sandbox/fs';

interface Args {
  path: string;
  recursive?: boolean;
}

export const deleteFileTool: Tool<Args, { path: string }> = {
  schema: {
    name: 'delete_file',
    description: 'Delete a file or (with recursive=true) directory inside the sandbox.',
    sideEffect: 'write',
    risk: 'high',
    permissionDefault: 'ask',
    sensitivity: 'high',
    timeoutMs: 10_000,
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string' },
        recursive: { type: 'boolean' },
      },
    },
  },
  async execute(args, ctx): Promise<ToolResult<{ path: string }>> {
    const start = Date.now();
    try {
      const real = resolveSafe(args.path, { projectRoot: ctx.projectRoot }, 'write');
      if (!fs.existsSync(real)) {
        throw new ForgeRuntimeError({
          class: 'not_found',
          message: `path not found: ${args.path}`,
          retryable: false,
        });
      }
      const stat = fs.statSync(real);
      if (stat.isDirectory() && !args.recursive) {
        throw new ForgeRuntimeError({
          class: 'user_input',
          message: `path is a directory; pass recursive=true to delete.`,
          retryable: false,
        });
      }
      if (stat.isDirectory()) fs.rmSync(real, { recursive: true, force: false });
      else fs.unlinkSync(real);
      return { success: true, output: { path: args.path }, durationMs: Date.now() - start };
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
