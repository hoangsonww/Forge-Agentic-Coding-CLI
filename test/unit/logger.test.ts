/**
 * Logger Tests.
 *
 * Level filtering, the stderr/stdout routing rule, and the
 * consoleEnabled toggle used by the interactive REPL.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, setLevel, getLevel, setConsoleOutput } from '../../src/logging/logger';

describe('logger', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  const oldEnv = { ...process.env };

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.env = { ...oldEnv };
    setConsoleOutput(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    setLevel('info');
  });

  it('setLevel and getLevel round-trip', () => {
    setLevel('debug');
    expect(getLevel()).toBe('debug');
    setLevel('error');
    expect(getLevel()).toBe('error');
  });

  it('routes warn and error to stderr', () => {
    log.warn('careful');
    expect(stderrSpy).toHaveBeenCalled();
    const line = stderrSpy.mock.calls[0][0] as string;
    expect(line).toContain('careful');
    expect(line).toContain('"level":"warn"');
  });

  it('info goes to stdout only when FORGE_LOG_STDOUT is set', () => {
    log.info('default-hidden');
    expect(stdoutSpy).not.toHaveBeenCalled();
    process.env.FORGE_LOG_STDOUT = '1';
    log.info('now-visible');
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('debug is filtered when level=info', () => {
    setLevel('info');
    log.debug('should-not-appear');
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('setConsoleOutput(false) silences stderr/stdout but keeps file logging paths', () => {
    setConsoleOutput(false);
    log.error('hidden');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('log output is valid JSON with a timestamp', () => {
    log.error('json-shape');
    const raw = stderrSpy.mock.calls[0][0] as string;
    const obj = JSON.parse(raw.trim());
    expect(obj.level).toBe('error');
    expect(obj.msg).toBe('json-shape');
    expect(typeof obj.ts).toBe('string');
  });

  it('meta is redacted before serialization', () => {
    log.error('had-secret', { token: 'sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
    const raw = stderrSpy.mock.calls[0][0] as string;
    expect(raw).not.toContain('sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  });
});
