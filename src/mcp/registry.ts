/**
 * Registry for MCP connections. This is a simple key-value store that allows us to persist connection configurations across sessions. Each connection is
 * identified by a unique ID and includes details like transport type, endpoint, and authentication info. The registry provides functions to add, list, and remove connections, and it abstracts away the underlying storage mechanism (IndexedDB in this case) from the rest of the application.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { listMcp, upsertMcp, deleteMcp, McpRow } from '../persistence/index-db';
import { McpConnection } from '../types';

export const addConnection = (conn: McpConnection): void => {
  upsertMcp({
    id: conn.id,
    name: conn.name,
    transport: conn.transport,
    endpoint: conn.endpoint ?? null,
    command: conn.command ?? null,
    args: conn.args ? JSON.stringify(conn.args) : null,
    auth: conn.auth,
    status: conn.status,
    last_used_at: conn.lastUsedAt ?? null,
    tools: conn.tools ? JSON.stringify(conn.tools) : null,
  });
};

export const listConnections = (): McpConnection[] =>
  listMcp().map((r: McpRow) => ({
    id: r.id,
    name: r.name,
    transport: r.transport as McpConnection['transport'],
    endpoint: r.endpoint ?? undefined,
    command: r.command ?? undefined,
    args: r.args ? (JSON.parse(r.args) as string[]) : undefined,
    auth: r.auth as McpConnection['auth'],
    status: r.status as McpConnection['status'],
    lastUsedAt: r.last_used_at ?? undefined,
    tools: r.tools ? (JSON.parse(r.tools) as string[]) : undefined,
  }));

export const removeConnection = (id: string): void => deleteMcp(id);
