/**
 * Write a text file inside the sandbox. By default, this will overwrite existing files, but you can change the mode to `create_only` to only create new files (and fail if the file already exists) or `append` to append to existing files. Use with caution, as this can modify or delete important files if used improperly. Always double-check the file path and content before executing this tool, especially when using modes that can overwrite or append to existing files.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { resolveSafe } from '../sandbox/fs';
import { withFileLock, writeAtomic } from '../sandbox/file-lock';

interface Args {
  path: string;
  content: string;
  createDirs?: boolean;
  mode?: 'overwrite' | 'create_only' | 'append';
}

export const writeFileTool: Tool<Args, { bytesWritten: number; existed: boolean }> = {
  schema: {
    name: 'write_file',
    description:
      'Write (create/overwrite/append) a text file inside the sandbox. Missing parent directories are created automatically; pass createDirs:false to disable.',
    sideEffect: 'write',
    risk: 'medium',
    permissionDefault: 'ask',
    sensitivity: 'medium',
    timeoutMs: 15_000,
    inputSchema: {
      type: 'object',
      required: ['path', 'content'],
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        createDirs: { type: 'boolean' },
        mode: { type: 'string', enum: ['overwrite', 'create_only', 'append'] },
      },
    },
  },
  async execute(args, ctx): Promise<ToolResult<{ bytesWritten: number; existed: boolean }>> {
    const start = Date.now();
    try {
      const real = resolveSafe(args.path, { projectRoot: ctx.projectRoot }, 'write');
      // Same per-path mutex as edit_file — two concurrent write_file calls
      // to the same path serialize instead of racing. `existed` is sampled
      // inside the lock so it reflects the state we actually operate on,
      // not a snapshot from before a queued predecessor ran.
      return await withFileLock(real, async () => {
        const existed = fs.existsSync(real);
        if (args.mode === 'create_only' && existed) {
          throw new ForgeRuntimeError({
            class: 'conflict',
            message: `${args.path} already exists (mode=create_only).`,
            retryable: false,
          });
        }
        // Default to mkdir-p so "create src/foo/bar.js" works without the
        // agent having to predict a separate mkdir step first. Opt out
        // with `createDirs: false` to fail when the parent doesn't exist.
        if (args.createDirs !== false) {
          fs.mkdirSync(path.dirname(real), { recursive: true });
        }
        if (args.mode === 'append') {
          // Append is NOT made atomic here. Atomic append would require a
          // full-file rewrite (read all, append in memory, writeAtomic).
          // That's too expensive for large logs and changes the semantics.
          // Callers that need torn-read safety should use overwrite mode.
          fs.appendFileSync(real, args.content, { encoding: 'utf8' });
        } else {
          writeAtomic(real, args.content);
        }
        const stat = fs.statSync(real);
        return {
          success: true,
          output: { bytesWritten: stat.size, existed },
          durationMs: Date.now() - start,
        };
      });
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
