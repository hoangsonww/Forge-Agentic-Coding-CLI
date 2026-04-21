/**
 * Notifications Manager Tests.
 *
 * Verifies the notify() router: respects the enabled flag, filters by
 * channel allow-list, routes errors to stderr, and emits nothing when
 * verbosity is minimal.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import type { ForgeEvent } from '../../src/types';

const makeEvent = (over: Partial<ForgeEvent> = {}): ForgeEvent =>
  ({
    id: 'e1',
    type: 'test.event',
    severity: 'info',
    message: 'hello',
    at: new Date().toISOString(),
    ...over,
  }) as ForgeEvent;

describe('notify()', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cfg = {
      enabled: true,
      channels: ['cli'],
      verbosity: 'normal',
      osNotifications: false,
    };
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('writes info messages to stdout', () => {
    notify(makeEvent({ severity: 'info', message: 'hi' }));
    expect(stdoutSpy).toHaveBeenCalled();
    const line = stdoutSpy.mock.calls[0][0] as string;
    expect(line).toContain('hi');
  });

  it('writes error messages to stderr', () => {
    notify(makeEvent({ severity: 'error', message: 'boom' }));
    expect(stderrSpy).toHaveBeenCalled();
    const line = stderrSpy.mock.calls[0][0] as string;
    expect(line).toContain('boom');
  });

  it('suppresses output when notifications are disabled', () => {
    cfg.enabled = false;
    notify(makeEvent());
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('suppresses CLI output at minimal verbosity', () => {
    cfg.verbosity = 'minimal';
    notify(makeEvent({ severity: 'info' }));
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('emits an extra detail line at verbose verbosity', () => {
    cfg.verbosity = 'verbose';
    notify(
      makeEvent({
        severity: 'info',
        payload: { k: 'v' } as never,
      }),
    );
    expect(stdoutSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
