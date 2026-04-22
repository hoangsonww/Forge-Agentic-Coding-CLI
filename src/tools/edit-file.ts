/**
 * Edit a file by replacing specific text. This is safer than write_file for small edits, as it ensures that only the intended text is changed. It fails if the target text isn't found or is ambiguous (unless `replaceAll` is set). Use `anchor` to specify how to match the target text (e.g. exact match vs. ignoring whitespace).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as fs from 'fs';
import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { resolveSafe } from '../sandbox/fs';
import { withFileLock, writeAtomic } from '../sandbox/file-lock';

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
      // Entire read-modify-write runs under the per-path mutex so two
      // concurrent edit_file (or write_file) calls against the same path
      // serialize instead of racing. The re-read MUST happen inside the
      // lock — reading before the lock could give us content that the
      // previous holder has since replaced, and we'd then overwrite their
      // change.
      return await withFileLock(real, async () => {
        const original = fs.existsSync(real) ? fs.readFileSync(real, 'utf8') : '';
        const needle = args.oldText;
        if (!needle) {
          // Planner pattern: create_file (empty) → edit_file (add content).
          // When the target is empty/missing and oldText is empty, the intent
          // is "just write this as the file body". Honor it. On a file that
          // already has content, empty oldText is ambiguous — keep the error.
          if (original.length === 0) {
            writeAtomic(real, args.newText);
            return {
              success: true,
              output: { replacements: 1, bytesWritten: Buffer.byteLength(args.newText) },
              durationMs: Date.now() - start,
            };
          }
          throw new ForgeRuntimeError({
            class: 'user_input',
            message: 'edit_file requires non-empty oldText when the file already has content',
            retryable: false,
            recoveryHint: 'Use write_file to overwrite, or pass an exact oldText snippet.',
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
        writeAtomic(real, updated);
        return {
          success: true,
          output: { replacements: occurrences, bytesWritten: Buffer.byteLength(updated) },
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

const countOccurrences = (haystack: string, needle: string): number => {
  let count = 0;
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) break;
    count++;
    from = i + needle.length;
  }
  return count;
};
