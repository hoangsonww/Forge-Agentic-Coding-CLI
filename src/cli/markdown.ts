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
 */
import chalk from 'chalk';

interface RenderOptions {
  /** Strip ANSI and collapse to a single line. Useful for one-liner
   *  previews in lists. */
  oneLine?: boolean;
  /** Indent every rendered line by this many spaces. */
  indent?: number;
}

/** Render CommonMark-ish text to ANSI-coloured output. */
export const renderMarkdown = (input: string, opts: RenderOptions = {}): string => {
  if (!input) return '';
  const rendered = renderBlocks(input);
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

    // Fenced code block (``` or ~~~, optional language tag)
    const fenceMatch = /^```+\s*([\w-]*)\s*$|^~~~+\s*([\w-]*)\s*$/.exec(line);
    if (fenceMatch) {
      const lang = fenceMatch[1] || fenceMatch[2] || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^(?:```+|~~~+)\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
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

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      let n = 1;
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*\d+\.\s+/, '');
        out.push('  ' + chalk.cyan(`${n}.`) + ' ' + formatInline(item));
        n++;
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
  if (/^```+|^~~~+/.test(line)) return true;
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
