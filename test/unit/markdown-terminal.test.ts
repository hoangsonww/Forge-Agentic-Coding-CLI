/**
 * Terminal markdown renderer — `src/cli/markdown.ts`.
 *
 * We compare against ANSI-stripped output so the assertions stay legible
 * and don't break when chalk's colour bytes shift between versions.
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/cli/markdown';

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('renderMarkdown — inline', () => {
  it('renders **bold** without the asterisks', () => {
    const out = stripAnsi(renderMarkdown('Hello **world**'));
    expect(out).toBe('Hello world');
  });

  it('renders *italic* without the asterisks', () => {
    const out = stripAnsi(renderMarkdown('a *b* c'));
    expect(out).toBe('a b c');
  });

  it('renders `code` without the backticks', () => {
    // Inline-code adds spaces in the visible output: ` code `
    const out = stripAnsi(renderMarkdown('run `npm test`'));
    expect(out).toBe('run  npm test ');
  });

  it('renders [text](url) as underlined text + dimmed url', () => {
    const out = stripAnsi(renderMarkdown('see [docs](https://forge.dev)'));
    expect(out).toBe('see docs (https://forge.dev)');
  });

  it('passes unknown syntax through unchanged', () => {
    const out = stripAnsi(renderMarkdown('~tilde~ and <tag>'));
    expect(out).toBe('~tilde~ and <tag>');
  });
});

describe('renderMarkdown — blocks', () => {
  it('renders headings without the # prefix', () => {
    const out = stripAnsi(renderMarkdown('# Title\n\nhi'));
    expect(out).toContain('Title');
    expect(out).not.toContain('# Title');
  });

  it('renders unordered lists as bullets', () => {
    const out = stripAnsi(renderMarkdown('- one\n- two\n- three'));
    expect(out).toContain('• one');
    expect(out).toContain('• two');
    expect(out).toContain('• three');
  });

  it('renders ordered lists with ascending numbers', () => {
    const out = stripAnsi(renderMarkdown('1. a\n2. b\n3. c'));
    expect(out).toContain('1. a');
    expect(out).toContain('2. b');
    expect(out).toContain('3. c');
  });

  it('renders fenced code blocks with the body intact', () => {
    const src = '```ts\nconst x = 1;\n```';
    const out = stripAnsi(renderMarkdown(src));
    expect(out).toContain('const x = 1;');
    expect(out).not.toContain('```');
  });

  it('renders blockquotes', () => {
    const out = stripAnsi(renderMarkdown('> quoted line'));
    expect(out).toContain('quoted line');
    expect(out).not.toMatch(/^>/);
  });

  it('oneLine option collapses to a single trimmed line without ANSI', () => {
    const out = renderMarkdown('# Heading\n\n- a\n- b\n- c', { oneLine: true });
    // Bullets stay (they're the rendered list markers, not markdown syntax).
    expect(out).toBe('Heading • a • b • c');
    expect(out).not.toMatch(/\x1b/);
  });

  it('indent option indents every line by the given spaces', () => {
    const out = stripAnsi(renderMarkdown('hello', { indent: 4 }));
    expect(out).toBe('    hello');
  });
});
