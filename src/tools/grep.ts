import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { runCommand } from '../sandbox/shell';

interface Args {
  pattern: string;
  path?: string;
  glob?: string;
  caseInsensitive?: boolean;
  maxResults?: number;
}

interface Match {
  file: string;
  line: number;
  content: string;
}

const hasRipgrep = async (cwd: string): Promise<boolean> => {
  try {
    const res = await runCommand('command -v rg', { cwd, timeoutMs: 3000 });
    return res.exitCode === 0;
  } catch {
    return false;
  }
};

export const grepTool: Tool<Args, { matches: Match[]; truncated: boolean }> = {
  schema: {
    name: 'grep',
    description: 'Search for a regex pattern across files (ripgrep if available, else BSD grep).',
    sideEffect: 'readonly',
    risk: 'low',
    permissionDefault: 'allow',
    sensitivity: 'low',
    timeoutMs: 30_000,
    inputSchema: {
      type: 'object',
      required: ['pattern'],
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' },
        glob: { type: 'string' },
        caseInsensitive: { type: 'boolean' },
        maxResults: { type: 'number' },
      },
    },
  },
  async execute(args, ctx): Promise<ToolResult<{ matches: Match[]; truncated: boolean }>> {
    const start = Date.now();
    const max = args.maxResults ?? 200;
    try {
      const useRg = await hasRipgrep(ctx.projectRoot);
      const searchPath = args.path ?? '.';
      let cmd: string;
      if (useRg) {
        const flags = ['--line-number', '--no-heading', '--color=never', '-m', String(max)];
        if (args.caseInsensitive) flags.push('-i');
        if (args.glob) flags.push('-g', shQuote(args.glob));
        cmd = `rg ${flags.join(' ')} ${shQuote(args.pattern)} ${shQuote(searchPath)}`;
      } else {
        cmd = `grep -R -n ${args.caseInsensitive ? '-i ' : ''}${shQuote(args.pattern)} ${shQuote(
          searchPath,
        )} | head -n ${max}`;
      }
      const res = await runCommand(cmd, {
        cwd: ctx.projectRoot,
        timeoutMs: 25_000,
      });
      const matches: Match[] = [];
      for (const line of res.stdout.split('\n')) {
        if (!line.trim()) continue;
        // Format: file:line:content
        const firstColon = line.indexOf(':');
        if (firstColon < 0) continue;
        const secondColon = line.indexOf(':', firstColon + 1);
        if (secondColon < 0) continue;
        const file = line.slice(0, firstColon);
        const lineNo = Number(line.slice(firstColon + 1, secondColon));
        const content = line.slice(secondColon + 1);
        if (!Number.isFinite(lineNo)) continue;
        matches.push({ file, line: lineNo, content });
        if (matches.length >= max) break;
      }
      const truncated = matches.length >= max;
      return {
        success: true,
        output: { matches, truncated },
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

const shQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;
