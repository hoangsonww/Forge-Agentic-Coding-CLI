import * as fs from 'fs';
import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { resolveSafe } from '../sandbox/fs';

interface Args {
  path: string;
  oldText: string;
  newText: string;
  replaceAll?: boolean;
  anchor?: 'exact' | 'trimmed';
}

interface Output {
  replacements: number;
  bytesWritten: number;
}

/**
 * Surgical text replace. Prefer this over rewrites when you only need to
 * change a specific block — it fails loudly if the target text isn't unique
 * (unless `replaceAll` is set).
 */
export const editFileTool: Tool<Args, Output> = {
  schema: {
    name: 'edit_file',
    description:
      'Replace exact text inside a file. Errors if the target text is ambiguous (use replaceAll explicitly).',
    sideEffect: 'write',
    risk: 'medium',
    permissionDefault: 'ask',
    sensitivity: 'medium',
    timeoutMs: 15_000,
    inputSchema: {
      type: 'object',
      required: ['path', 'oldText', 'newText'],
      properties: {
        path: { type: 'string' },
        oldText: { type: 'string' },
        newText: { type: 'string' },
        replaceAll: { type: 'boolean' },
        anchor: { type: 'string' },
      },
    },
  },
  async execute(args, ctx): Promise<ToolResult<Output>> {
    const start = Date.now();
    try {
      const real = resolveSafe(args.path, { projectRoot: ctx.projectRoot }, 'write');
      const original = fs.existsSync(real) ? fs.readFileSync(real, 'utf8') : '';
      const needle = args.oldText;
      if (!needle) {
        throw new ForgeRuntimeError({
          class: 'user_input',
          message: 'edit_file requires non-empty oldText',
          retryable: false,
        });
      }
      const occurrences = countOccurrences(original, needle);
      if (occurrences === 0) {
        throw new ForgeRuntimeError({
          class: 'not_found',
          message: `oldText not present in ${args.path}`,
          retryable: false,
          recoveryHint: 'Use read_file first to verify the exact snippet.',
        });
      }
      if (occurrences > 1 && !args.replaceAll) {
        throw new ForgeRuntimeError({
          class: 'conflict',
          message: `oldText matches ${occurrences} occurrences; pass replaceAll=true or narrow the anchor.`,
          retryable: false,
        });
      }
      const updated = args.replaceAll
        ? original.split(needle).join(args.newText)
        : original.replace(needle, args.newText);
      fs.writeFileSync(real, updated, 'utf8');
      return {
        success: true,
        output: { replacements: occurrences, bytesWritten: Buffer.byteLength(updated) },
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

const countOccurrences = (haystack: string, needle: string): number => {
  let count = 0;
  let from = 0;
  while (true) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) break;
    count++;
    from = i + needle.length;
  }
  return count;
};
