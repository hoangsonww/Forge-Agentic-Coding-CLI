/**
 * Tiny markdown → ANSI renderer.
 *
 * LLM output routinely uses CommonMark: **bold**, *italic*, `code`, fenced
 * code blocks, headings, lists, links, blockquotes. We render a pragmatic
 * subset — enough to make summaries, plans, and explanations readable in
 * the terminal — without adding a dep.
 *
 * This is NOT a CommonMark-compliant parser. It's a pragmatic translator
 * tuned for the shapes LLMs actually produce. Edge cases (nested emphasis,
 * reference links, HTML passthrough, setext headings, tables) are not
 * supported — we render them literally rather than mangling them.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import chalk from 'chalk';

interface RenderOptions {
  /** Strip ANSI and collapse to a single line. Useful for one-liner
   *  previews in lists. */
  oneLine?: boolean;
  /** Indent every rendered line by this many spaces. */
  indent?: number;
}

/**
 * Normalise fenced code blocks that arrived flattened on a single line.
 *
 * Small local models occasionally emit code blocks like:
 *
 *   ```javascript const numbers = [1,2,3]; numbers.forEach(x=>x); ```
 *
 * CommonMark requires ``` + language tag alone on a line, so the block
 * parser rejects this and falls through to inline-code rendering — which
 * in turn treats consecutive backticks as empty code spans, producing
 * ugly `` `` javascript … `` `` output in the terminal.
 *
 * This pre-pass rewrites any inline fence (opening + body + closing all on
 * the same physical line) into canonical multi-line form so the block
 * parser picks it up as a real fenced block. Leaves well-formed blocks
 * (already multi-line) untouched.
 */
/**
 * Renumber ordered lists that LLMs emit as "1. … 1. … 1. …".
 *
 * CommonMark's spec says all ordered-list markers can literally be `1.` and
 * a compliant renderer auto-numbers sequentially. Models rely on that and
 * constantly emit repeated `1.`. Our renderer's own ordered-list handler
 * does renumber within a contiguous run — but when the list has nested
 * content (a bullet sub-list, an indented code block), the run ends and
 * the next `1.` starts a fresh list with n=1. Result: "1. Foo → bullets →
 * 1. Bar → bullets → 1. Baz" renders as three separate "1.".
 *
 * This pre-pass walks line-by-line, keeps a counter per indent level, and
 * rewrites `1.` markers when we're past the first item at that indent. It
 * deliberately leaves sources that *already* use sequential numbering
 * (`1.`, `2.`, `3.`) alone — only the literal-`1.`-for-every-item pattern
 * gets rewritten. Counters reset on headings and fenced code blocks
 * (genuine section boundaries).
 */
const renumberOrderedLists = (input: string): string => {
  const lines = input.split('\n');
  const counters = new Map<number, number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Section break: reset all counters so subsequent ordered lists start
    // numbering from whatever the source says.
    if (/^\s*(?:#{1,6}\s|```+|~~~+)/.test(line)) {
      counters.clear();
      continue;
    }
    const m = /^(\s*)(\d+)\.\s(.*)$/.exec(line);
    if (!m) continue;
    const indent = m[1].length;
    const originalNum = parseInt(m[2], 10);
    const body = m[3];
    const prev = counters.get(indent) ?? 0;
    if (originalNum === 1 && prev >= 1) {
      // Model wrote `1.` where we're already past item 1 at this indent.
      // Renumber to maintain the visible sequence.
      const next = prev + 1;
      counters.set(indent, next);
      lines[i] = `${m[1]}${next}. ${body}`;
    } else {
      // Trust the source number (could be 2. 3. 4. …, or a fresh 1. that
      // starts a new top-level list after the counter was empty).
      counters.set(indent, originalNum);
    }
  }
  return lines.join('\n');
};

