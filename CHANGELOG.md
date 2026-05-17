# Changelog

All notable changes to Forge are tracked here. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.1] - 2026-04-29

Patch release: ships the MCP server surface (`forge mcp serve`) that landed after 1.0.0, plus a CI fix that unblocks the Windows artifacts job in the release workflow.

### Added
- **Forge as an MCP server** (`forge mcp serve`). Exposes the runtime as MCP tools so Claude Desktop, Cursor, Continue, and any other MCP client can plan and run Forge tasks from their own chat. Two trust tiers: read-only (default) exposes `forge_status`, `forge_plan`, `forge_get_task`, `forge_list_tasks`; `--allow-execute` (or `FORGE_MCP_ALLOW_EXECUTE=true`) adds `forge_run` and `forge_cancel_task`. Wraps the same `orchestrateRun()` entry point as the CLI/REPL/dashboard, so MCP-driven plans are byte-identical paths. See `docs/MCP-SERVER.md` for per-client setup.

### Fixed
- **Release workflow Windows artifacts**: the three install steps in `release.yml` used bash-only constructs (`2>/dev/null`, `||`-grouped fallbacks, `rm -rf`) which PowerShell parses as filesystem paths. Force `shell: bash` so the Windows runner uses Git Bash. The artifacts (win32-x64) job no longer crashes with `Could not find a part of the path 'D:\dev\null'`.

## [1.0.0] - 2026-04-27

First stable release. The runtime, agentic loop, persistence model, permission system, sandbox, and provider abstractions are now considered stable surface area. Breaking changes from here on bump MAJOR.

### Added
- **VS Code extension** (`vscode-extension/`, published as `hoangsonw.forge-agentic-coding-cli`). First-class editor surface with an activity-bar webview, status-bar pill, command palette integration, deep-linking from any task into the dashboard's conversation view, integrated terminals for REPL / `forge run` / `forge ui start` / `forge doctor`, and an embedded dashboard webview. Reads stats directly from `~/.forge/global/index.db` so token, call, and task counts stay accurate even with no Forge process running. Onboarding flow when the runtime is missing: install via npm, custom-path override, docs link.
- **Dashboard URL deep-linking** — `?task=<id>` (or `#task=<id>`) opens the task detail view on load; `?view=<name>` jumps directly to a named view. Used by the VS Code extension's "view all" and per-task click-through, but available to any caller.
- **Plan-edit modal** in the dashboard — JSON editor pops up when you choose Edit on a plan approval; edited plans flow back through the same `interactive-host` channel as terminal edits.
- **Live markdown streaming in the dashboard** — `model.delta` events render via `requestAnimationFrame`-coalesced markdown reflow so headings, fences, and lists form up as tokens arrive instead of dumping at the end.
- **Per-task delta replay buffer** so a WebSocket client that connects mid-stream sees the tokens that were already emitted, not just future ones.
- **Cross-project task detail lookup** — `/api/tasks/:id` resolves the project automatically via the global index, with a fallback chain (explicit `?projectPath=` → `getTask().project_id` → `findProjectRoot()` → `process.cwd()`). 404 responses now include the list of paths that were tried.
- **Demos page** in the docs site (`#demos`) and a dedicated **VS Code section** (`#vscode`) on the landing page.
- **Demo recordings** for REPL, CLI, and dashboard surfaces, plus a screenshot of the VS Code extension. Drive overlay buttons on every video for users who can't load embedded MP4s.

### Changed
- Tightened dashboard markdown renderer: inline triple-backtick fences now normalised to multi-line; ordered lists honor source numbering via `<ol start="N">` and tolerate blank lines between items; per-line borders inside `<pre><code>` removed; chat-bubble whitespace tightened.
- REPL launch banner and completion block now render with the same divider/breadcrumb/summary treatment as `forge run`, so REPL turns and one-shot CLI runs look identical.
- Status-bar dashboard reachability indicator now probes `/api/status` over HTTP before flipping to "offline", eliminating false-offline blips during heavy task streams.
- Plan auto-approval bug: plans now wait for the user's decision in the UI before execution. Previously some plans were silently approved.
- Conversation rendering: TASK_COMPLETED events carry a short message; the streamed reply is no longer duplicated in the DONE block.

### Fixed
- Streaming dropping deltas due to a task-id mismatch between the UI runner and the orchestrator. Both sides now agree on the canonical `task_<hex>` id.
- "Spend $0.000" stat tile removed for local providers (Ollama / llama.cpp), where cost is always zero by design. Token totals still shown.
- Tokens stat now reflects the real lifetime sum from `model_cost_ledger` instead of the in-memory delta.
- Recent-task rows weren't clickable / showed every task as `pending` because the API field is `status` (not `state`) and `title` (not `prompt`). Field names corrected and the entire row is now the click target.
- Sidebar layout overflowed on narrow widths. Action grid uses `repeat(auto-fit, minmax(96px, 1fr))`; stats grid uses `minmax(78px, 1fr)`. Workspace card uses RTL truncation so long paths show their tail.
- VS Code "view all" button now opens the dashboard's Tasks page, not the home view.

## [0.1.0] - 2026-04-18

Initial public release. Includes the full planning spec surface area.

