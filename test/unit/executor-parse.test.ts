/**
 * Executor output parsing and tool result digest tests. These are important to ensure that the agent can robustly handle the variety of outputs that a language model might produce, and that tool results are consistently represented for the model to consume in subsequent turns.
 *
 * The parsing tests cover:
 *   -Bare JSON output.
 *   JSON wrapped in markdown code fences.
 *   Malformed JSON handling.
 *   Filtering out actions without a 'tool' field.
 *
 * The digest tests cover:
 *   Normalizing 'run_command' results to a consistent shape and truncating long output.
 *   Surface error class and message when a tool execution fails, ensuring that the model receives useful information about what went wrong.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import {
  _parseExecutorOutputForTest as parse,
  _digestToolResultForTest as digest,
} from '../../src/agents/executor';

describe('executor output parsing', () => {
  it('parses bare JSON', () => {
    const out = parse('{"actions":[{"tool":"read_file","args":{"path":"a.ts"}}],"summary":"x"}');
    expect(out.actions).toHaveLength(1);
    expect(out.actions[0].tool).toBe('read_file');
    expect(out.summary).toBe('x');
    expect(out.done).toBe(false);
  });

  it('parses fenced JSON blocks', () => {
    const out = parse('```json\n{"actions":[],"summary":"done","done":true}\n```');
    expect(out.actions).toHaveLength(0);
    expect(out.done).toBe(true);
  });

  it('drops actions that have no tool field', () => {
    const out = parse('{"actions":[{"args":{}},{"tool":"read_file","args":{}}],"summary":""}');
    expect(out.actions).toHaveLength(1);
    expect(out.actions[0].tool).toBe('read_file');
  });

  it('returns empty actions on malformed JSON without throwing', () => {
    const out = parse('not-json');
    expect(out.actions).toEqual([]);
    expect(out.summary).toBe('');
    expect(out.done).toBe(false);
  });
});

describe('executor tool-result digest', () => {
  it('normalises run_command-shaped results and truncates long output', () => {
    const bigStdout = 'a'.repeat(10_000);
    const d = digest({
      tool: 'run_command',
      args: { command: 'echo hi' },
      result: {
        success: true,
        output: { stdout: bigStdout, stderr: '', exitCode: 0, signal: null, timedOut: false },
        durationMs: 12,
      },
    });
    expect(d.tool).toBe('run_command');
    expect(d.success).toBe(true);
    expect(d.exitCode).toBe(0);
    expect(String(d.stdout).length).toBeLessThan(bigStdout.length);
    expect(String(d.stdout)).toContain('truncated');
  });

  it('surfaces error class and message on failure', () => {
    const d = digest({
      tool: 'run_tests',
      args: {},
      result: {
        success: false,
        error: { class: 'tool_error', message: 'nope', retryable: true },
        durationMs: 1,
      },
    });
    expect(d.success).toBe(false);
    expect((d.error as { class: string }).class).toBe('tool_error');
    expect((d.error as { message: string }).message).toContain('nope');
  });
});
