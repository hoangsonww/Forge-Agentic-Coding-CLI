/**
 * Context graph (scoped per project): files + symbols + commits, with
 * `imports/calls/modifies/relates_to` edges. Stored in SQLite alongside the
 * global index. Deliberately small — tuned for fast queries, not graph DB
 * parity.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { getDb } from '../persistence/index-db';
import { projectId as computeProjectId } from '../config/paths';

const migrate = (): void => {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS graph_nodes (
      project_id TEXT NOT NULL,
      id TEXT NOT NULL,
      type TEXT NOT NULL,
      label TEXT,
      meta TEXT,
      relevance REAL DEFAULT 0.5,
      recency REAL DEFAULT 0.5,
      reliability REAL DEFAULT 0.5,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, id)
    );

    CREATE TABLE IF NOT EXISTS graph_edges (
      project_id TEXT NOT NULL,
      src TEXT NOT NULL,
      dst TEXT NOT NULL,
      kind TEXT NOT NULL,
      meta TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, src, dst, kind)
    );

    CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(project_id, type);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_src ON graph_edges(project_id, src);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_dst ON graph_edges(project_id, dst);
  `);
};

export type NodeType = 'file' | 'function' | 'class' | 'api' | 'commit' | 'issue' | 'symbol';
export type EdgeKind = 'imports' | 'calls' | 'defines' | 'modifies' | 'relates_to';

export interface Node {
  id: string;
  type: NodeType;
  label?: string;
  meta?: Record<string, unknown>;
}

export interface Edge {
  src: string;
  dst: string;
  kind: EdgeKind;
  meta?: Record<string, unknown>;
}

export const upsertNode = (projectRoot: string, node: Node): void => {
  migrate();
  const db = getDb();
  const pid = computeProjectId(projectRoot);
  db.prepare(
    `INSERT INTO graph_nodes (project_id, id, type, label, meta, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, id) DO UPDATE SET
       type = excluded.type,
       label = excluded.label,
       meta = excluded.meta,
       updated_at = excluded.updated_at`,
  ).run(
    pid,
    node.id,
    node.type,
    node.label ?? null,
    node.meta ? JSON.stringify(node.meta) : null,
    new Date().toISOString(),
  );
};

export const upsertEdge = (projectRoot: string, edge: Edge): void => {
  migrate();
  const db = getDb();
  const pid = computeProjectId(projectRoot);
  db.prepare(
    `INSERT INTO graph_edges (project_id, src, dst, kind, meta, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, src, dst, kind) DO UPDATE SET
       meta = excluded.meta,
       updated_at = excluded.updated_at`,
  ).run(
    pid,
    edge.src,
    edge.dst,
    edge.kind,
    edge.meta ? JSON.stringify(edge.meta) : null,
    new Date().toISOString(),
  );
};

export const neighbors = (
  projectRoot: string,
  nodeId: string,
  kind?: EdgeKind,
  direction: 'out' | 'in' | 'both' = 'both',
): Edge[] => {
  migrate();
  const db = getDb();
  const pid = computeProjectId(projectRoot);
  const rows: Array<{ src: string; dst: string; kind: string; meta: string | null }> = [];
  if (direction === 'out' || direction === 'both') {
    const out = db
      .prepare(
        `SELECT src, dst, kind, meta FROM graph_edges
         WHERE project_id = ? AND src = ? ${kind ? 'AND kind = ?' : ''}`,
      )
      .all(...(kind ? [pid, nodeId, kind] : [pid, nodeId])) as typeof rows;
    rows.push(...out);
  }
  if (direction === 'in' || direction === 'both') {
    const inn = db
      .prepare(
        `SELECT src, dst, kind, meta FROM graph_edges
         WHERE project_id = ? AND dst = ? ${kind ? 'AND kind = ?' : ''}`,
      )
      .all(...(kind ? [pid, nodeId, kind] : [pid, nodeId])) as typeof rows;
    rows.push(...inn);
  }
  return rows.map((r) => ({
    src: r.src,
    dst: r.dst,
    kind: r.kind as EdgeKind,
    meta: r.meta ? JSON.parse(r.meta) : undefined,
  }));
};

export const clearProjectGraph = (projectRoot: string): void => {
  migrate();
  const db = getDb();
  const pid = computeProjectId(projectRoot);
  db.prepare('DELETE FROM graph_nodes WHERE project_id = ?').run(pid);
  db.prepare('DELETE FROM graph_edges WHERE project_id = ?').run(pid);
};
