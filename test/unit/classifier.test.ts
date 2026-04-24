/**
 * Classifier unit tests for heuristicClassify function.
 *
 * These tests verify that the heuristic classification logic correctly identifies task types, scopes, complexities, and risks based on common keywords and patterns in task descriptions. The tests cover:
 *   Detection of bugfix intent from keywords like "fix" and "bug".
 *   Detection of refactor intent from keywords like "refactor".
 *   Escalation of scope to "system-wide" for tasks mentioning "entire" or "monorepo".
 *   Assignment of "critical" risk for tasks containing destructive keywords like "delete".
 *   Classification of trivial complexity for simple rename operations.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import { heuristicClassify, looksConversational } from '../../src/classifier/heuristics';

describe('heuristicClassify', () => {
  it('detects bugfix intent', () => {
    const r = heuristicClassify('fix login bug');
    expect(r.type).toBe('bugfix');
  });

  it('detects refactor intent', () => {
    const r = heuristicClassify('refactor the auth module');
    expect(r.type).toBe('refactor');
  });

  it('escalates scope for system-wide tasks', () => {
    const r = heuristicClassify('migrate the entire monorepo to ESM');
    expect(r.scope).toBe('system-wide');
    expect(r.complexity).toBe('complex');
  });

  it('raises risk for destructive keywords', () => {
    const r = heuristicClassify('delete all stale migration files');
    expect(r.risk).toBe('critical');
  });

  it('returns trivial complexity for renames', () => {
    const r = heuristicClassify('rename variable foo to bar');
    expect(r.complexity).toBe('trivial');
  });
});

describe('looksConversational', () => {
  it('accepts pure concept questions', () => {
    expect(looksConversational('what is the difference between a map and a dict?')).toBe(true);
    expect(looksConversational('why is tail-call optimization hard in v8?')).toBe(true);
    expect(looksConversational('how does the event loop work?')).toBe(true);
    expect(looksConversational('explain closures')).toBe(true);
    expect(looksConversational('compare goroutines and threads')).toBe(true);
  });

  it('rejects anything that references repo artifacts', () => {
    expect(looksConversational('explain how src/core/loop.ts works')).toBe(false);
    expect(looksConversational('what is this codebase doing in the auth module?')).toBe(false);
    expect(looksConversational('summarize the README')).toBe(false);
    expect(looksConversational('why is this function so slow?')).toBe(false);
  });

  it('rejects imperatives that imply code changes', () => {
    expect(looksConversational('create a Map class')).toBe(false);
    expect(looksConversational('fix the bug where X')).toBe(false);
    expect(looksConversational('refactor to use async/await')).toBe(false);
    expect(looksConversational('write a test for Y')).toBe(false);
  });

  it('accepts common greetings and short chat openers', () => {
    expect(looksConversational('hi')).toBe(true);
    expect(looksConversational('hello')).toBe(true);
    expect(looksConversational('hey!')).toBe(true);
    expect(looksConversational('thanks')).toBe(true);
    expect(looksConversational('good morning')).toBe(true);
    expect(looksConversational('ok')).toBe(true);
  });

  it('accepts short non-imperative prose without a repo reference', () => {
    expect(looksConversational('tell me something fun')).toBe(true);
    expect(looksConversational('recommend a book')).toBe(true);
    expect(looksConversational('your thoughts on rust')).toBe(true);
  });

  it('rejects overly long inputs', () => {
    expect(looksConversational('a'.repeat(500))).toBe(false);
  });
});
