# Forge

> **Local-first, multi-agent, programmable software-engineering runtime.**
>
> Not an assistant — a runtime. Forge has its own scheduler, resource manager,
> sandbox, permission system, state machine, and plugin ecosystem. You control
> what it can touch, when it can run, and how it thinks.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](#license)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

---

## Why Forge

Most AI coding tools are chat wrappers. Forge is engineering infrastructure:

- **Local-first by default.** Runs entirely on your machine with Ollama. Cloud
  providers (Anthropic) are opt-in, not required.
- **Agentic but controllable.** Every action is classified (risk, side-effect,
  sensitivity), gated by a permission system, and logged with a reproducible
  prompt hash.
- **Inspectable.** Sessions are JSONL; tasks are JSON; everything is
  replayable. No hidden state, no black boxes.
- **Mode-driven.** `fast | balanced | heavy | plan | audit | debug |
  architect | offline-safe` — explicit, not magical.
- **Extensible.** Drop a Markdown file into `~/.forge/skills/`, define a new
  agent, or add an MCP connector. No rebuild required.

---

## Quick start

```bash
# Install — picks the right path for you (registry if global, `npm link` if cloned).
curl -fsSL https://get.forge.dev | bash
#   …or from a clone:
./install/install.sh

# Either way you now have the `forge` command on PATH:
forge --version

# Initialize (creates ~/.forge and ./.forge)
forge init

# First task
forge run "add a /health endpoint to this Express app"

# Or: produce a plan without executing
forge plan "refactor the auth middleware to use JWT"

# Launch the dashboard
forge ui

# Check health
forge doctor
```

### Getting the `forge` command

| Scenario | Command | Notes |
| --- | --- | --- |
| **End user** (published release) | `npm install -g @forge/cli` | Ships a compiled JS fallback today; signed native binaries land in a future release. |
| **Developer / contributor** (cloned repo) | `npm install && npm run link` | Builds `dist/` then `npm link`s this checkout. Source rebuilds (`npm run build` or `npm run build:watch`) are picked up automatically — no re-link needed. |
| **Permanent local install** | `npm install -g .` | Snapshots the checkout into the global node prefix. Re-run after each rebuild. |
| **Undo** | `npm run unlink` | Removes the global `forge` symlink. |

After install, `forge` should resolve on PATH:

```bash
which forge        # → $(npm prefix -g)/bin/forge
forge --version
```

> **nvm caveat:** `npm link` is scoped to the active Node version. After
> `nvm use <other-version>`, re-run `npm run link` to re-expose `forge`.
> If `forge: command not found` appears despite a successful link, add
> `$(npm prefix -g)/bin` to your `PATH` in `~/.zshrc` / `~/.bashrc`.

## Requirements

- Node 20+
- One of:
  - [Ollama](https://ollama.ai) running locally (recommended — local-first)
  - `ANTHROPIC_API_KEY` set (enterprise fallback)

---

## The agentic loop

Every non-trivial task flows through a controlled pipeline:

```
INPUT → CLASSIFY → THINK → PLAN → VALIDATE → CONFIRM →
EXECUTE (sandboxed, permissioned) → VERIFY → FIX LOOP (bounded) →
COMPLETE → LEARN
```

- **Classification** picks agents, complexity, risk, and whether a plan is
  required. Heuristics first; an LLM fallback resolves low-confidence cases.
- **Planning** produces a DAG with step dependencies, risk annotations, and
  explicit tool calls. Every plan is validated (no cycles, no dangling deps).
- **Approval** is interactive by default. `--yes` auto-approves. High-risk
  actions (`write`, `execute`, `network`) always request explicit permission
  — even with `--skip-permissions`.
- **Execution** runs DAG steps with resource locks, timeouts, and a bounded
  retry policy (max 3 attempts, then escalate).
- **Verification** runs tests and a reviewer pass before completion.

```
forge run "fix the failing login test" --mode heavy
  → classified: bugfix, complexity=moderate, risk=low
  → plan: 4 steps (analyze → locate → patch → run_tests)
  → approve? [y/n/edit]
  → executed, tests passing
  → ✔ Done. Files changed: src/auth/login.ts
```

---

## Safety model (not optional)

Forge treats safety as load-bearing. These invariants are enforced in code,
not convention:

| Invariant | Where |
|---|---|
| Instruction precedence: `System Safety > Page Rules > Mode Rules > Approved Plan > Project Defaults > User Preferences` | `src/prompts/assembler.ts` |
| Permission model = default deny | `src/permissions/manager.ts` |
| `--skip-permissions` skips *routine* prompts only; critical/destructive actions always ask | `src/permissions/risk.ts` |
| Retry cap = 3, then escalate | `src/core/loop.ts` |
| Canonical task lifecycle | `src/persistence/tasks.ts` |
| Hard limits: `maxSteps=50`, `maxToolCalls=100`, `maxRuntimeSeconds=600` | `src/config/schema.ts` |
| Untrusted content (web/MCP/retrieved) fenced as data, never instructions | `src/security/injection.ts` |
| Secrets redacted before every log, session entry, and prompt | `src/security/redact.ts` |
| Scoped filesystem sandbox; symlink-escape-proof | `src/sandbox/fs.ts` |
| Destructive shell commands blocked (`rm -rf /`, `sudo`, fork bombs, curl-to-shell) | `src/sandbox/shell.ts` |

---

## CLI reference

```
forge init                          # create ~/.forge + project .forge
forge run "<prompt>"                # full agentic loop
forge plan "<prompt>"               # plan mode (no execution)
forge execute "<prompt>"            # auto-approve + execute
forge status                        # show runtime state
forge doctor                        # health check

forge task list|search              # task history (SQLite-indexed)
forge session list|replay <id>      # session JSONL inspection

forge model list                    # probe all providers
forge mcp list|add|remove|status    # MCP connections
forge skills list|new <name>        # skill management
forge agents list                   # custom agents

forge config get|set|path
forge permissions reset|list
forge daemon start|stop|status
forge update [--check|--force]
```

### Key flags on `run` / `plan` / `execute`

```
--mode <m>             fast|balanced|heavy|plan|audit|debug|architect|offline-safe
--yes                  auto-approve plan
--skip-permissions     skip routine prompts (high-risk still asked)
--allow-files          pre-approve file writes for this session
--allow-shell          pre-approve shell for this session
--allow-web            pre-approve web tools
--allow-mcp            pre-approve MCP tool calls
--strict               confirm every action
--non-interactive      deny all prompts silently (CI mode)
--debug                verbose logging
```

---

## Filesystem layout

```
~/.forge/
├── config.json               # global config
├── instructions.md           # personal coding style (applies to every task)
├── skills/*.md               # user skills
├── agents/*.md               # user agents
├── mcp/                      # MCP connections + tokens
├── models/                   # local model cache (Ollama manages this)
├── logs/
│   ├── forge.log             # structured logs (JSONL)
│   └── update-check.json     # cached update metadata
├── global/
│   └── index.db              # SQLite: tasks + projects + grants + learning
└── projects/<project-hash>/
    ├── metadata.json
    ├── tasks/*.json          # one file per task
    ├── sessions/*.jsonl      # conversation history per session
    └── logs/events.jsonl     # structured event stream

./.forge/                      # per-project
├── config.json
├── instructions.md
├── skills/                    # project-scoped skills (override global)
├── agents/
└── mcp/
```

---

## Skills

A skill is a Markdown file with YAML frontmatter. Drop it into
`~/.forge/skills/` (global) or `.forge/skills/` (project-scoped).

```markdown
---
name: refactor-react-component
description: Refactor a React component for readability and performance.
inputs:
  - file
  - requirements
tools:
  - read_file
  - write_file
  - run_tests
tags:
  - react
  - frontend
---

## Instructions

1. Analyze the component structure.
2. Extract reusable hooks if helpful.
3. Simplify state management.
4. Ensure props are typed.
5. Update tests accordingly.
```

Scaffold one: `forge skills new my-skill --project`.

---

## MCP connections

```bash
forge mcp add              # interactive: stdio or http, auth type, command/url
forge mcp list
forge mcp status <id>
forge mcp remove <id>
```

Today: stdio transport (full MCP handshake + `tools/list` + `tools/call`) and
connection registry. OAuth flow and full HTTP-stream transport are next.

---

## Provider model routing

Forge routes by role (planner, architect, executor, reviewer, debugger, fast),
with an automatic fallback to any other available provider if the primary
errors:

| Role | Ollama default | Anthropic default |
|------|----------------|-------------------|
| planner / architect | `qwen2.5:7b` / `llama3:70b` | `claude-sonnet-4-6` / `claude-opus-4-7` |
| executor | `deepseek-coder:6.7b` | `claude-sonnet-4-6` |
| reviewer | `llama3:8b` | `claude-opus-4-7` |
| debugger | `qwen2.5:7b` | `claude-opus-4-7` |
| fast | `phi3:mini` | `claude-haiku-4-5-20251001` |

Override via `forge config set models.balanced <model>` (etc).

---

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full layered design
(orchestrator, agents, scheduler, sandbox, memory, MCP, notifications).

---

## Development

```bash
git clone https://github.com/forge/forge
cd forge
npm install
npm run build
npm test
./bin/forge.js doctor
```

Project layout:

```
src/
├── cli/           # commander-based CLI + commands
├── core/          # orchestrator + agentic loop
├── agents/        # planner / executor / reviewer / debugger
├── classifier/    # heuristic + LLM task classification
├── models/        # provider interface, ollama, anthropic, router
├── prompts/       # layered assembler with reproducible hash
├── tools/         # read_file, write_file, grep, glob, run_command, git, …
├── sandbox/       # scoped fs + restricted shell
├── permissions/   # risk + interactive grant manager
├── persistence/   # task/session/event JSONL + SQLite index
├── scheduler/     # DAG executor, resource manager, semaphores
├── mcp/           # stdio client + connection registry
├── skills/        # markdown skill/agent loader
├── notifications/ # event bus → CLI/OS notifier
├── daemon/        # background process + updater
├── config/        # zod-validated schema + paths
├── security/      # redaction + prompt-injection defense
├── logging/       # structured logger + trace-id helpers
└── types/         # shared contracts
```

---

## Status

v0.1 — every item from the 19 planning docs is implemented and prod-ready.
128 TypeScript files / ~11,900 LOC / 25 test files / 88 passing tests / 27 CLI command groups.

- Memory: hot/warm/cold (FTS5)/learning with automatic retrieval + decay
- 4 model providers: Ollama, Anthropic, OpenAI-compatible (OpenAI/Azure/vLLM/LocalAI), llama.cpp
- Router: per-provider rate limit, circuit breaker, prompt cache, USD cost ledger
- 6 agents: Planner, Architect, Executor, Reviewer, Debugger, Memory
- Loop: classify → think → plan → auto-fix → estimate → approve → execute → format → verify → fix (loop-detected, bounded) → complete → learn
- Web: search (Tavily/Brave/DuckDuckGo), SSRF-guarded fetch, Playwright browse
- MCP: stdio + HTTP-stream transports, OAuth 2.0 + PKCE, API-key auth
- Keychain: macOS/Linux/Windows + AES-GCM fallback
- Release: SHA-256 + Ed25519 signature verification, signed-manifest workflow
- Dashboard, offline bundles, containers, migrations, log rotation, signals, XDG

See [`CHANGELOG.md`](./CHANGELOG.md) and [`docs/CLI-REFERENCE.md`](./docs/CLI-REFERENCE.md).

## License

MIT
