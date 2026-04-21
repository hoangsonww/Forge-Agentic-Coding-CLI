# MCP connectors

Each JSON file here matches the `McpConnection` shape from
[`src/types/index.ts`](../../src/types/index.ts). Drop one into
`~/.forge/mcp/` (or `./.forge/mcp/`) and Forge will pick it up on the
next run.

## Schema

```jsonc
{
  "id":        "string",                          // unique per scope
  "name":      "human-readable label",
  "transport": "stdio" | "http_stream" | "websocket",
  "endpoint":  "url for http_stream / websocket",
  "command":   "binary for stdio",
  "args":      ["argv for stdio"],
  "auth":      "none" | "api_key" | "oauth" | "basic",
  "status":    "connected" | "disconnected" | "error" | "reauth_required",
  "tools":     ["optional hint list; server-declared"]
}
```

## Examples

| File | Server | Transport |
|---|---|---|
| [`filesystem-server.json`](filesystem-server.json) | `@modelcontextprotocol/server-filesystem` | stdio |
| [`github-server.json`](github-server.json) | GitHub MCP | stdio + bearer |
| [`postgres-server.json`](postgres-server.json) | Postgres MCP | stdio + conn string |

## Auth tips

- **API keys / tokens** live in the OS keychain, not this file. Put
  placeholder values here; run `forge mcp login <id>` to prompt for the
  real credential and write it to the keychain.
- **OAuth**: use `"auth": "oauth"` and Forge will run the OAuth 2.0 +
  PKCE flow when the connection first activates (see
  `src/mcp/oauth.ts`). No client secrets go in this JSON.
- **Environment variables** that reference secrets (e.g. `GITHUB_TOKEN`)
  are expanded at connect time from your shell — the JSON stays
  committable.

## Troubleshooting

```bash
forge mcp list            # show registered servers
forge mcp status <id>     # probe the server
forge mcp tools <id>      # list advertised tools
forge mcp logout <id>     # clear cached credentials
```

If the stdio server prints to `stdout` with non-JSON content, Forge
debug-logs and drops it. Check `~/.forge/logs/forge.log` when a
connection silently stops responding.
