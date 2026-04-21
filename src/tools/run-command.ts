/**
 * Run an arbitrary shell command inside the project sandbox. This is a powerful tool that can be used for a wide range of tasks, such as building the project, running tests, generating files, or performing complex file operations that aren't covered by other tools. However, it also carries significant risks, as it can potentially modify or delete files, consume excessive resources, or perform other harmful actions if misused. To mitigate these risks, we have implemented a blocklist of dangerous commands and a risk classification system that can be used to prompt the user for permission when executing high-risk commands. Use this tool with caution and always ensure that the commands being run are safe and necessary for the task at hand.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { runCommand, classifyCommandRisk, isBlocked } from '../sandbox/shell';

interface Args {
  command: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  stdin?: string;
}

interface Output {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

export const runCommandTool: Tool<Args, Output> = {
  schema: {
    name: 'run_command',
    description: 'Execute a shell command inside the project sandbox.',
    sideEffect: 'execute',
    risk: 'high',
    permissionDefault: 'ask',
    sensitivity: 'high',
    timeoutMs: 120_000,
    inputSchema: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string' },
        timeoutMs: { type: 'number' },
        env: { type: 'object' },
        stdin: { type: 'string' },
      },
    },
  },
  async execute(args, ctx): Promise<ToolResult<Output>> {
    const start = Date.now();
    try {
      if (isBlocked(args.command)) {
        throw new ForgeRuntimeError({
          class: 'sandbox_violation',
          message: `Blocked command: ${args.command}`,
          retryable: false,
        });
      }
      const risk = classifyCommandRisk(args.command);
      if (risk === 'critical') {
        throw new ForgeRuntimeError({
          class: 'sandbox_violation',
          message: `Critical-risk command blocked: ${args.command}`,
          retryable: false,
        });
      }
      const res = await runCommand(args.command, {
        cwd: ctx.projectRoot,
        timeoutMs: args.timeoutMs ?? 120_000,
        env: args.env,
        stdin: args.stdin,
      });
      return {
        success: res.exitCode === 0 && !res.timedOut,
        output: {
          stdout: res.stdout,
          stderr: res.stderr,
          exitCode: res.exitCode,
          signal: res.signal,
          timedOut: res.timedOut,
        },
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
