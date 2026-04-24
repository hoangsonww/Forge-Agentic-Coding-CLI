/**
 * Tiny markdown → safe HTML renderer for LLM output in the Forge dashboard.
 *
 * Security posture:
 *   - The INPUT is HTML-escaped first. Any `<script>`, `<img onerror>`, or
 *     other raw HTML in the LLM output is rendered as literal text. The
 *     renderer then re-introduces its own tiny set of structural tags
 *     (<p>, <ul>, <code>, etc.) — never tags taken from the input.
 *   - Links get rel="noreferrer noopener" and target="_blank" to prevent
 *     the tabnabbing + referer-leak pair.
 *   - Link hrefs are filtered: only http(s):, mailto:, and relative paths
 *     survive. Anything else (javascript:, data:, vbscript:) is dropped.
 *
 * Supported subset: headings (# .. ######), **bold**, *italic*, `code`,
 * fenced ``` code blocks, unordered & ordered lists, [links](url),
 * blockquotes (>), horizontal rules (---), paragraphs.
 *
 * Kept in plain ES5-ish JS so the UI shell stays dependency-free.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
(function (root) {
  'use strict';

  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  /** Allow list of URL schemes we'll embed in <a href="…">. */
  const safeHref = (raw) => {
    const url = String(raw).trim();
    if (/^(https?:|mailto:)/i.test(url)) return url;
    // Relative or anchor: no scheme. Trust only if it doesn't try to be JS.
    if (/^[^:]*$|^#/.test(url) && !/^javascript/i.test(url)) return url;
    return '#';
  };

  const renderInline = (text) => {
    // text is already HTML-escaped. Rehydrate code spans first (protects
    // ** / _ / [] inside them), then emphasis, then links.
    let out = '';
    let rest = text;
    const pattern =
      /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]+\]\([^)\n]+\))/;

    while (rest.length) {
      const m = pattern.exec(rest);
      if (!m) {
        out += rest;
        break;
      }
      out += rest.slice(0, m.index);
      const tok = m[0];
      if (tok.startsWith('`')) {
        out += '<code>' + tok.slice(1, -1) + '</code>';
      } else if (tok.startsWith('**') || tok.startsWith('__')) {
        out += '<strong>' + renderInline(tok.slice(2, -2)) + '</strong>';
      } else if (tok.startsWith('*') || tok.startsWith('_')) {
        out += '<em>' + renderInline(tok.slice(1, -1)) + '</em>';
      } else if (tok.startsWith('[')) {
        const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
        if (linkMatch) {
          const href = safeHref(linkMatch[2]);
          out +=
            '<a href="' +
            esc(href) +
            '" target="_blank" rel="noreferrer noopener">' +
            renderInline(linkMatch[1]) +
            '</a>';
        } else {
          out += tok;
        }
      }
      rest = rest.slice(m.index + tok.length);
    }
    return out;
  };

  // After HTML-escaping the source, `>` shows up as `&gt;`. Both forms are
  // matched below so block detection works whether we pre-escape or not.
  const BLOCKQUOTE_RE = /^\s*(?:>|&gt;)\s?/;

  const isBlockBoundary = (line) => {
    if (!line.trim()) return true;
    if (/^\s*(?:```+|~~~+)/.test(line)) return true;
    if (/^#{1,6}\s/.test(line)) return true;
    if (BLOCKQUOTE_RE.test(line)) return true;
    if (/^\s*[-*+]\s+/.test(line)) return true;
    if (/^\s*\d+\.\s+/.test(line)) return true;
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true;
    return false;
  };

  // LLMs routinely emit `1. 1. 1.` for every item in a numbered list,
  // trusting the renderer to auto-number. Our renderer strips the marker
  // and emits `<ol>`, but if the items are separated by blank lines or
  // sub-bullets, each run ends up as its own single-item `<ol>` — and the
  // browser starts every one at 1. Pre-pass: per-indent counter that
  // rewrites `1.` to sequential numbers whenever we're already past the
  // first item at that indent. Mirrors src/cli/markdown.ts#renumberOrderedLists.
  const renumberOrderedLists = (input) => {
    const lines = input.split('\n');
    const counters = new Map();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(?:#{1,6}\s|```+|~~~+)/.test(line)) {
        counters.clear();
        continue;
      }
      const m = /^(\s*)(\d+)\.\s(.*)$/.exec(line);
      if (!m) continue;
      const indent = m[1].length;
      const num = parseInt(m[2], 10);
      const body = m[3];
      const prev = counters.get(indent) || 0;
      if (num === 1 && prev >= 1) {
        const next = prev + 1;
        counters.set(indent, next);
        lines[i] = m[1] + next + '. ' + body;
      } else {
        counters.set(indent, num);
      }
    }
    return lines.join('\n');
  };

  // Smaller LLMs (and any model whose output gets re-flowed on its way to
  // us) emit triple-backtick fences inline:
  //    ```javascript const numbers = [1,2,3]; numbers.forEach(...); ```
  // The block parser's fence rule requires the opener to sit on its own
  // line, so without preprocessing we fall through to the paragraph branch,
  // and renderInline's `[^`\n]+` span then matches the body between two of
  // the backticks — leaving a stray pair of backticks floating in the
  // output. Rewriting inline fences onto their own lines (open / body /
  // close) fixes both issues. Mirrors src/cli/markdown.ts#normaliseInlineFences.
  const normaliseInlineFences = (input) => {
    return input.replace(/```([\w-]*)[ \t]+([^\n]*?)[ \t]*```/g, (_m, lang, body) => {
      const trimmed = String(body).replace(/\s+$/, '');
      return '\n```' + lang + '\n' + trimmed + '\n```\n';
    });
  };

  /** Convert markdown input to a safe HTML fragment string. */
  const mdToHtml = (raw) => {
    if (raw == null || raw === '') return '';
    // Normalize inline fences BEFORE escaping — the regex matches literal
    // backticks, not `&#96;`, and we want the rewritten newlines to survive
    // into the line-based block parser. Renumber before splitting so the
    // ordered-list loop below sees sequential numbers (and honors them via
    // `<ol start="N">`).
    const prepped = renumberOrderedLists(
      normaliseInlineFences(String(raw).replace(/\r\n?/g, '\n')),
    );
    const escaped = esc(prepped);
    const lines = escaped.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code (```), optional language tag.
      //
      // LLMs routinely nest code blocks inside bullet / numbered lists so the
      // fence arrives with 2–6 spaces of leading indent. Match liberally on
      // whitespace prefix, and strip the same prefix from body lines so the
      // code doesn't inherit the list indent as visible leading whitespace.
      const fence = /^(\s*)(```+|~~~+)\s*([\w-]*)\s*$/.exec(line);
      if (fence) {
        const openerIndent = fence[1].length;
        const closer = fence[2].charAt(0);
        const closerRe = new RegExp('^\\s*' + closer + '{3,}\\s*$');
        const buf = [];
        i++;
        while (i < lines.length && !closerRe.test(lines[i])) {
          const raw = lines[i];
          const leading = (raw.match(/^[ \t]*/) || [''])[0].length;
          const strip = Math.min(openerIndent, leading);
          buf.push(raw.slice(strip));
          i++;
        }
        if (i < lines.length) i++;
        const langAttr = fence[3] ? ' data-lang="' + esc(fence[3]) + '"' : '';
        out.push(
          '<pre' + langAttr + '><code>' + buf.join('\n') + '</code></pre>',
        );
        continue;
      }

      // Heading
      const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (h) {
        const lvl = h[1].length;
        out.push('<h' + lvl + '>' + renderInline(h[2]) + '</h' + lvl + '>');
        i++;
        continue;
      }

      // Blockquote (matches both `>` and the escaped `&gt;`)
      if (BLOCKQUOTE_RE.test(line)) {
        const quoted = [];
        while (i < lines.length && BLOCKQUOTE_RE.test(lines[i])) {
          quoted.push(lines[i].replace(BLOCKQUOTE_RE, ''));
          i++;
        }
        out.push('<blockquote>' + renderInline(quoted.join(' ')) + '</blockquote>');
        continue;
      }

      // Unordered list
      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
          i++;
        }
        out.push('<ul>' + items.map((it) => '<li>' + renderInline(it) + '</li>').join('') + '</ul>');
        continue;
      }

      // Ordered list. LLMs routinely separate items with blank lines —
      // without the peek-past-blanks lookahead, each item became its own
      // single-entry `<ol>` and every one rendered as "1." since browsers
      // auto-number each `<ol>` from 1. Fix: consume blank lines between
      // items as long as the next non-blank line is still a list item,
      // and emit `start="N"` so the first number from source is honored.
      const olHead = /^\s*(\d+)\.\s+/.exec(line);
      if (olHead) {
        const firstNum = parseInt(olHead[1], 10);
        const items = [];
        while (i < lines.length) {
          const cur = lines[i];
          if (/^\s*\d+\.\s+/.test(cur)) {
            items.push(cur.replace(/^\s*\d+\.\s+/, ''));
            i++;
            continue;
          }
          if (!cur.trim()) {
            // Peek ahead past blank lines to see if more items follow.
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;
            if (j < lines.length && /^\s*\d+\.\s+/.test(lines[j])) {
              i = j;
              continue;
            }
          }
          break;
        }
        const startAttr = firstNum > 1 ? ` start="${firstNum}"` : '';
        out.push(
          '<ol' + startAttr + '>' +
          items.map((it) => '<li>' + renderInline(it) + '</li>').join('') +
          '</ol>',
        );
        continue;
      }

      // Horizontal rule
      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push('<hr>');
        i++;
        continue;
      }

      // Blank line
      if (!line.trim()) {
        i++;
        continue;
      }

      // Paragraph — collect until the next block boundary
      const para = [];
      while (i < lines.length && !isBlockBoundary(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      out.push('<p>' + renderInline(para.join(' ')) + '</p>');
    }
    return out.join('\n');
  };

  root.forgeMd = { mdToHtml: mdToHtml, escapeHtml: esc };
})(typeof window !== 'undefined' ? window : globalThis);
