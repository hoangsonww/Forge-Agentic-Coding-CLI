# Forge architecture

This doc is the engineering map. It reflects what's in `src/` today, not a
hypothetical future.

## Layered overview

```
┌───────────────────────────────────────────────────────────────┐
│                  CLI (commander)                              │
│  init · run · plan · execute · status · task · session · …    │
└──────────┬────────────────────────────────────────────────────┘
           │
┌──────────▼────────────────────────────────────────────────────┐
│                  Orchestrator                                 │
│   classify → plan → approve → execute → verify → complete     │
│                        (src/core/)                            │
└──┬────────────────┬──────────────────────┬───────────────────┘
   │                │                      │
┌──▼─────┐    ┌─────▼─────┐          ┌─────▼──────┐
│ Agents │    │ Scheduler │          │ Persistence│
│        │    │  + DAG    │          │  JSONL     │
│ planner│    │  + locks  │          │  + SQLite  │
│ exec   │    │ (src/scheduler/)     │ (src/persistence/)
│ review │    └───────────┘          └─────┬──────┘
│ debug  │                                  │
│(src/agents/)                              │
└──┬─────┘                                  │
   │                                        │
┌──▼────────────────────────────────────────▼────────────────┐
│                  Tools                                      │
│ read/write/patch/grep/glob/run/tests/git/ask_user           │
│                   (src/tools/)                              │
└────┬───────────────────────────────────────────────────────┘
     │
┌────▼────────────────────────────────────────────────────────┐
│ Sandbox   ·  Permissions  ·  Security                       │
│ fs + shell   risk+prompts    redact + injection             │
│ (src/sandbox/)  (src/permissions/)   (src/security/)        │
└─────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│ Model providers  +  Prompt assembler                         │
│  ollama / anthropic    (layered, reproducible hash)          │
│  (src/models/, src/prompts/)                                 │
└──────────────────────────────────────────────────────────────┘
```

## Control plane

### Orchestrator (`src/core/orchestrator.ts`)

Single public entry for "run a task":

```ts
orchestrateRun({ input, mode, flags, autoApprove?, planOnly? })
```

Responsibilities: identify project, classify the task, create the Task
record, call into `runAgenticLoop`.

### Agentic loop (`src/core/loop.ts`)

Implements the full pipeline with state-machine transitions and hard limits.
Every step emits a structured event to `logs/events.jsonl` and a session
entry to the project's `sessions/<id>.jsonl`. Retry cap is 3; on final
failure, the debugger agent diagnoses before the task is marked `failed`.

## State machine

Canonical lifecycle (see `src/persistence/tasks.ts#LEGAL_TRANSITIONS`):

```
draft ─→ planned ─→ approved ─→ scheduled ─→ running ─→ verifying ─→ completed
   │         │                      │           │            │
   ▼         ▼                      ▼           ▼            ▼
cancelled  cancelled            cancelled   failed ─→ scheduled  (operator retry)
           blocked              blocked     blocked   failed
```

Illegal transitions throw `state_invalid`. There is no "pending" or
"queued" short-cut — every running task has passed approval.

## Permission model

- `src/permissions/risk.ts` classifies every tool by `risk` + `sideEffect`.
- `src/permissions/manager.ts` is the single choke-point.
- `--skip-permissions` removes only *routine* (low/medium + readonly/write)
  prompts. Critical/high risk, `execute`, and `network` side-effects always
  prompt (unless pre-authorized via `--allow-*` flags).
- Trust calibration: after N (config) successful confirmations of the same
  low-risk tool, Forge switches to auto-allow for that session.
- Persisted project/global grants live in SQLite (`permission_grants` table).

## Sandbox

- **Filesystem** (`src/sandbox/fs.ts`): every path is resolved to its realpath
  and verified inside the project root (plus explicit extra roots).
  Always-forbidden targets (`/etc/passwd`, SSH keys, AWS credentials) are
  blocked regardless of policy.
- **Shell** (`src/sandbox/shell.ts`): runs commands through `/bin/bash` with
  a blocklist (`rm -rf /`, `sudo`, fork bombs, curl-to-shell, …), risk
  classification (`git push` → high, `npm install` → medium), timeouts, and
  output-size truncation.

## Security

- **Redaction** (`src/security/redact.ts`): patterns for AWS / GitHub /
  OpenAI / Anthropic / Slack / JWT / bearer / PEM keys plus env-key
  heuristics. Applied before every log, session entry, and prompt.
- **Prompt-injection defense** (`src/security/injection.ts`): untrusted
  content (tool output, web, MCP) is fenced with visible "treat as data"
  markers and scanned for jailbreak patterns.

## Prompt assembly

Layered assembler (`src/prompts/assembler.ts`) produces:

```
[system_core] [mode] [project_instructions] [global_instructions]
[context (fenced)] [tools] [task_instructions] → system message
[user_input] → user message
```

Output includes a SHA-256 hash of the full prompt (reproducibility) and a
layer manifest (auditability). Token budgeting truncates lowest priority
first; `system_core`, `mode`, and `task_instructions` are never truncated.

## Model routing

`src/models/router.ts` picks provider+model by role (planner / architect /
executor / reviewer / debugger / fast) and mode. `offline-safe` forces
Ollama. On provider error there is an automatic single-retry against the
fallback provider, with the decision emitted to traces.

