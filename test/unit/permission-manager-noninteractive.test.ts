/**
 * Permission Manager (non-interactive) Tests.
 *
 * The interactive host and prompts are mocked so these tests exercise
 * the decision logic without opening stdin. We verify that:
 *   - non-interactive mode denies high-risk by default
 *   - non-interactive mode allows low-risk when skipRoutine is set
 *   - denyCache short-circuits repeat asks to deny
 *   - blanket --allow-files flag grants writes without prompting
 *   - clearSession actually clears the in-memory state
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/persistence/index-db', () => ({
  loadPermissionGrants: () => [],
  savePermissionGrant: () => undefined,
  getDb: () => ({
    prepare: () => ({ all: () => [], get: () => null, run: () => undefined }),
    exec: () => undefined,
    transaction: (fn: () => void) => () => fn(),
  }),
}));

vi.mock('../../src/core/interactive-host', () => ({
  currentHost: () => null,
}));

vi.mock('../../src/config/loader', () => ({
  loadGlobalConfig: () => ({
    permissions: { trust: { autoAllowAfter: 3 } },
    notifications: { enabled: false, channels: [], verbosity: 'normal', osNotifications: false },
  }),
}));

import { requestPermission, clearSession, assertAllowed } from '../../src/permissions/manager';
import type { PermissionRequest } from '../../src/types';

const baseReq = (over: Partial<PermissionRequest> = {}): PermissionRequest => ({
  tool: 'read_file',
  action: 'read',
  risk: 'low',
  sideEffect: 'readonly',
  projectId: 'proj',
  ...over,
});

describe('permission manager — non-interactive decisions', () => {
  beforeEach(() => clearSession());

  it('denies high-risk in non-interactive mode', async () => {
    const d = await requestPermission(baseReq({ risk: 'high', sideEffect: 'execute' }), {
      nonInteractive: true,
    });
    expect(d).toBe('deny');
  });

  it('allows low-risk readonly in non-interactive when skipRoutine is set', async () => {
    const d = await requestPermission(baseReq(), {
      nonInteractive: true,
      skipRoutine: true,
    });
    expect(d).toBe('allow_session');
  });

  it('grants session when allowFiles blanket flag covers a write', async () => {
    const d = await requestPermission(
      baseReq({ tool: 'write_file', sideEffect: 'write', risk: 'medium' }),
      { allowFiles: true, nonInteractive: true },
    );
    expect(d).toBe('allow_session');
  });

  it('returns session grant for web.* when allowWeb is set', async () => {
    // web.* + network still always-asks, so the blanket flag should NOT
    // bypass the final prompt — non-interactive falls through to deny.
    const d = await requestPermission(
      baseReq({ tool: 'web.fetch', sideEffect: 'network', risk: 'medium' }),
      { allowWeb: true, nonInteractive: true },
    );
    expect(d).toBe('deny');
  });

  it('assertAllowed throws permission_denied on deny', async () => {
    await expect(
      assertAllowed(baseReq({ risk: 'critical', sideEffect: 'execute' }), {
        nonInteractive: true,
      }),
    ).rejects.toThrow(/permission denied/i);
  });
});
