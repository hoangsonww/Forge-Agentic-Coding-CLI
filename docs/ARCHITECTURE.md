# Forge — Architecture Document

> [!TIP]
> The engineering map. Every diagram and file reference here reflects what
> lives in `src/` today, so you can grep from any claim straight to the code.

> [!NOTE]
> Visit the NPM package of Forge for more information: [`@forge/agentic-coding`](https://www.npmjs.com/package/@hoangsonw/forge).

## Table of contents

- [1. Layered overview](#1-layered-overview)
- [2. Agentic loop](#2-agentic-loop)
- [3. Task state machine](#3-task-state-machine)
- [4. Executor — iterative tool-use with validation gate](#4-executor--iterative-tool-use-with-validation-gate)
- [5. Memory layers](#5-memory-layers)
- [6. Model routing & provider registry](#6-model-routing--provider-registry)
- [7. Permission + sandbox model](#7-permission--sandbox-model)
- [8. Conversation & persistence](#8-conversation--persistence)
- [9. UI topology](#9-ui-topology)
- [10. CI/CD pipeline](#10-cicd-pipeline)
- [11. Deployment topologies](#11-deployment-topologies)
- [12. Runtime metrics at a glance](#12-runtime-metrics-at-a-glance)
- [13. Directory map](#13-directory-map)

---

## 1. Layered overview

Forge is organized into layers with clear dependencies. The core orchestrator and
loop are at the center, with agents, tools, and I/O surfaces radiating out.

```mermaid
flowchart TB
  classDef surface fill:#0f172a,stroke:#38bdf8,color:#f1f5f9,rx:6,ry:6
  classDef core    fill:#082f49,stroke:#38bdf8,color:#e0f2fe,rx:6,ry:6
  classDef agent   fill:#1e293b,stroke:#a78bfa,color:#ede9fe,rx:6,ry:6
  classDef io      fill:#0f172a,stroke:#10b981,color:#d1fae5,rx:6,ry:6
  classDef store   fill:#18181b,stroke:#f59e0b,color:#fef3c7,rx:6,ry:6

  subgraph S[User surfaces]
    CLI["CLI (commander)"]:::surface
    REPL["REPL (raw-mode editor)"]:::surface
    UI["Dashboard (HTTP + WS)"]:::surface
  end

  ORCH["Orchestrator<br/>src/core/orchestrator.ts"]:::core
  LOOP["Agentic loop<br/>src/core/loop.ts"]:::core
  CLASS["Classifier"]:::core

  subgraph A[Agents src/agents]
    PL["planner"]:::agent
    AR["architect"]:::agent
    EX["executor"]:::agent
    RV["reviewer"]:::agent
    DB["debugger"]:::agent
    ME["memory"]:::agent
  end

  subgraph I[I/O surfaces]
    TOOLS["Tools (18)<br/>src/tools"]:::io
    MODELS["Model providers (6)<br/>src/models"]:::io
    PERM["Permissions<br/>src/permissions"]:::io
    SAND["Sandbox (fs + shell)<br/>src/sandbox"]:::io
    MCP["MCP bridge<br/>src/mcp"]:::io
  end

  subgraph P[Durable state]
    TASKS["tasks/*.json"]:::store
    SESS["sessions/*.jsonl"]:::store
    CONV["conversations/*.jsonl"]:::store
    IDX["SQLite index<br/>global/index.db"]:::store
    MEM["memory/{hot,warm,cold,learning}"]:::store
  end

  CLI --> ORCH
  REPL --> ORCH
  UI --> ORCH

  ORCH --> CLASS --> LOOP
  LOOP --> PL --> EX --> RV
  RV --> LOOP
  LOOP --> AR
  LOOP --> DB
  LOOP --> ME

  EX --> TOOLS
  TOOLS --> PERM
  TOOLS --> SAND
  TOOLS --> MCP
  PL --> MODELS
  EX --> MODELS

  LOOP --> TASKS
  LOOP --> SESS
  LOOP --> CONV
  LOOP --> IDX
  ME  --> MEM
```

Code it maps to:

| Layer | Path |
|---|---|
| CLI surface | `src/cli/` (24 commands) |
| REPL | `src/cli/repl.ts` + `src/cli/repl-input.ts` |
| UI | `src/ui/server.ts` + `src/ui/public/` |
| Orchestrator | `src/core/orchestrator.ts` |
| Agentic loop | `src/core/loop.ts` |
| Agents | `src/agents/{planner,architect,executor,reviewer,debugger,memory}.ts` |
| Tools | `src/tools/*.ts` |
| Providers | `src/models/{ollama,openai,anthropic,llamacpp,vllm,lmstudio}.ts` |
| Permissions | `src/permissions/` |
| Sandbox | `src/sandbox/` |

---

## 2. Agentic loop

The canonical pipeline every non-trivial task flows through.

```mermaid
flowchart LR
  classDef step fill:#0f172a,stroke:#38bdf8,color:#f1f5f9,rx:4,ry:4
  classDef gate fill:#1e1b4b,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4
  classDef term fill:#14532d,stroke:#10b981,color:#d1fae5,rx:4,ry:4
  classDef fail fill:#450a0a,stroke:#f87171,color:#fee2e2,rx:4,ry:4

  IN([user prompt]):::step --> CLASSIFY[classify]:::step
  CLASSIFY --> PLAN[plan]:::step
  PLAN --> VALID{valid plan?}:::gate
  VALID -->|no| FIX[auto-fix]:::step --> VALID
  VALID -->|yes| APPROVE{user approves?}:::gate
  APPROVE -->|edit| PLAN
  APPROVE -->|cancel| CANCEL([cancelled]):::fail
  APPROVE -->|yes| EXEC[execute DAG]:::step
  EXEC --> STEP[next step]:::step
  STEP --> TOOLS[iterative tool use]:::step
  TOOLS --> VGATE{validation gate?}:::gate
  VGATE -->|fail + budget left| TOOLS
  VGATE -->|fail + exhausted| RETRY{retries left?}:::gate
  VGATE -->|ok| DONE{more steps?}:::gate
  RETRY -->|yes| STEP
  RETRY -->|no| DIAG[diagnose]:::step --> FAIL([failed]):::fail
  DONE -->|yes| STEP
  DONE -->|no| VERIFY[reviewer]:::step
  VERIFY --> VSUM{approves?}:::gate
  VSUM -->|no| STEP
  VSUM -->|yes| COMP([completed]):::term
```

Source: `src/core/loop.ts:91` (entry: `runAgenticLoop`).

---

## 3. Task state machine

Forge unifies interactive sessions and background jobs under a single task model. Tasks transition through states in a DAG, with illegal moves throwing
`state_invalid`. Terminal states can only be re-entered via `forge resume`, which resets them to `draft` so the loop starts cleanly.

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> planned: planner output
  draft --> cancelled

  planned --> approved: user approves
  planned --> cancelled
  planned --> blocked

  approved --> scheduled
  approved --> cancelled

  scheduled --> running
  scheduled --> cancelled
  scheduled --> blocked

  running --> verifying
  running --> failed
  running --> blocked
  running --> cancelled

  verifying --> completed
  verifying --> failed
  verifying --> running: reviewer bounces

  completed --> draft: forge resume
  failed    --> draft: forge resume
  blocked   --> draft: forge resume
  blocked   --> cancelled
  cancelled --> draft: forge resume

  completed --> [*]
  failed    --> [*]
  cancelled --> [*]
```

Source: `src/persistence/tasks.ts#LEGAL_TRANSITIONS`. Illegal moves throw
`state_invalid`. Terminal states can only be re-entered via `forge resume`,
which resets them to `draft` so the loop starts cleanly.

---

## 4. Executor — iterative tool-use with validation gate

Each plan step runs a **bounded tool-use conversation**, not a single model
call. The model sees every tool result and can adapt within the same step.

```mermaid
sequenceDiagram
  participant L as loop.ts
  participant E as executor.ts
  participant M as model
  participant T as tool
  participant V as validator

  L->>E: runStep(step)
  loop up to maxExecutorTurns (mode-capped)
    E->>M: prompt + schema
    M-->>E: { actions, summary, done? }
    alt done && !anyFailed
      E-->>L: completed
    else has actions
      E->>T: execute each action
      T-->>E: stdout/stderr/exit/error
      E->>E: digest + push user turn
    end
  end
  opt step wrote files & mode enables gate
    loop up to maxValidationRetries
      E->>V: run typecheck / lint / tsc
      alt passes
        E-->>L: completed
      else fails
        E->>M: VALIDATION_FAILED: <output>
        M-->>E: corrective actions
        E->>T: execute
      end
    end
  end
  E-->>L: { toolResults, summary, filesChanged, completed }
```

| Mode | maxExecutorTurns | maxValidationRetries | allowMutations |
|------|------------------|----------------------|----------------|
| fast | 2 | 0 | yes |
| balanced | 4 | 1 | yes |
| heavy | 8 | 2 | yes |
| plan | 0 → 1 (clamp) | 0 | no |
| audit | 3 | 0 | no |
| debug | 6 | 2 | yes |
| architect | 3 | 1 | yes |
| offline-safe | 3 | 1 | yes |

Source: `src/core/mode-policy.ts`, `src/agents/executor.ts`,
`src/core/validation.ts`.

---

## 5. Memory layers

Four tiers with distinct retention, access cost, and eviction:

```mermaid
flowchart TB
  classDef hot  fill:#450a0a,stroke:#f87171,color:#fee2e2,rx:4,ry:4
  classDef warm fill:#451a03,stroke:#fb923c,color:#ffedd5,rx:4,ry:4
  classDef cold fill:#0c4a6e,stroke:#38bdf8,color:#e0f2fe,rx:4,ry:4
  classDef learn fill:#14532d,stroke:#10b981,color:#d1fae5,rx:4,ry:4

  H["Hot — current-session facts<br/>src/memory/hot.ts"]:::hot
  W["Warm — recent tasks (SQLite)<br/>src/memory/warm.ts"]:::warm
  C["Cold — project files, git, docs<br/>src/memory/cold.ts"]:::cold
  L["Learning — patterns + confidence<br/>src/memory/learning.ts"]:::learn

  Q[retrieve.ts query] --> H
  Q --> W
  Q --> C
  Q --> L
  H -.evict after session.-> W
  W -.age out after 90 days.-> DROP([drop])
  L -.decay if unreinforced.-> L
```

- **Hot** — in-process, per-task facts (current filesChanged, pending
  assertions). Cleared when the task completes.
- **Warm** — recent task metadata in SQLite (`global/index.db`). Feeds
  "what was I doing last week?" queries in the REPL and UI.
- **Cold** — lazy file/grep/AST index scoped to `projectRoot`. Populated
  on demand; no background indexer.
- **Learning** — patterns keyed by `intent:scope` with confidence evolving
  on success/failure. Planner reads the top-K before producing a plan
  (`src/agents/planner.ts#learnedPatternBlock`).

Retention defaults live in `GlobalConfig.memory` (`src/config/schema.ts`).

---

## 6. Model routing & provider registry

Forge abstracts providers behind a common interface. The router picks the best
provider for each request based on configured preferences, availability, and
model catalogue metadata (e.g. context window, supported features).

```mermaid
flowchart LR
  classDef local fill:#0c4a6e,stroke:#38bdf8,color:#e0f2fe,rx:4,ry:4
  classDef hosted fill:#3f1d5c,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4
  classDef route fill:#1e293b,stroke:#f1f5f9,color:#f1f5f9,rx:4,ry:4

  R[router.ts<br/>resolveModel]:::route
  CB[circuit-breaker.ts]:::route
  RL[rate-limit.ts]:::route
  CACHE[prompt cache<br/>cache.ts]:::route
  COST[cost ledger<br/>cost.ts]:::route
  AD[adapter.ts<br/>resolveLocalModel]:::route

  subgraph LOCAL[Local runtimes]
    OLL["ollama<br/>:11434"]:::local
    LMS["lmstudio<br/>:1234"]:::local
    VLL["vllm<br/>:8000"]:::local
    LCP["llamacpp<br/>:8080"]:::local
  end
  subgraph HOSTED[Hosted]
    ANT["anthropic"]:::hosted
    OAI["openai-compat<br/>api.openai.com / custom"]:::hosted
  end

  R --> AD
  AD --> OLL & LMS & VLL & LCP
  R --> ANT
  R --> OAI
  R --> CB
  R --> RL
  R --> CACHE
  R --> COST
```

**Local-model catalogue** (`src/models/local-catalog.ts`) classifies every
Llama / Qwen / DeepSeek / Gemma / Phi / Mistral / CodeLlama / Codestral /
StarCoder / Granite / Yi / Solar / Command-R / Aya / … id — 41 families
total — into `{class, roles, contextTokens}`.

**Adapter** (`src/models/adapter.ts`) auto-substitutes when the configured
model isn't installed on the user's provider. Picks best-fit from what's
actually there, caches per process, warns once.

---

## 7. Permission + sandbox model

Forge classifies every tool invocation by risk level and side effect, then applies a policy based on the current session flags and user preferences. The most
risky operations (e.g. shell commands with critical risk) are hard-blocked regardless of user preferences.

```mermaid
flowchart TB
  classDef ask fill:#1e1b4b,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4
  classDef allow fill:#14532d,stroke:#10b981,color:#d1fae5,rx:4,ry:4
  classDef deny  fill:#450a0a,stroke:#f87171,color:#fee2e2,rx:4,ry:4

  REQ[tool invocation] --> CLASSIFY[classify risk<br/>src/permissions/risk.ts]
  CLASSIFY --> CHECK{risk × sideEffect}
  CHECK -->|low + read| AUTOALLOW[auto-allow]:::allow
  CHECK -->|med + write| ASK[ask user]:::ask
  CHECK -->|high + execute| STRICT[ask + strict]:::ask
  CHECK -->|sandbox violation| BLOCK[hard-block]:::deny

  ASK --> FLAGS{session flags?}
  FLAGS -->|--allow-shell etc.| AUTOALLOW
  FLAGS -->|nonInteractive| DENY[deny silently]:::deny
  FLAGS -->|else| PROMPT[interactive prompt]
  PROMPT -->|allow| AUTOALLOW
  PROMPT -->|deny| DENY

  AUTOALLOW --> EXEC[execute]
  EXEC --> TRUST[trust calibration<br/>permission_grants]
  DENY --> ERR[permission_denied error]
```

- All paths resolved via **realpath** + confined to `projectRoot` plus
  explicitly whitelisted extra roots (`src/sandbox/fs.ts`).
- Always-forbidden targets: `/etc/passwd`, SSH keys, AWS credentials, etc.
- Shell commands classified (`classifyCommandRisk`) before execution;
  `critical` is hard-blocked.
- Grants persist in SQLite (`permission_grants` table) scoped per
  project + tool.

---

## 8. Conversation & persistence

Two concurrent writers — the REPL and the UI — can edit the same
conversation without corruption thanks to POSIX `O_APPEND` + a `mkdir`
fallback for lines >4 KB.

```mermaid
flowchart LR
  classDef w fill:#0c4a6e,stroke:#38bdf8,color:#e0f2fe,rx:4,ry:4
  classDef s fill:#18181b,stroke:#f59e0b,color:#fef3c7,rx:4,ry:4

  REPL[REPL process]:::w
  UI[UI process]:::w
  SUB[subagent]:::w

  JSONL[conversations/&lt;id&gt;.jsonl]:::s
  LOCK[.lock directory<br/>mkdir fallback]:::s
  WATCH[delta watcher<br/>byte-offset tail]:::s

  REPL -->|O_APPEND| JSONL
  UI -->|O_APPEND| JSONL
  SUB -->|O_APPEND| JSONL
  JSONL -.if line >4 KB.-> LOCK
  JSONL --> WATCH
  WATCH --> REPL
  WATCH --> UI
```

Source: `src/persistence/conversation-store.ts`, `src/core/conversation.ts`.
Event schema: `session-created`, `turn-user`, `turn-result`, `meta-updated`.

---

## 9. UI topology

Forge's dashboard is a single-page app served by a Node HTTP server. It uses WebSockets for real-time updates on tasks and conversations, and REST endpoints for actions like cancelling tasks or fetching details.

```mermaid
flowchart LR
  classDef b fill:#0f172a,stroke:#38bdf8,color:#f1f5f9,rx:4,ry:4
  classDef s fill:#082f49,stroke:#38bdf8,color:#e0f2fe,rx:4,ry:4
  classDef d fill:#18181b,stroke:#f59e0b,color:#fef3c7,rx:4,ry:4

  BROWSER[browser<br/>index.html + app.js]:::b
  SERVER["Node HTTP server<br/>src/ui/server.ts"]:::s
  WS1["/ws/tasks/:id"]:::s
  WS2["/ws/conversations/:id"]:::s
  API["REST /api/*"]:::s
  EVENTS[events.jsonl]:::d
  CONV[conversations/*.jsonl]:::d
  TASKS[tasks/*.json]:::d

  BROWSER <--> WS1
  BROWSER <--> WS2
  BROWSER <--> API
  WS1 --> EVENTS
  WS2 --> CONV
  API --> TASKS
```

- Ref-counted broadcasters so multiple tabs share a single file watcher.
- Conversation ids validated against `^(?:repl|chat|conv)-[a-z0-9_-]+$`
  for path-traversal safety.
- Healthcheck endpoint `/api/status` used by the Docker HEALTHCHECK.

---

## 10. CI/CD pipeline

Forge enforces code quality and release safety with a multi-stage pipeline on GitHub Actions. Every push runs the full suite; releases add gated steps for building, signing, and publishing artifacts.

```mermaid
flowchart LR
  classDef pass fill:#14532d,stroke:#10b981,color:#d1fae5,rx:4,ry:4
  classDef gate fill:#1e1b4b,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4
  classDef ship fill:#451a03,stroke:#fb923c,color:#ffedd5,rx:4,ry:4

  PR[PR / push] --> FMT["🎨 format"]:::pass
  PR --> LINT["🧹 lint"]:::pass
  PR --> TYPE["🧠 typecheck"]:::pass
  PR --> TEST["🧪 test matrix<br/>Ubuntu+macOS × Node 20+22"]:::pass
  TEST --> COV["📈 coverage"]:::pass
  TYPE --> BUILD["🏗️ build"]:::pass
  BUILD --> DOCKER["🐳 docker-build"]:::pass
  PR --> AUDIT["🔐 audit"]:::pass
  FMT & LINT & TYPE & TEST & BUILD & DOCKER & AUDIT & COV --> STATUS["📊 pipeline status<br/>GitHub summary"]:::gate

  TAG[git tag v*] --> GATE["🧪 pre-release gate"]:::gate
  GATE --> ART["📦 artifacts (5 targets)"]:::ship
  GATE --> DOCKP["🐳 docker publish<br/>ghcr.io · multi-arch"]:::ship
  ART --> MAN["📝 manifest + gh-release<br/>ed25519-signed"]:::ship
  MAN --> NPM["📤 npm publish --provenance"]:::ship
  GATE & ART & DOCKP & MAN & NPM --> RSUM["📊 release status"]:::gate
```

Source: `.github/workflows/{ci,release,nightly}.yml`.

---

## 11. Deployment topologies

Forge can be installed globally via npm, run as a container with volume mounts for state, or orchestrated with Docker Compose alongside Ollama for a fully containerized local setup.

```mermaid
flowchart LR
  classDef host fill:#0f172a,stroke:#38bdf8,color:#f1f5f9,rx:4,ry:4
  classDef vol fill:#18181b,stroke:#f59e0b,color:#fef3c7,rx:4,ry:4

  subgraph A[Host install  npm i -g]
    HCLI["forge CLI"]:::host
    HUI["forge ui"]:::host
    HFH["~/.forge"]:::vol
    HCLI --> HFH
    HUI --> HFH
  end

  subgraph B[Container  docker / podman]
    CIMG["forge/core:<ver>"]:::host
    DATA["-v forge-home:/data"]:::vol
    WORK["-v CWD:/workspace"]:::vol
    CIMG --> DATA
    CIMG --> WORK
  end

  subgraph C[Compose]
    CCORE["forge-core"]:::host
    CUI["forge-ui"]:::host
    COLL["ollama"]:::host
    CVOL["forge-home + ollama-models"]:::vol
    CCORE --> CVOL
    CUI --> CVOL
    COLL --> CVOL
  end
```

---

## 12. Runtime metrics at a glance

Measured with reproducible commands. No synthetic benchmarks.

| Target | Value | Reproducer |
|--------|-------|------------|
| `forge doctor` cold-start | **173 ms** | `time node bin/forge.js doctor --no-banner` |
| `forge --help` cold-start | **238 ms** | `time node bin/forge.js --help` |
| Provider probe timeout | **1.5 s** | `src/models/openai.ts#isAvailable` |
| UI `app.js` uncompressed | **89 KB** (zero CDN fetches) | `wc -c src/ui/public/app.js` |
| Full test suite | **~3.3 s** wall-clock | `npx vitest run` |
| Tests | **249 / 43 files** · 100% passing | — |
| Container image | **~355 MB** multi-arch non-root | `docker images ghcr.io/hoangsonw/forge-agentic-coding-cli` |

Executor turn budget per mode (hard runtime cap, from
`src/core/mode-policy.ts`):

```mermaid
xychart-beta
  title "Executor turns per mode"
  x-axis ["plan", "fast", "audit", "architect", "offline-safe", "balanced", "execute", "debug", "heavy"]
  y-axis "turns" 0 --> 8
  bar [1, 2, 3, 3, 3, 4, 4, 6, 8]
```

---

## 13. Directory map

```
src/
├── cli/            # commander CLI + 24 commands + REPL + input editor
├── core/           # orchestrator, agentic loop, mode-policy, validation
├── agents/         # 6 agents (planner/architect/executor/reviewer/debugger/memory)
├── classifier/     # heuristic + LLM task classification
├── models/         # 6 providers + router + adapter + catalog
├── prompts/        # layered assembler, deterministic hash
├── tools/          # 18 tools (read/write/edit/grep/glob/run/git/web/…)
├── sandbox/        # fs scope + command risk classifier
├── permissions/    # risk classifier + interactive manager + trust calibration
├── persistence/    # tasks, sessions, conversations, events, SQLite index
├── memory/         # 4-layer memory + retrieval
├── scheduler/      # DAG + resource manager (concurrency permits)
├── ui/             # HTTP + WS dashboard; public/ = app shell
├── mcp/            # Model Context Protocol bridge
├── daemon/         # optional background process
├── keychain/       # macOS/Linux/Windows credential storage
├── release/        # manifest signing + verification
├── security/       # prompt-injection guard, redaction
├── logging/        # structured logger + rotation
├── config/         # zod schema + XDG paths
└── types/          # shared contracts
```