## Persistence

- **Task store** (`src/persistence/tasks.ts`): one JSON file per task with
  strict state-transition enforcement.
- **Sessions** (`src/persistence/sessions.ts`): append-only JSONL per session.
  Trivially streamable and replayable.
- **Events** (`src/persistence/events.ts`): append-only JSONL per project.
  Source of truth for post-hoc audits.
- **Global index** (`src/persistence/index-db.ts`): SQLite WAL with tables
  for `projects`, `tasks`, `sessions`, `permission_grants`,
  `learning_patterns`, `mcp_connections`. Migrations tracked in
  `schema_migrations`.

## Scheduler / concurrency

- `src/scheduler/resource-manager.ts` provides read/write/exclusive locks and
  semaphores for `maxTasks`, `maxGpuTasks`, `maxFileWrites`. Writer-priority
  so long-running readers don't starve writes.
- `src/scheduler/dag.ts` does topological sort + validation (cycles,
  duplicates, dangling deps) before execution.

## Agents

Each agent is a small module that (a) assembles a prompt via the shared
assembler and (b) calls the model router:

- **Planner** (`src/agents/planner.ts`): intent → DAG. Has a deterministic
  fallback if model output fails to parse so the loop never dead-ends.
- **Executor** (`src/agents/executor.ts`): one-step-at-a-time. Asks the model
  which tools to call and with what args, then executes each via the
  registry + permission manager.
- **Reviewer** (`src/agents/reviewer.ts`): post-execution validation. Can
  block completion if `completion.requireReview=true`.
- **Debugger** (`src/agents/debugger.ts`): root-cause analysis after retry
  exhaustion. Captures patterns to `learning_patterns`.

## MCP

- `src/mcp/client.ts`: minimal stdio JSON-RPC client (initialize,
  `tools/list`, `tools/call`). Deliberately small; grows to match real
  connectors.
- `src/mcp/registry.ts`: persistent connection registry backed by SQLite.
- HTTP-stream transport and OAuth are stubbed for the next iteration.

## Notifications

- Event bus (`src/notifications/manager.ts`) delivers severity-coded messages
  to the CLI (colored inline) and optionally OS notifications (macOS
  osascript / Linux `notify-send`). Verbosity is configurable
  (minimal/normal/verbose). All payloads pass through `redact()`.

## Daemon & updates

- `src/daemon/server.ts`: optional background process; listens on a unix
  socket (`~/.forge/daemon.sock`), polls the update registry.
- `src/daemon/updater.ts`: periodic check with cache +
  ignored-versions support. Today uses npm registry; will pivot to GitHub
  Releases with signature verification for native-binary distribution.

## Configuration

- Schema in `src/config/schema.ts` (zod). Invalid global config falls back
  to defaults and logs a warning instead of crashing — self-healing.
- Project config extends/overrides the global config.
- Both global and project have a parallel Markdown instructions file that
  gets layered into every prompt.

## Testing

Vitest covers the risk-critical code. As of v0.1.0 there are 25 test files /
88 tests:

- **Redaction** (8)
- **Injection defense** (3)
- **Sandbox fs + shell** (8)
- **Classifier heuristics** (5)
- **State machine** (5)
- **DAG validation** (4)
- **Prompt assembler reproducibility** (5)
- **Permission risk helpers** (4)
- **Hot memory** (3), **warm memory** (2), **web sanitize** (5), **web fetch guards** (4)
- **Edit file** (4), **release verify** (4), **keychain** (1)
- **Plan fixer** (4), **loop detector** (3), **estimation** (1)
- **Circuit breaker** (2), **rate limit** (2), **cost** (3), **spec parser** (2)
- **Log rotation** (2), **marketplace URL guard** (2), **signals** (2)

Run `npm test`.

## Second-pass additions (v0.1 final)

| Concern | Module |
|---|---|
| OpenAI / LocalAI / Azure / vLLM | `src/models/openai.ts` |
| llama.cpp | `src/models/llamacpp.ts` |
| Per-provider rate limit | `src/models/rate-limit.ts` |
| Circuit breaker | `src/models/circuit-breaker.ts` |
| Prompt cache | `src/models/cache.ts` |
| USD cost ledger | `src/models/cost.ts` |
| Architect agent | `src/agents/architect.ts` |
| Memory agent | `src/agents/memory.ts` |
| Plan auto-fixer | `src/core/plan-fixer.ts` |
| Loop detection | `src/core/loop-detection.ts` |
| Resource estimation | `src/core/estimation.ts` |
| Cross-session continuity | `src/core/continuity.ts` |
| Signal handling | `src/core/signals.ts` |
| Spec-driven development | `src/core/spec.ts` |
| Session forking | `src/core/fork.ts` |
| Log rotation | `src/logging/rotation.ts` |
| Session compression | `src/persistence/compression.ts` |
| Post-edit formatters | `src/tools/format.ts` |
| Skills marketplace | `src/skills/marketplace.ts` |
| Windows keychain | `src/keychain/windows.ts` |
| XDG compliance | `src/config/xdg.ts` |
| UI /healthz endpoint | `src/ui/server.ts` |
