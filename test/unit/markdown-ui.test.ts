/**
 * UI markdown renderer — `src/ui/public/markdown.js`.
 *
 * The module exposes itself on `window.forgeMd`, but it also works in a
 * plain JS sandbox if we hand it `globalThis`. We exercise both the happy
 * path and the XSS attack surface that matters most: LLM output is
 * untrusted.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

let mdToHtml: (s: string) => string;

beforeAll(() => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ui', 'public', 'markdown.js'),
    'utf8',
  );
  const sandbox: { forgeMd?: { mdToHtml: (s: string) => string } } = {};
  // The module IIFE closes over `window` or `globalThis` and writes to
  // `forgeMd` on that object. We give it a fresh host object to capture
  // the export without polluting the test realm.
  const fn = new Function('globalThis', 'window', src) as (g: unknown, w: unknown) => void;
  fn(sandbox, sandbox);
  if (!sandbox.forgeMd) throw new Error('markdown.js did not attach forgeMd');
  mdToHtml = sandbox.forgeMd.mdToHtml;
});

describe('mdToHtml — inline', () => {
  it('renders **bold** with <strong>', () => {
    expect(mdToHtml('**hi**')).toContain('<strong>hi</strong>');
  });

  it('renders *italic* with <em>', () => {
    expect(mdToHtml('*hi*')).toContain('<em>hi</em>');
  });

  it('renders `code` with <code>', () => {
    expect(mdToHtml('`x`')).toContain('<code>x</code>');
  });

  it('renders [text](url) with a safe <a>', () => {
    const out = mdToHtml('[docs](https://forge.dev)');
    expect(out).toContain('href="https://forge.dev"');
    expect(out).toContain('rel="noreferrer noopener"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('>docs</a>');
  });
});

describe('mdToHtml — blocks', () => {
  it('renders headings as <h1>..<h6>', () => {
    expect(mdToHtml('# h1')).toContain('<h1>h1</h1>');
    expect(mdToHtml('### h3')).toContain('<h3>h3</h3>');
  });

  it('renders unordered lists as <ul><li>', () => {
    const out = mdToHtml('- a\n- b');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>a</li>');
    expect(out).toContain('<li>b</li>');
  });

  it('renders ordered lists as <ol><li>', () => {
    const out = mdToHtml('1. a\n2. b');
    expect(out).toContain('<ol>');
    expect(out).toContain('<li>a</li>');
    expect(out).toContain('<li>b</li>');
  });

  it('renders fenced code as <pre><code> and preserves newlines', () => {
    const out = mdToHtml('```ts\nconst x = 1;\nconst y = 2;\n```');
    expect(out).toMatch(/<pre[^>]*data-lang="ts"[^>]*><code>/);
    expect(out).toContain('const x = 1;');
    expect(out).toContain('const y = 2;');
  });

  it('renders blockquotes as <blockquote>', () => {
    expect(mdToHtml('> hi')).toContain('<blockquote>hi</blockquote>');
  });

  it('renders paragraphs wrapped in <p>', () => {
    expect(mdToHtml('plain text')).toContain('<p>plain text</p>');
  });

  it('renders horizontal rules as <hr>', () => {
    expect(mdToHtml('---')).toContain('<hr>');
  });
});

describe('mdToHtml — XSS defence', () => {
  it('escapes raw <script> tags in the input', () => {
    const out = mdToHtml('hi <script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('escapes <img onerror> injection attempts', () => {
    const out = mdToHtml('look: <img src=x onerror=alert(1)>');
    expect(out).not.toMatch(/<img[^>]*onerror/i);
    expect(out).toContain('&lt;img');
  });

  it('rejects javascript: link schemes (rewrites to #)', () => {
    const out = mdToHtml('[click](javascript:alert(1))');
    expect(out).toContain('href="#"');
    expect(out).not.toContain('javascript:');
  });

  it('rejects data: link schemes', () => {
    const out = mdToHtml('[x](data:text/html,<script>alert(1)</script>)');
    expect(out).toContain('href="#"');
    expect(out).not.toContain('data:text/html');
  });

  it('allows mailto: and relative links', () => {
    expect(mdToHtml('[a](mailto:a@b.co)')).toContain('href="mailto:a@b.co"');
    expect(mdToHtml('[a](/docs)')).toContain('href="/docs"');
    expect(mdToHtml('[a](#anchor)')).toContain('href="#anchor"');
  });

  it('escapes backtick content so inline HTML inside code stays literal', () => {
    const out = mdToHtml('`<b>x</b>`');
    expect(out).toContain('<code>&lt;b&gt;x&lt;/b&gt;</code>');
  });
});
