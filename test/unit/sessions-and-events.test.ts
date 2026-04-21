/**
 * Sessions + Events Persistence Tests.
 *
 * These modules are thin adapters over jsonl, but they are the
 * public surface used across the runtime, so we pin the basic
 * append/load/stream round-trip. Uses a temp FORGE_HOME via
 * ensureProjectDir to avoid polluting the dev machine.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { appendSessionEntry, loadSession, streamSession } from '../../src/persistence/sessions';
import { emit, streamEvents } from '../../src/persistence/events';
import type { SessionEntry, ForgeEvent } from '../../src/types';

describe('session persistence', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-sess-')));
  });

  it('appends and reloads session entries in order', async () => {
    const sessionId = 'sess-a';
    const e1: SessionEntry = { at: new Date().toISOString(), type: 'user', content: 'hi' } as never;
    const e2: SessionEntry = {
      at: new Date().toISOString(),
      type: 'assistant',
      content: 'hello',
    } as never;
    appendSessionEntry(projectRoot, sessionId, e1);
    appendSessionEntry(projectRoot, sessionId, e2);
    const loaded = await loadSession(projectRoot, sessionId);
    expect(loaded.length).toBe(2);
    expect((loaded[0] as { type: string }).type).toBe('user');
  });

  it('streams session entries', async () => {
    const sessionId = 'sess-b';
    appendSessionEntry(projectRoot, sessionId, {
      at: new Date().toISOString(),
      type: 'user',
      content: 'one',
    } as never);
    const seen: SessionEntry[] = [];
    for await (const e of streamSession(projectRoot, sessionId)) seen.push(e);
    expect(seen.length).toBe(1);
  });
});

describe('event persistence', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-evt-')));
  });

  it('emits and streams events', async () => {
    const event: ForgeEvent = {
      id: 'e1',
      at: new Date().toISOString(),
      type: 'unit.test',
      severity: 'info',
      message: 'hello',
    } as ForgeEvent;
    emit(projectRoot, event);
    emit(projectRoot, { ...event, id: 'e2', message: 'bye' });
    const seen: ForgeEvent[] = [];
    for await (const e of streamEvents(projectRoot)) seen.push(e);
    expect(seen.length).toBe(2);
    expect(seen[0].id).toBe('e1');
  });
});
