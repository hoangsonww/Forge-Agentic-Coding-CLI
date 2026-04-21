import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { runCommand } from '../sandbox/shell';

/**
 * Git-related tools for inspecting status, viewing diffs, and managing branches. These are essential for any codebase using git, and can be used in combination with file editing tools to implement complex workflows like code review, refactoring, or release management.
 *
 * Note: these tools assume that the project is a git repository and that git is installed. They will fail if these conditions aren't met.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

interface StatusArgs {
  porcelain?: boolean;
}

interface DiffArgs {
  staged?: boolean;
  path?: string;
}

interface BranchArgs {
  name: string;
  create?: boolean;
}

export const gitStatusTool: Tool<StatusArgs, { output: string }> = {
  schema: {
    name: 'git_status',
    description: 'Show git working-tree status.',
    sideEffect: 'readonly',
    risk: 'low',
    permissionDefault: 'allow',
    sensitivity: 'low',
    timeoutMs: 15_000,
    inputSchema: { type: 'object', properties: { porcelain: { type: 'boolean' } } },
  },
  async execute(args, ctx): Promise<ToolResult<{ output: string }>> {
    const start = Date.now();
    try {
      const cmd = args.porcelain ? 'git status --porcelain=v1' : 'git status';
      const res = await runCommand(cmd, { cwd: ctx.projectRoot, timeoutMs: 10_000 });
      return {
        success: res.exitCode === 0,
        output: { output: res.stdout },
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

export const gitDiffTool: Tool<DiffArgs, { diff: string }> = {
  schema: {
    name: 'git_diff',
    description: 'Show git diff (unstaged by default).',
    sideEffect: 'readonly',
    risk: 'low',
    permissionDefault: 'allow',
    sensitivity: 'low',
    timeoutMs: 20_000,
    inputSchema: {
      type: 'object',
      properties: { staged: { type: 'boolean' }, path: { type: 'string' } },
    },
  },
  async execute(args, ctx): Promise<ToolResult<{ diff: string }>> {
    const start = Date.now();
    try {
      const cmd = `git diff ${args.staged ? '--staged ' : ''}${args.path ?? ''}`.trim();
      const res = await runCommand(cmd, { cwd: ctx.projectRoot, timeoutMs: 18_000 });
      return {
        success: res.exitCode === 0,
        output: { diff: res.stdout },
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

export const gitBranchTool: Tool<BranchArgs, { branch: string; created: boolean }> = {
  schema: {
    name: 'git_branch',
    description: 'Switch to or create a git branch.',
    sideEffect: 'write',
    risk: 'low',
    permissionDefault: 'allow',
    sensitivity: 'low',
    timeoutMs: 15_000,
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' }, create: { type: 'boolean' } },
    },
  },
  async execute(args, ctx): Promise<ToolResult<{ branch: string; created: boolean }>> {
    const start = Date.now();
    try {
      const cmd = args.create
        ? `git switch -c ${shQuote(args.name)}`
        : `git switch ${shQuote(args.name)}`;
      const res = await runCommand(cmd, { cwd: ctx.projectRoot, timeoutMs: 10_000 });
      if (res.exitCode !== 0) {
        return {
          success: false,
          error: { class: 'tool_error', message: res.stderr || res.stdout, retryable: false },
          durationMs: Date.now() - start,
        };
      }
      return {
        success: true,
        output: { branch: args.name, created: Boolean(args.create) },
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
