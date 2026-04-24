/**
 * Ask the user a question and return their answer. Use this for clarifications or decisions that require human judgment. Avoid overusing, as it interrupts flow and requires user attention.
 *
 * If `choices` are provided, the user will be prompted to select from them. Otherwise, they can enter free-form text.
 *
 * In non-interactive environments (e.g. when stdin is not a TTY), this tool will return `nonInteractiveDefault` if provided, or an error if not.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import prompts from 'prompts';
import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { chooseNumbered } from '../cli/choose';

interface Args {
  question: string;
  choices?: string[];
  defaultValue?: string;
  nonInteractiveDefault?: string;
}

export const askUserTool: Tool<Args, { answer: string }> = {
  schema: {
    name: 'ask_user',
    description:
      'Ask the user a clarifying question when the ORIGINAL request is genuinely ambiguous. Do NOT call this to recover from tool errors — retry with different args or switch tools instead. Requires a clear, non-empty question (>= 3 chars).',
    sideEffect: 'pure',
    risk: 'low',
    permissionDefault: 'allow',
    sensitivity: 'low',
    timeoutMs: 600_000,
    inputSchema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string' },
        choices: { type: 'array', items: { type: 'string' } },
        defaultValue: { type: 'string' },
        nonInteractiveDefault: { type: 'string' },
      },
    },
  },
  async execute(args): Promise<ToolResult<{ answer: string }>> {
    const start = Date.now();
    // Reject malformed calls fast so the executor can recover (non-retryable,
    // so it'll switch tools instead of looping on the same bad call).
    // Common failure mode: a smaller model calls ask_user after a tool error
    // to "ask the user how to proceed" with a malformed or empty question.
    // The executor prompt forbids that — this is belt-and-braces.
    if (typeof args.question !== 'string' || args.question.trim().length < 3) {
      return {
        success: false,
        error: {
          class: 'user_input',
          message:
            'ask_user requires a clear, non-empty question (>= 3 chars). Tool errors should be recovered by retrying with different args or switching tools — not by calling ask_user.',
          retryable: false,
        },
        durationMs: Date.now() - start,
      };
    }
    if (!process.stdin.isTTY) {
      if (args.nonInteractiveDefault !== undefined) {
        return {
          success: true,
          output: { answer: args.nonInteractiveDefault },
          durationMs: Date.now() - start,
        };
      }
      return {
        success: false,
        error: {
          class: 'user_input',
          message: 'ask_user invoked in non-interactive mode with no default.',
          retryable: false,
        },
        durationMs: Date.now() - start,
      };
    }
    try {
      let answer = '';
      if (args.choices && args.choices.length) {
        const picked = await chooseNumbered<string>({
          message: args.question,
          choices: args.choices.map((c) => ({ title: c, value: c })),
          initial: args.defaultValue ? Math.max(0, args.choices.indexOf(args.defaultValue)) : 0,
        });
        answer = picked ?? args.defaultValue ?? '';
      } else {
        const resp = await prompts({
          type: 'text',
          name: 'value',
          message: args.question,
          initial: args.defaultValue,
        });
        answer = resp?.value ?? args.defaultValue ?? '';
      }
      return {
        success: true,
        output: { answer },
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
