import { describe, it, expect } from 'vitest';
import { redactString, redact, redactEnv } from '../../src/security/redact';

describe('redactString', () => {
  it('masks AWS access keys', () => {
    expect(redactString('AKIA0000000000001234')).toContain('REDACTED');
  });

  it('masks GitHub tokens', () => {
    expect(redactString('token=ghp_abcdefghijklmnopqrstuvwxyz0123456789')).toContain('REDACTED');
  });

  it('masks OpenAI keys', () => {
    expect(redactString('sk-1234567890ABCDEFGHIJ')).toContain('REDACTED');
  });

  it('masks Anthropic keys', () => {
    expect(redactString('sk-ant-0123456789abcdefghijk')).toContain('REDACTED');
  });

  it('preserves innocuous text', () => {
    expect(redactString('hello world')).toBe('hello world');
  });

  it('redacts env-like key=value pairs for sensitive keys', () => {
    const out = redactString('API_KEY=realvalue SOMETHING=ok');
    expect(out).toContain('REDACTED');
    expect(out).toContain('SOMETHING=ok');
  });
});

describe('redact(object)', () => {
  it('masks sensitive keys', () => {
    const o = { API_KEY: 'abc', name: 'safe', nested: { PASSWORD: 'x', keep: 'ok' } };
    const r = redact(o) as any;
    expect(r.API_KEY).toContain('REDACTED');
    expect(r.name).toBe('safe');
    expect(r.nested.PASSWORD).toContain('REDACTED');
    expect(r.nested.keep).toBe('ok');
  });
});

describe('redactEnv', () => {
  it('redacts sensitive env vars only', () => {
    const out = redactEnv({
      SHELL: '/bin/bash',
      SECRET_TOKEN: 'abc',
      HOME: '/home/x',
    });
    expect(out.SHELL).toBe('/bin/bash');
    expect(out.HOME).toBe('/home/x');
    expect(out.SECRET_TOKEN).toContain('REDACTED');
  });
});
