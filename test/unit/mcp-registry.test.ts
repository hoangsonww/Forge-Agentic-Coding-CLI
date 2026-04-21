/**
 * MCP Registry Tests.
 *
 * Thin wrapper over the SQLite mcp row persistence. Stub the storage
 * module so we exercise the serialization logic (JSON.stringify of
 * args/tools, null-pass-through for optional fields) without a real db.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertSpy = vi.fn();
const deleteSpy = vi.fn();
let rows: unknown[] = [];

vi.mock('../../src/persistence/index-db', () => ({
  listMcp: () => rows,
  upsertMcp: (r: unknown) => {
    upsertSpy(r);
    rows = [r, ...rows.filter((x) => (x as { id: string }).id !== (r as { id: string }).id)];
  },
  deleteMcp: (id: string) => {
    deleteSpy(id);
    rows = rows.filter((r) => (r as { id: string }).id !== id);
  },
}));

import { addConnection, listConnections, removeConnection } from '../../src/mcp/registry';
import type { McpConnection } from '../../src/types';

const conn = (over: Partial<McpConnection> = {}): McpConnection => ({
  id: 'c1',
  name: 'test',
  transport: 'http',
  endpoint: 'https://example/mcp',
  auth: 'none',
  status: 'active',
  tools: ['grep', 'read'],
  ...over,
});

describe('mcp registry', () => {
  beforeEach(() => {
    rows = [];
    upsertSpy.mockReset();
    deleteSpy.mockReset();
  });

  it('addConnection serializes args/tools to JSON', () => {
    addConnection(conn({ args: ['-x', '-y'] }));
    const row = upsertSpy.mock.calls[0][0] as {
      tools: string | null;
      args: string | null;
      endpoint: string | null;
    };
    expect(JSON.parse(row.tools!)).toEqual(['grep', 'read']);
    expect(JSON.parse(row.args!)).toEqual(['-x', '-y']);
  });

  it('listConnections round-trips tools/args arrays', () => {
    addConnection(conn({ args: ['-x'] }));
    const got = listConnections();
    expect(got.length).toBe(1);
    expect(got[0].tools).toEqual(['grep', 'read']);
    expect(got[0].args).toEqual(['-x']);
  });

  it('removeConnection calls through to delete', () => {
    addConnection(conn());
    removeConnection('c1');
    expect(deleteSpy).toHaveBeenCalledWith('c1');
  });

  it('preserves optional fields as undefined when storage row has nulls', () => {
    addConnection(conn({ args: undefined, endpoint: undefined, tools: undefined }));
    const got = listConnections()[0];
    expect(got.args).toBeUndefined();
    expect(got.endpoint).toBeUndefined();
    expect(got.tools).toBeUndefined();
  });
});