const normaliseInlineFences = (input: string): string => {
  // Matches the whole inline block: opening fence with optional language,
  // then anything (non-greedy) up to the closing fence, ALL on one physical
  // line (no literal newline in the match).
  // eslint-disable-next-line no-useless-escape -- escape kept for readability
  const re = /```([\w-]*)[ \t]+([^\n]*?)[ \t]*```/g;
  return input.replace(re, (_match, lang: string, body: string) => {
    // Preserve the body as-is so spaces inside string literals survive.
    const trimmed = body.replace(/\s+$/, '');
    return `\n\`\`\`${lang}\n${trimmed}\n\`\`\`\n`;
  });
};

/** Render CommonMark-ish text to ANSI-coloured output. */
export const renderMarkdown = (input: string, opts: RenderOptions = {}): string => {
  if (!input) return '';
  const rendered = renderBlocks(renumberOrderedLists(normaliseInlineFences(input)));
  if (opts.oneLine) {
    return stripAnsi(rendered).replace(/\s+/g, ' ').trim();
  }
  if (opts.indent) {
    const pad = ' '.repeat(opts.indent);
    return rendered
      .split('\n')
      .map((l) => pad + l)
      .join('\n');
  }
  return rendered;
};

/* --------------------------------------------------------------------------
   Block-level pass: headings, fenced code, blockquotes, lists, paragraphs.
   -------------------------------------------------------------------------- */