### Second comprehensive pass — closure of remaining gaps from the 19 planning docs
- **Providers:** OpenAI-compatible (OpenAI, LocalAI, Azure OpenAI, vLLM via base-URL override), llama.cpp HTTP server.
- **Router:** per-provider token-bucket rate limit, circuit breaker with auto-recovery, prompt-hash cache (deterministic calls), USD cost ledger with per-task attribution.
- **Agents:** Architect (design documents only) and Memory (context graph maintenance).
- **Loop:** plan auto-fixer, pathological retry loop detection, pre-execution resource estimate, `--deterministic`/`--trace` flags, SIGINT/SIGTERM cooperative abort, post-edit Prettier/Black/ruff/gofmt/rustfmt integration.
- **Commands:** `forge spec`, `forge resume`, `forge session fork`, `forge cost totals|recent`, `forge changelog`, `forge dev setup|build|test|lint`, `forge skills search|install`.
- **Persistence:** session compression, `prompt_cache`, `model_cost_ledger`, `session_archive`, `graph_nodes|edges` tables, explicit `forge migrate` runner.
- **Platform:** Windows `install.ps1`, Windows Credential Manager keychain, XDG_DATA_HOME compliance, 20MB log rotation, `/healthz` endpoint.
- **Tests:** +23 unit tests → 88 total.


### Runtime
- Multi-agent orchestrator with DAG execution (Planner, Executor, Reviewer, Debugger).
- Agentic loop: Classify → Think → Plan → Validate → Confirm → Execute → Verify → Fix → Complete → Learn.
- Bounded retries (3) with diagnostic pass + learning capture on exhaustion.
- Hard limits: `maxSteps=50`, `maxToolCalls=100`, `maxRuntimeSeconds=600`.
- Canonical 10-state task lifecycle with enforced legal transitions.

### Memory
- Hot (in-process, token-budgeted).
- Warm (dependency-graph traversal for TS/JS/Python/Go/Rust).
- Cold (SQLite FTS5 over the codebase; `forge memory index|search|prune`).
- Learning (success/failure patterns with confidence evolution + time decay).
- Unified retrieval integrated into planner prompts.

### Tools
- Filesystem: `read_file`, `write_file`, `edit_file` (surgical), `apply_patch`, `list_dir`, `move_file`, `delete_file`.
- Search: `grep`, `glob`.
- Execution: `run_command`, `run_tests` (auto-detects npm/pnpm/yarn/pytest/go/cargo).
- Git: `git_status`, `git_diff`, `git_branch`.
- Web: `web.search` (Tavily/Brave/DuckDuckGo fallback), `web.fetch` (SSRF-guarded), `web.browse` (Playwright).
- User: `ask_user`.

### Safety
- Default-deny permissions; `--skip-permissions` never bypasses high-risk/destructive/network actions.
- Scoped FS sandbox with symlink-escape protection and always-forbidden paths.
- Shell blocklist + risk classification (`rm -rf /`, `sudo`, fork bombs, curl-to-shell, …).
- SSRF guard on all network requests (refuses loopback + RFC1918 + link-local).
- Secret redaction (AWS/GitHub/OpenAI/Anthropic/Slack/JWT/PEM) before every log/session/prompt.
- Prompt-injection filter + untrusted-data fencing for web/MCP/retrieved content.

### Providers
- Ollama (local-first, HTTP-based).
- Anthropic Claude (Opus 4.7 / Sonnet 4.6 / Haiku 4.5) for enterprise fallback.
- Role-based routing with automatic single-retry against fallback provider.

### Prompts
- Layered assembler (system_core · mode · global · project · context · tools · task · user).
- Reproducible SHA-256 hash per prompt + full layer manifest.
- Token-budget truncation (lowest priority first; system/mode/task never truncated).

### Persistence
- SQLite global index (tasks, projects, permission_grants, learning_patterns, mcp_connections, doc_meta, FTS5 docs, tool_usage, graph_nodes, graph_edges) with versioned migrations.
- JSONL append-only events and sessions per project.
- Replayable sessions, cross-project search.

### MCP
- Stdio + HTTP-stream transports.
- OAuth 2.0 authorization code flow with PKCE and loopback callback.
- API-key auth path.
- Encrypted token storage via OS keychain (macOS/Linux) with AES-256-GCM fallback.

### Distribution
- npm package with binary postinstall (skippable via `FORGE_SKIP_DOWNLOAD`).
- GitHub Releases-based binary download with SHA-256 + Ed25519 signature verification.
- Offline bundle (`forge bundle create|install`).
- Docker + compose (core, UI, Ollama services) and `forge container up|down|logs|rebuild|shell`.

### CI / CD
- GitHub Actions: ci (typecheck, test, lint, doctor), release (multi-platform artifact build + signed manifest + npm publish with provenance), nightly.
- Channels: `stable`, `beta`, `nightly`.
- Auto-update detection with non-intrusive CLI notification and ignore/snooze.

### UI
- HTTP + WebSocket dashboard (`forge ui start`) with live event stream.
- No build step required (vanilla ES modules).
- Views: Dashboard, Tasks, Models, Learning.

### Skills & Agents
- Markdown-with-frontmatter skills and custom agents.
- Project-scoped overrides of global definitions.
- `forge skills list|new`, `forge agents list`.

### CLI
- 23 top-level command groups. Run `forge --help` for the full surface.
