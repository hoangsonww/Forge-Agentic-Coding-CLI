/**
 * Read a text file from the project sandbox. Returns the content as a string, along with the number of lines and whether the content was truncated due to size limits. Use `maxBytes` to limit the amount of data read and avoid overwhelming the system with very large files. Optionally, use `startLine` and `endLine` to read only a specific range of lines from the file. This is a read-only operation, but be cautious when reading files with sensitive information or very large sizes.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { resolveSafe } from '../sandbox/fs';

interface Args {
  path: string;
  maxBytes?: number;
  startLine?: number;
  endLine?: number;
}

export const readFileTool: Tool<Args, { content: string; lines: number; truncated: boolean }> = {
  schema: {
    name: 'read_file',
    description: 'Read a text file from the project sandbox.',
    sideEffect: 'readonly',
    risk: 'low',
    permissionDefault: 'allow',
    sensitivity: 'low',
    timeoutMs: 15_000,
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string' },
        maxBytes: { type: 'number' },
        startLine: { type: 'number' },
        endLine: { type: 'number' },
      },
    },
  },
  async execute(
    args,
    ctx,
  ): Promise<ToolResult<{ content: string; lines: number; truncated: boolean }>> {
    const start = Date.now();
    try {
      const real = resolveSafe(args.path, { projectRoot: ctx.projectRoot }, 'read');
      const stat = fs.statSync(real);
      if (!stat.isFile()) {
        throw new ForgeRuntimeError({
          class: 'tool_error',
          message: `${args.path} is not a regular file.`,
          retryable: false,
        });
      }
      const max = args.maxBytes ?? 2 * 1024 * 1024;
      const buf = fs.readFileSync(real);
      const truncated = buf.length > max;
      let content = buf.slice(0, max).toString('utf8');
      if (args.startLine || args.endLine) {
        const lines = content.split('\n');
        const s = Math.max(1, args.startLine ?? 1);
        const e = Math.min(lines.length, args.endLine ?? lines.length);
        content = lines.slice(s - 1, e).join('\n');
      }
      return {
        success: true,
        output: { content, lines: content.split('\n').length, truncated },
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
