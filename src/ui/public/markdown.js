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
    if (/^```+|^~~~+/.test(line)) return true;
    if (/^#{1,6}\s/.test(line)) return true;
    if (BLOCKQUOTE_RE.test(line)) return true;
    if (/^\s*[-*+]\s+/.test(line)) return true;
    if (/^\s*\d+\.\s+/.test(line)) return true;
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true;
    return false;
  };

  /** Convert markdown input to a safe HTML fragment string. */
  const mdToHtml = (raw) => {
    if (raw == null || raw === '') return '';
    const escaped = esc(raw).replace(/\r\n?/g, '\n');
    const lines = escaped.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code (```), optional language tag.
      const fence = /^(```+|~~~+)\s*([\w-]*)\s*$/.exec(line);
      if (fence) {
        const closer = fence[1].replace(/\s/g, '').charAt(0);
        const buf = [];
        i++;
        while (i < lines.length && !new RegExp('^' + closer + '{3,}\\s*$').test(lines[i])) {
          buf.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        const langAttr = fence[2] ? ' data-lang="' + esc(fence[2]) + '"' : '';
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

      // Ordered list
      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
          i++;
        }
        out.push('<ol>' + items.map((it) => '<li>' + renderInline(it) + '</li>').join('') + '</ol>');
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
