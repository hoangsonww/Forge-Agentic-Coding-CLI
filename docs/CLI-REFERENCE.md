# CLI reference

Full surface as of v1.0.0. `forge help <command>` for any sub-command.

## Root

```
forge [--debug]                 toggle debug logging globally
forge --version                 print version
```

## Lifecycle

```
forge init [--yes] [--provider ollama|anthropic]
forge status
forge doctor
```

## Tasks

```
forge run <prompt...>   [--mode ...] [--yes] [--plan-only]
                        [--skip-permissions] [--allow-files|shell|network|web|mcp]
                        [--strict] [--non-interactive]
forge plan <prompt...>
forge execute <prompt...>

forge task list [-n 20] [-p <projectId>]
forge task search <query>
forge task delete <id> [-y|--yes]           # alias: forge task rm
```

`task delete` removes the project-local task JSON (`<projectRoot>/tasks/<id>.json`)
and the row from the global SQLite index. It prompts for confirmation
interactively; pass `-y` / `--yes` to skip the prompt in CI or scripts.
Conversation JSONL files are *not* touched — they're keyed by conversation
id and can span multiple tasks.

## Sessions

```
forge session list
forge session replay <sessionId>
```

## Models

```
forge model list
```

Routing is automatic. To change the default provider or per-role model:

```
forge config set provider ollama|anthropic
forge config set models.planner qwen2.5:7b
forge config set models.code    deepseek-coder:6.7b
```

## Memory

```
forge memory index                          # index current project into FTS5
forge memory search "<query>" [-n 10]       # search cold index
forge memory prune                          # drop index for this project
forge memory decay [--days 30] [--factor 0.95]
forge memory clear-learning --yes           # wipe learning patterns
```

## Web

```
forge web search "<query>" [-n 5]
forge web fetch <url> [--max-chars 3000]
```

Providers: `TAVILY_API_KEY` > `BRAVE_SEARCH_API_KEY` > DuckDuckGo HTML fallback.

## MCP

```
forge mcp list
forge mcp add                               # interactive wizard
forge mcp remove <id>
forge mcp status <id>
forge mcp auth <id> \
    --client-id <cid> --client-secret <s> \
    --auth-url <u>    --token-url <u> [--scopes "a b c"] [--redirect-port 8787]
forge mcp refresh <id> --client-id ... --token-url ...
```

API-key connections use `forge mcp auth <id>` (interactive password prompt).

## Skills & agents

```
forge skills list
forge skills new <name> [--project]
forge agents list
```

Drop `.md` files into `~/.forge/skills/` (or `.forge/skills/` per-project).

## Dashboard (UI)

```
forge ui start [--port 7823] [--bind 127.0.0.1]
```

## Daemon

```
forge daemon start | stop | status
```

The daemon polls for updates, serves the UI socket, and runs periodic
learning-memory decay.

## Updates

```
forge update            # check + apply
forge update --check    # check only
forge update --force    # force network check
forge update ignore <version>
```

Native binary distribution downloads from GitHub Releases and verifies the
manifest's SHA-256 + Ed25519 signature before activation.

**Automatic check on REPL start.** Every `forge` invocation that opens the
REPL (bare `forge` or `forge repl`) fires a non-blocking update check.
Network hits are rate-limited by `update.checkIntervalHours` (default 24h),
so repeated starts read from the on-disk cache. When a newer version is
available and `update.notify` is true, a single-line notice is printed
after the hero directing the user to `/update` or `/update ignore <version>`.
Disable via `forge config set update.autoCheck false` or silence the
banner with `forge config set update.notify false`.

## Configuration

```
forge config get [key]        # prints full config if no key
forge config set <key> <value>
forge config path             # show data/config paths
```

## Permissions

```
forge permissions reset
forge permissions list        # project / global persisted grants
```

## Bundles (offline install)

```
forge bundle create [--output /path]
forge bundle install <bundle.tar.gz> [--prefix ~/.forge/bundle]
```

## Containers

```
forge container up | down | logs [--service s] | rebuild | shell
```

Uses Docker compose or podman-compose, whichever is available.

## Database

```
forge migrate              # apply pending SQLite migrations
```

## Help

```
forge help
forge help <command>
```
