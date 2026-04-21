/**
 * Run the project test suite. This tool attempts to auto-detect the test framework based on common configuration files (e.g., package.json for npm, pyproject.toml for pytest, go.mod for Go, Cargo.toml for Rust) and runs the appropriate test command. You can also specify the framework explicitly if auto-detection fails or if you want to override it. The output includes the detected framework, standard output, standard error, exit code, and whether the tests passed. Use with caution, as running tests can have side effects (e.g., modifying files, making network requests) and may take a long time to execute depending on the size of the test suite.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolResult } from '../types';
import { runCommand } from '../sandbox/shell';
import { ForgeRuntimeError } from '../types/errors';

interface Args {
  framework?: 'auto' | 'npm' | 'pnpm' | 'yarn' | 'pytest' | 'go' | 'cargo';
  target?: string;
  timeoutMs?: number;
}

interface Output {
  framework: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  passed: boolean;
}

const detectFramework = (root: string): string => {
  if (fs.existsSync(path.join(root, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      if (pkg?.scripts?.test) return 'npm';
    } catch {
      /* ignore */
    }
  }
  if (
    fs.existsSync(path.join(root, 'pyproject.toml')) ||
    fs.existsSync(path.join(root, 'pytest.ini'))
  ) {
    return 'pytest';
  }
  if (fs.existsSync(path.join(root, 'go.mod'))) return 'go';
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) return 'cargo';
  return 'none';
};

const commandFor = (framework: string, target?: string): string | null => {
  switch (framework) {
    case 'npm':
      return `npm test${target ? ` -- ${target}` : ''}`;
    case 'pnpm':
      return `pnpm test${target ? ` -- ${target}` : ''}`;
    case 'yarn':
      return `yarn test${target ? ` ${target}` : ''}`;
    case 'pytest':
      return `pytest${target ? ` ${target}` : ''}`;
    case 'go':
      return `go test ${target ?? './...'}`;
    case 'cargo':
      return `cargo test${target ? ` ${target}` : ''}`;
    default:
      return null;
  }
};

export const runTestsTool: Tool<Args, Output> = {
  schema: {
    name: 'run_tests',
    description: 'Run the project test suite (auto-detects framework).',
    sideEffect: 'execute',
    risk: 'medium',
    permissionDefault: 'ask',
    sensitivity: 'medium',
    timeoutMs: 600_000,
    inputSchema: {
      type: 'object',
      properties: {
        framework: { type: 'string' },
        target: { type: 'string' },
        timeoutMs: { type: 'number' },
      },
    },
  },
  async execute(args, ctx): Promise<ToolResult<Output>> {
    const start = Date.now();
    try {
      const framework =
        args.framework && args.framework !== 'auto'
          ? args.framework
          : detectFramework(ctx.projectRoot);
      const cmd = commandFor(framework, args.target);
      if (!cmd) {
        throw new ForgeRuntimeError({
          class: 'not_found',
          message: 'No test framework detected.',
          retryable: false,
          recoveryHint: 'Specify framework explicitly or add a test runner.',
        });
      }
      const res = await runCommand(cmd, {
        cwd: ctx.projectRoot,
        timeoutMs: args.timeoutMs ?? 300_000,
      });
      return {
        success: res.exitCode === 0,
        output: {
          framework,
          stdout: res.stdout,
          stderr: res.stderr,
          exitCode: res.exitCode,
          passed: res.exitCode === 0,
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
