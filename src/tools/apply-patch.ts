import * as fs from 'fs';
import { Tool, ToolResult } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { resolveSafe } from '../sandbox/fs';

/**
 * Minimal unified-diff applier.
 *
 * Supports: multiple file hunks, @@ hunks with line ranges, context lines,
 * add/delete lines. Conservative: refuses if any hunk doesn't match. Use this
 * for precise edits where you already know the surrounding context.
 *
 * For full-file rewrites or trivial inserts, prefer write_file.
 */
interface Args {
  patch: string;
}

interface Output {
  filesChanged: string[];
  hunksApplied: number;
}

interface Hunk {
  oldStart: number;
  oldLen: number;
  newStart: number;
  newLen: number;
  lines: string[];
}

interface FilePatch {
  oldPath: string;
  newPath: string;
  hunks: Hunk[];
}

const parsePatch = (patch: string): FilePatch[] => {
  const files: FilePatch[] = [];
  const lines = patch.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('--- ')) {
      i++;
      continue;
    }
    const oldPath = lines[i].slice(4).trim().replace(/^a\//, '');
    const newHeader = lines[i + 1];
    if (!newHeader || !newHeader.startsWith('+++ ')) {
      i++;
      continue;
    }
    const newPath = newHeader.slice(4).trim().replace(/^b\//, '');
    i += 2;
    const hunks: Hunk[] = [];
    while (i < lines.length && lines[i].startsWith('@@')) {
      const header = lines[i];
      const m = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header);
      if (!m) {
        i++;
        break;
      }
      const hunk: Hunk = {
        oldStart: Number(m[1]),
        oldLen: m[2] ? Number(m[2]) : 1,
        newStart: Number(m[3]),
        newLen: m[4] ? Number(m[4]) : 1,
        lines: [],
      };
      i++;
      while (
        i < lines.length &&
        !lines[i].startsWith('@@') &&
        !lines[i].startsWith('--- ') &&
        !lines[i].startsWith('+++ ')
      ) {
        hunk.lines.push(lines[i]);
        i++;
      }
      hunks.push(hunk);
    }
    files.push({ oldPath, newPath, hunks });
  }
  return files;
};

const applyHunk = (source: string[], hunk: Hunk): string[] => {
  const before = source.slice(0, hunk.oldStart - 1);
  const replaced: string[] = [];
  let srcCursor = hunk.oldStart - 1;
  for (const line of hunk.lines) {
    if (line.startsWith(' ')) {
      // Context: must match source
      const expected = line.slice(1);
      if (source[srcCursor] !== expected) {
        throw new ForgeRuntimeError({
          class: 'conflict',
          message: `Context mismatch at line ${srcCursor + 1}: got "${source[srcCursor]}" expected "${expected}"`,
          retryable: false,
        });
      }
      replaced.push(expected);
      srcCursor++;
    } else if (line.startsWith('-')) {
      const expected = line.slice(1);
      if (source[srcCursor] !== expected) {
        throw new ForgeRuntimeError({
          class: 'conflict',
          message: `Removal mismatch at line ${srcCursor + 1}`,
          retryable: false,
        });
      }
      srcCursor++;
    } else if (line.startsWith('+')) {
      replaced.push(line.slice(1));
    } else if (line === '' || line.startsWith('\\')) {
      // newline marker or blank
      continue;
    } else {
      // Treat as context when no prefix (some diffs)
      if (source[srcCursor] !== line) {
        throw new ForgeRuntimeError({
          class: 'conflict',
          message: `Unexpected line format at ${srcCursor + 1}`,
          retryable: false,
        });
      }
      replaced.push(line);
      srcCursor++;
    }
  }
  const after = source.slice(srcCursor);
  return [...before, ...replaced, ...after];
};

export const applyPatchTool: Tool<Args, Output> = {
  schema: {
    name: 'apply_patch',
    description: 'Apply a unified diff to the working tree (strict context matching).',
    sideEffect: 'write',
    risk: 'medium',
    permissionDefault: 'ask',
    sensitivity: 'medium',
    timeoutMs: 20_000,
    inputSchema: {
      type: 'object',
      required: ['patch'],
      properties: { patch: { type: 'string' } },
    },
  },
  async execute(args, ctx): Promise<ToolResult<Output>> {
    const start = Date.now();
    try {
      const files = parsePatch(args.patch);
      if (!files.length) {
        throw new ForgeRuntimeError({
          class: 'user_input',
          message: 'Patch contained no recognizable file hunks.',
          retryable: false,
        });
      }
      const changed: string[] = [];
      let hunks = 0;
      for (const fp of files) {
        const target = resolveSafe(fp.newPath, { projectRoot: ctx.projectRoot }, 'write');
        let source: string[] = fs.existsSync(target)
          ? fs.readFileSync(target, 'utf8').split('\n')
          : [];
        for (const hunk of fp.hunks) {
          source = applyHunk(source, hunk);
          hunks++;
        }
        fs.writeFileSync(target, source.join('\n'), 'utf8');
        changed.push(fp.newPath);
      }
      return {
        success: true,
        output: { filesChanged: changed, hunksApplied: hunks },
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
