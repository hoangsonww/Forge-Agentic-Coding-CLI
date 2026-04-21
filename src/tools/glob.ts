import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { runCommand } from '../sandbox/shell';

/**
 * Glob files matching a pattern. This is useful for finding files when you don't know the exact path, or for inspecting the structure of the project. It supports basic glob patterns like `*`, `**`, and `?`. Use with caution, as complex patterns or large directories can lead to long execution times (though we have a timeout in place to mitigate this).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

interface Args {
  pattern: string;
  path?: string;
  maxResults?: number;
}

export const globTool: Tool<Args, { files: string[]; truncated: boolean }> = {
  schema: {
    name: 'glob',
    description: 'Find files matching a glob pattern.',
    sideEffect: 'readonly',
    risk: 'low',
    permissionDefault: 'allow',
    sensitivity: 'low',
    timeoutMs: 20_000,
    inputSchema: {
      type: 'object',
      required: ['pattern'],
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' },
        maxResults: { type: 'number' },
      },
    },
  },
  async execute(args, ctx): Promise<ToolResult<{ files: string[]; truncated: boolean }>> {
    const start = Date.now();
    const max = args.maxResults ?? 500;
    try {
      const searchPath = args.path ?? '.';
      // bash globstar for **
      const cmd = `shopt -s globstar 2>/dev/null; ls -1d ${searchPath.replace(
        /\/?$/,
        '/',
      )}${args.pattern} 2>/dev/null | head -n ${max}`;
      const res = await runCommand(cmd, { cwd: ctx.projectRoot, timeoutMs: 18_000 });
      const files = res.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max);
      return {
        success: true,
        output: { files, truncated: files.length >= max },
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
