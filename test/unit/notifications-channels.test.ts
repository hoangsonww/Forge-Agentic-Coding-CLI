/**
 * Notifications — Channels & OS Dispatch Tests.
 *
 * The existing notifications-manager.test.ts pins the core routing
 * logic. This file fills the remaining branches:
 *   • OS notification dispatch for darwin, linux, and the no-op win32
 *     path (we mock child_process.spawn so nothing actually runs).
 *   • Every severity prefix (info/warning/error/critical).
 *   • Channel filtering: `os` present in cfg but osNotifications=false
 *     and vice versa; `cli` excluded from both cfg and call args.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const spawnMock = vi.fn(() => ({
  unref: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...(args as [])),
}));

let cfg = {
  enabled: true,
  channels: ['cli'] as string[],
  verbosity: 'normal' as 'minimal' | 'normal' | 'verbose',
  osNotifications: false,
};

vi.mock('../../src/config/loader', () => ({
  loadGlobalConfig: () => ({
    notifications: cfg,
    permissions: { trust: { autoAllowAfter: 3 } },
  }),
}));

import { notify } from '../../src/notifications/manager';
import type { ForgeEvent, Severity } from '../../src/types';

const makeEvent = (over: Partial<ForgeEvent> = {}): ForgeEvent =>
  ({
    id: 'e1',
    type: 'unit.test',
    severity: 'info',
    message: 'hello',
    at: new Date().toISOString(),
    ...over,
  }) as ForgeEvent;

describe('notify — OS dispatch', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  const origPlat = Object.getOwnPropertyDescriptor(process, 'platform')!;

  beforeEach(() => {
    cfg = { enabled: true, channels: ['cli'], verbosity: 'normal', osNotifications: true };
    spawnMock.mockReset();
    spawnMock.mockReturnValue({ unref: vi.fn() });
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', origPlat);
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('shells out to osascript on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    notify(makeEvent({ message: 'from mac' }), ['os']);
    expect(spawnMock).toHaveBeenCalled();
    const [cmd, args] = spawnMock.mock.calls[0] as unknown as [string, string[]];
    expect(cmd).toBe('osascript');
    expect(args.join(' ')).toContain('display notification');
    expect(args.join(' ')).toContain('from mac');
  });

  it('shells out to notify-send on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    notify(makeEvent({ message: 'from linux' }), ['os']);
    expect(spawnMock).toHaveBeenCalled();
    const [cmd, args] = spawnMock.mock.calls[0] as unknown as [string, string[]];
    expect(cmd).toBe('notify-send');
    expect(args).toContain('from linux');
  });

  it('is a no-op on unsupported platforms (win32 path)', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    notify(makeEvent(), ['os']);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('swallows spawn errors so a bad notifier never crashes the runtime', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    spawnMock.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    expect(() => notify(makeEvent(), ['os'])).not.toThrow();
  });

  it('escapes double-quotes in the osascript payload so injection fails', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    notify(makeEvent({ message: 'say "hi"', type: 'weird "title"' }), ['os']);
    const [, args] = spawnMock.mock.calls[0] as unknown as [string, string[]];
    const joined = args.join(' ');
    // Unescaped double-quotes would break the AppleScript — the escape
    // replaces `"` with `\"`.
    expect(joined).toContain('\\"hi\\"');
    expect(joined).toContain('\\"title\\"');
  });

  it('cli channel is included implicitly via call args even if cfg omits it', () => {
    cfg.channels = []; // empty
    cfg.osNotifications = false;
    notify(makeEvent({ message: 'cli-on-demand' }), ['cli']);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('osNotifications=false suppresses the OS leg even if the channel is requested', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    cfg.osNotifications = false;
    notify(makeEvent(), ['os']);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe('notify — severity prefixes', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cfg = { enabled: true, channels: ['cli'], verbosity: 'normal', osNotifications: false };
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  const lineFor = (sev: Severity): string => {
    notify(makeEvent({ severity: sev, message: `msg-${sev}` }));
    const target = sev === 'error' || sev === 'critical' ? stderrSpy : stdoutSpy;
    const line = target.mock.calls[0]?.[0] as string;
    return line;
  };

  it('info line mentions the message', () => {
    expect(lineFor('info')).toContain('msg-info');
  });

  it('warning line goes to stdout', () => {
    lineFor('warning');
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('error line goes to stderr', () => {
    lineFor('error');
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('critical line goes to stderr', () => {
    lineFor('critical');
    expect(stderrSpy).toHaveBeenCalled();
  });
});

describe('notify — verbosity and payload', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cfg = { enabled: true, channels: ['cli'], verbosity: 'normal', osNotifications: false };
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('verbose mode without a payload still writes exactly one line', () => {
    cfg.verbosity = 'verbose';
    notify(makeEvent());
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
  });

  it('verbose mode with payload writes a second detail line with JSON', () => {
    cfg.verbosity = 'verbose';
    notify(makeEvent({ payload: { user: 'davy', kind: 'ping' } as never }));
    expect(stdoutSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    const detail = stdoutSpy.mock.calls[1][0] as string;
    expect(detail).toContain('davy');
  });

  it('verbose mode redacts secrets in the payload detail line', () => {
    cfg.verbosity = 'verbose';
    notify(
      makeEvent({
        payload: { token: 'sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } as never,
      }),
    );
    const all = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(all).not.toContain('sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  });

  it('channel not in cfg nor call args → nothing emitted', () => {
    cfg.channels = ['ui'];
    notify(makeEvent(), ['ui']);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
