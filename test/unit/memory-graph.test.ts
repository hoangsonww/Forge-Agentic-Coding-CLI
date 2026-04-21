/**
 * Memory Graph Tests.
 *
 * The graph module writes nodes/edges to SQLite. We stub getDb with a
 * lightweight in-memory table so we exercise the SQL shape and neighbor
 * fan-out without spinning up better-sqlite3.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = {
  project_id: string;
  src?: string;
  dst?: string;
  kind?: string;
  meta?: string | null;
  id?: string;
  type?: string;
  label?: string | null;
};

const edges: Row[] = [];
const nodes: Row[] = [];

const dbStub = {
  exec: vi.fn(),
  prepare: vi.fn((sql: string) => {
    const s = sql.toLowerCase();
    if (s.includes('insert into graph_nodes')) {
      return {
        run: (pid: string, id: string, type: string, label: string | null, meta: string | null) => {
          const existing = nodes.findIndex((n) => n.project_id === pid && n.id === id);
          const row: Row = { project_id: pid, id, type, label, meta };
          if (existing >= 0) nodes[existing] = row;
          else nodes.push(row);
        },
      };
    }
    if (s.includes('insert into graph_edges')) {
      return {
        run: (pid: string, src: string, dst: string, kind: string, meta: string | null) => {
          const existing = edges.findIndex(
            (e) => e.project_id === pid && e.src === src && e.dst === dst && e.kind === kind,
          );
          const row: Row = { project_id: pid, src, dst, kind, meta };
          if (existing >= 0) edges[existing] = row;
          else edges.push(row);
        },
      };
    }
    if (s.includes('select src, dst, kind, meta from graph_edges')) {
      return {
        all: (...args: unknown[]) => {
          const [pid, id, kind] = args as [string, string, string?];
          const isSrc = s.includes('src = ?');
          return edges.filter((e) => {
            if (e.project_id !== pid) return false;
            if (isSrc && e.src !== id) return false;
            if (!isSrc && e.dst !== id) return false;
            if (kind && e.kind !== kind) return false;
            return true;
          });
        },
      };
    }
    if (s.includes('delete from graph_nodes')) {
      return {
        run: (pid: string) => {
          for (let i = nodes.length - 1; i >= 0; i--)
            if (nodes[i].project_id === pid) nodes.splice(i, 1);
        },
      };
    }
    if (s.includes('delete from graph_edges')) {
      return {
        run: (pid: string) => {
          for (let i = edges.length - 1; i >= 0; i--)
            if (edges[i].project_id === pid) edges.splice(i, 1);
        },
      };
    }
    return { run: () => undefined, all: () => [] };
  }),
};

vi.mock('../../src/persistence/index-db', () => ({
  getDb: () => dbStub,
}));

import { upsertNode, upsertEdge, neighbors, clearProjectGraph } from '../../src/memory/graph';

describe('memory graph', () => {
  const root = '/tmp/test-root';

  beforeEach(() => {
    nodes.length = 0;
    edges.length = 0;
  });

  it('upserts a node', () => {
    upsertNode(root, { id: 'file:src/a.ts', type: 'file', label: 'a.ts' });
    expect(nodes.length).toBe(1);
    expect(nodes[0].id).toBe('file:src/a.ts');
  });

  it('upsertNode is idempotent on (project, id)', () => {
    upsertNode(root, { id: 'n1', type: 'file' });
    upsertNode(root, { id: 'n1', type: 'file', label: 'updated' });
    expect(nodes.length).toBe(1);
    expect(nodes[0].label).toBe('updated');
  });

  it('neighbors in both directions', () => {
    upsertEdge(root, { src: 'a', dst: 'b', kind: 'imports' });
    upsertEdge(root, { src: 'c', dst: 'a', kind: 'calls' });
    const both = neighbors(root, 'a');
    expect(both.length).toBe(2);
    const out = neighbors(root, 'a', undefined, 'out');
    expect(out.length).toBe(1);
    expect(out[0].dst).toBe('b');
    const inn = neighbors(root, 'a', undefined, 'in');
    expect(inn.length).toBe(1);
    expect(inn[0].src).toBe('c');
  });

  it('filters neighbors by edge kind', () => {
    upsertEdge(root, { src: 'a', dst: 'b', kind: 'imports' });
    upsertEdge(root, { src: 'a', dst: 'c', kind: 'calls' });
    const imports = neighbors(root, 'a', 'imports', 'out');
    expect(imports.length).toBe(1);
    expect(imports[0].dst).toBe('b');
  });

  it('clearProjectGraph wipes nodes and edges for a project', () => {
    upsertNode(root, { id: 'n', type: 'file' });
    upsertEdge(root, { src: 'a', dst: 'b', kind: 'imports' });
    clearProjectGraph(root);
    expect(nodes.length).toBe(0);
    expect(edges.length).toBe(0);
  });
});