const renderBlocks = (text: string): string => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block (``` or ~~~, optional language tag).
    //
    // LLMs routinely nest code blocks inside bullet / numbered lists, which
    // means the fence arrives with 2–4 spaces of leading indent. CommonMark
    // officially allows up to 3 spaces, and in practice we see up to 6 from
    // small models. Be liberal: strip any leading whitespace before matching.
    // The closing fence must be on its own line too but may have the same
    // (or matching) leading indent — we strip to compare.
    const fenceMatch = /^\s*```+\s*([\w-]*)\s*$|^\s*~~~+\s*([\w-]*)\s*$/.exec(line);
    if (fenceMatch) {
      const lang = fenceMatch[1] || fenceMatch[2] || '';
      // Remember how much the opener was indented so the body can strip the
      // same prefix — otherwise the rendered code block inherits the list's
      // indentation as trailing-whitespace inside each code line.
      const openerIndent = (line.match(/^\s*/)?.[0] ?? '').length;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^\s*(?:```+|~~~+)\s*$/.test(lines[i])) {
        // Strip up to `openerIndent` leading spaces so "- foo\n  ```js\n  x"
        // renders as just `x`, not `  x`.
        const raw = lines[i];
        const prefixLen = Math.min(openerIndent, (raw.match(/^[ \t]*/)?.[0] ?? '').length);
        codeLines.push(raw.slice(prefixLen));
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      out.push(formatCodeBlock(codeLines.join('\n'), lang));
      continue;
    }

    // ATX headings (# .. ######)
    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (headingMatch) {
      out.push(formatHeading(headingMatch[1].length, headingMatch[2]));
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(formatBlockquote(quoted.join('\n')));
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      for (const item of items) out.push('  ' + chalk.cyan('•') + ' ' + formatInline(item));
      continue;
    }

    // Ordered list — honour the actual source number on each line rather
    // than rerolling from 1 per run. `renumberOrderedLists` has already
    // rewritten LLM-style "1. 1. 1." input into proper sequential numbers,
    // so trusting the source here renders them correctly across runs that
    // get broken by sub-lists or paragraphs.
    if (/^\s*\d+\.\s+/.test(line)) {
      while (i < lines.length) {
        const m = /^\s*(\d+)\.\s+/.exec(lines[i]);
        if (!m) break;
        const n = parseInt(m[1], 10);
        const item = lines[i].replace(/^\s*\d+\.\s+/, '');
        out.push('  ' + chalk.cyan(`${n}.`) + ' ' + formatInline(item));
        i++;
      }
      continue;
    }

    // Horizontal rule
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(chalk.dim('─'.repeat(Math.min(process.stdout.columns || 60, 60))));
      i++;
      continue;
    }

    // Blank line → paragraph break
    if (!line.trim()) {
      out.push('');
      i++;
      continue;
    }

    // Plain paragraph — consume consecutive non-block lines
    const paraLines: string[] = [];
    while (i < lines.length && !isBlockBoundary(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push(formatInline(paraLines.join(' ')));
  }

  return out.join('\n');
};

/** True if a line opens a new block (so we stop collecting paragraph text). */
const isBlockBoundary = (line: string): boolean => {
  if (!line.trim()) return true;
  // Fences may be indented (inside list items, blockquotes); match the same
  // permissive rule the block-fence handler uses.
  if (/^\s*(?:```+|~~~+)/.test(line)) return true;
  if (/^#{1,6}\s/.test(line)) return true;
  if (/^\s*>/.test(line)) return true;
  if (/^\s*[-*+]\s+/.test(line)) return true;
  if (/^\s*\d+\.\s+/.test(line)) return true;
  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true;
  return false;
};

/* --------------------------------------------------------------------------
   Block formatters.
   -------------------------------------------------------------------------- */

const formatHeading = (level: number, content: string): string => {
  const rendered = formatInline(content);
  if (level === 1) return '\n' + chalk.bold.underline.cyan(rendered);
  if (level === 2) return '\n' + chalk.bold.cyan(rendered);
  if (level === 3) return '\n' + chalk.bold(rendered);
  return chalk.bold.dim(rendered);
};

const formatCodeBlock = (code: string, lang: string): string => {
  const body = code
    .split('\n')
    .map((l) => chalk.cyan('│ ') + chalk.gray(l))
    .join('\n');
  const tag = lang ? chalk.dim(` ${lang} `) : '';
  return chalk.dim('┌' + '─'.repeat(6)) + tag + '\n' + body + '\n' + chalk.dim('└' + '─'.repeat(6));
};

const formatBlockquote = (content: string): string =>
  content
    .split('\n')
    .map((l) => chalk.dim.cyan('│ ') + chalk.italic.dim(formatInline(l)))
    .join('\n');

/* --------------------------------------------------------------------------
   Inline pass: bold, italic, inline code, links.
   Order matters: do code first so we don't mis-parse `**foo**` inside
   backticks, etc. We tokenise into a span list, then render.
   -------------------------------------------------------------------------- */

type Span =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'link'; text: string; href: string };

const formatInline = (input: string): string => {
  const spans = tokeniseInline(input);
  return spans
    .map((s) => {
      if (s.kind === 'code') return chalk.bgHex('#111').hex('#7dd3fc')(` ${s.text} `);
      if (s.kind === 'bold') return chalk.bold(formatInline(s.text));
      if (s.kind === 'italic') return chalk.italic(formatInline(s.text));
      if (s.kind === 'link') {
        return chalk.underline.cyan(s.text) + ' ' + chalk.dim(`(${s.href})`);
      }
      return s.text;
    })
    .join('');
};

const tokeniseInline = (input: string): Span[] => {
  const spans: Span[] = [];
  let rest = input;

  // Single pattern with alternation; we iterate matches left-to-right.
  const pattern =
    /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]+\]\([^)\n]+\))/;

  while (rest.length) {
    const m = pattern.exec(rest);
    if (!m) {
      spans.push({ kind: 'text', text: rest });
      break;
    }
    if (m.index > 0) spans.push({ kind: 'text', text: rest.slice(0, m.index) });
    const tok = m[0];
    if (tok.startsWith('`')) {
      spans.push({ kind: 'code', text: tok.slice(1, -1) });
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      spans.push({ kind: 'bold', text: tok.slice(2, -2) });
    } else if (tok.startsWith('*') || tok.startsWith('_')) {
      spans.push({ kind: 'italic', text: tok.slice(1, -1) });
    } else if (tok.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      if (linkMatch) spans.push({ kind: 'link', text: linkMatch[1], href: linkMatch[2] });
      else spans.push({ kind: 'text', text: tok });
    }
    rest = rest.slice(m.index + tok.length);
  }

  return spans;
};

/* --------------------------------------------------------------------------
   Utilities.
   -------------------------------------------------------------------------- */

// eslint-disable-next-line no-control-regex -- strip ANSI CSI sequences
const ANSI_RE = /\x1b\[[0-9;]*m/g;

const stripAnsi = (s: string): string => s.replace(ANSI_RE, '');

export const _testInlineTokenise = tokeniseInline;
