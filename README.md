<!-- Comprehensive README. Numbers sourced from docs/metrics.json; regenerate with `bash scripts/metrics.sh`. -->

<div align="center">

# Forge

**A local-first, multi-agent, programmable software-engineering runtime.**

*Not an assistant. A runtime.* Forge brings its own scheduler, sandbox,
permission system, state machine, agentic loop, memory layers, and
plugin ecosystem. You pick the model. You approve the actions. Everything
is inspectable, replayable, and yours.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js%2020+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![Bash](https://img.shields.io/badge/Bash-4EAA25?style=for-the-badge&logo=gnubash&logoColor=white)
![YAML](https://img.shields.io/badge/YAML-CB171E?style=for-the-badge&logo=yaml&logoColor=white)
![JSON](https://img.shields.io/badge/JSON-000000?style=for-the-badge&logo=json&logoColor=white)
![Markdown](https://img.shields.io/badge/Markdown-000000?style=for-the-badge&logo=markdown&logoColor=white)
![Mermaid](https://img.shields.io/badge/Mermaid-FF3670?style=for-the-badge&logo=mermaid&logoColor=white)
![SVG](https://img.shields.io/badge/SVG-FFB13B?style=for-the-badge&logo=svg&logoColor=black)
![npm](https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=for-the-badge&logo=eslint&logoColor=white)
![Prettier](https://img.shields.io/badge/Prettier-F7B93E?style=for-the-badge&logo=prettier&logoColor=black)
![ts-node](https://img.shields.io/badge/ts--node-3178C6?style=for-the-badge&logo=tsnode&logoColor=white)
![Commander](https://img.shields.io/badge/Commander.js-333?style=for-the-badge)
![Zod](https://img.shields.io/badge/Zod-3068B7?style=for-the-badge&logo=zod&logoColor=white)
![Chalk](https://img.shields.io/badge/Chalk-FF6B6B?style=for-the-badge)
![Ora](https://img.shields.io/badge/Ora-55ACEE?style=for-the-badge)
![Prompts](https://img.shields.io/badge/Prompts-9b59b6?style=for-the-badge)
![Undici](https://img.shields.io/badge/undici-1f6feb?style=for-the-badge)
![ws](https://img.shields.io/badge/ws-010101?style=for-the-badge&logo=socket.io&logoColor=white)
![dotenv](https://img.shields.io/badge/dotenv-ECD53F?style=for-the-badge&logo=dotenv&logoColor=black)
![semver](https://img.shields.io/badge/semver-CB3837?style=for-the-badge)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![better-sqlite3](https://img.shields.io/badge/better--sqlite3-044a64?style=for-the-badge)
![FTS5](https://img.shields.io/badge/SQLite%20FTS5-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![JSONL](https://img.shields.io/badge/JSONL-000?style=for-the-badge)
![WebSockets](https://img.shields.io/badge/WebSockets-010101?style=for-the-badge&logo=socket.io&logoColor=white)
![REST](https://img.shields.io/badge/REST-25A162?style=for-the-badge)
![HTTP](https://img.shields.io/badge/HTTP%2F2-005cc5?style=for-the-badge)
![POSIX](https://img.shields.io/badge/POSIX-3776AB?style=for-the-badge)
![XDG](https://img.shields.io/badge/XDG%20Base%20Dir-5E2BFF?style=for-the-badge)
![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-444?style=for-the-badge)
![OAuth2](https://img.shields.io/badge/OAuth%202.0%20%2B%20PKCE-0e8a16?style=for-the-badge&logo=auth0&logoColor=white)
![Ed25519](https://img.shields.io/badge/Ed25519-7C3AED?style=for-the-badge)
![SHA-256](https://img.shields.io/badge/SHA--256-444?style=for-the-badge)
![AES-GCM](https://img.shields.io/badge/AES--GCM-004E8C?style=for-the-badge)
![DPAPI](https://img.shields.io/badge/DPAPI-0078D4?style=for-the-badge&logo=windows&logoColor=white)
![libsecret](https://img.shields.io/badge/libsecret-4A90E2?style=for-the-badge)
![macOS Keychain](https://img.shields.io/badge/macOS%20Keychain-000?style=for-the-badge&logo=apple&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Compose](https://img.shields.io/badge/Docker%20Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Podman](https://img.shields.io/badge/Podman-892CA0?style=for-the-badge&logo=podman&logoColor=white)
![Buildx](https://img.shields.io/badge/Buildx-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![QEMU](https://img.shields.io/badge/QEMU-FF6600?style=for-the-badge&logo=qemu&logoColor=white)
![tini](https://img.shields.io/badge/tini-444?style=for-the-badge)
![OCI](https://img.shields.io/badge/OCI%20Image-262261?style=for-the-badge)
![ripgrep](https://img.shields.io/badge/ripgrep-333?style=for-the-badge)
![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)
![GHCR](https://img.shields.io/badge/GHCR-181717?style=for-the-badge&logo=github&logoColor=white)
![npm Provenance](https://img.shields.io/badge/npm%20Provenance-CB3837?style=for-the-badge&logo=npm&logoColor=white)
![Sigstore](https://img.shields.io/badge/Sigstore-2B3A67?style=for-the-badge)
![Dependabot](https://img.shields.io/badge/Dependabot-025E8C?style=for-the-badge&logo=dependabot&logoColor=white)
![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-FA6673?style=for-the-badge&logo=conventionalcommits&logoColor=white)
![SemVer](https://img.shields.io/badge/SemVer-3F4551?style=for-the-badge&logo=semver&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000000?style=for-the-badge&logo=ollama&logoColor=white)
![LM Studio](https://img.shields.io/badge/LM%20Studio-4A90E2?style=for-the-badge&logoColor=white)
![vLLM](https://img.shields.io/badge/vLLM-FA5C00?style=for-the-badge&logoColor=white)
![llama.cpp](https://img.shields.io/badge/llama.cpp-FFCE00?style=for-the-badge&logoColor=black)
![Anthropic](https://img.shields.io/badge/Anthropic-D4A27F?style=for-the-badge&logo=anthropic&logoColor=black)
![OpenAI](https://img.shields.io/badge/OpenAI--compat-412991?style=for-the-badge&logo=openai&logoColor=white)
![Azure OpenAI](https://img.shields.io/badge/Azure%20OpenAI-0078D4?style=for-the-badge&logo=microsoftazure&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-F55036?style=for-the-badge)
![Together AI](https://img.shields.io/badge/Together%20AI-0F6FFF?style=for-the-badge)
![LocalAI](https://img.shields.io/badge/LocalAI-2a9d8f?style=for-the-badge)
![Fireworks](https://img.shields.io/badge/Fireworks-6B2CE7?style=for-the-badge)
![Llama](https://img.shields.io/badge/Llama-0467DF?style=for-the-badge&logo=meta&logoColor=white)
![Qwen](https://img.shields.io/badge/Qwen-615CED?style=for-the-badge&logo=alibabacloud&logoColor=white)
![DeepSeek](https://img.shields.io/badge/DeepSeek-1E40AF?style=for-the-badge)
![Gemma](https://img.shields.io/badge/Gemma-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Phi](https://img.shields.io/badge/Phi-00A4EF?style=for-the-badge&logo=microsoft&logoColor=white)
![Mistral](https://img.shields.io/badge/Mistral-FF7000?style=for-the-badge&logo=mistralai&logoColor=white)
![Codestral](https://img.shields.io/badge/Codestral-FF7000?style=for-the-badge)
![CodeLlama](https://img.shields.io/badge/CodeLlama-0467DF?style=for-the-badge&logo=meta&logoColor=white)
![StarCoder](https://img.shields.io/badge/StarCoder-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black)
![Granite](https://img.shields.io/badge/Granite-054ADA?style=for-the-badge&logo=ibm&logoColor=white)
![Command R](https://img.shields.io/badge/Command%20R+-39594D?style=for-the-badge&logo=cohere&logoColor=white)
![macOS](https://img.shields.io/badge/macOS-000?style=for-the-badge&logo=apple&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)
![Windows](https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)
![WSL2](https://img.shields.io/badge/WSL2-0078D4?style=for-the-badge&logo=windows&logoColor=white)
![linux/amd64](https://img.shields.io/badge/linux%2Famd64-444?style=for-the-badge)
![linux/arm64](https://img.shields.io/badge/linux%2Farm64-444?style=for-the-badge)
![Git](https://img.shields.io/badge/Git-F05032?style=for-the-badge&logo=git&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)
![VS Code](https://img.shields.io/badge/VS%20Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)
![EditorConfig](https://img.shields.io/badge/EditorConfig-E0EFEF?style=for-the-badge&logo=editorconfig&logoColor=000)

**[Install](docs/INSTALL.md) · [Dev setup](docs/SETUP.md) · [Architecture](docs/ARCHITECTURE.md) · [AGENTS.md](AGENTS.md) · [CLAUDE.md](CLAUDE.md) · [Landing](index.html)**

</div>

---

## Table of contents

1. [At a glance](#at-a-glance)
2. [Why Forge](#why-forge)
3. [Quick start](#quick-start)
4. [The agentic loop (with diagrams)](#the-agentic-loop)
5. [Task state machine](#task-state-machine)
6. [Executor — iterative tool-use loop](#executor--iterative-tool-use-loop)
7. [Memory layers](#memory-layers)
8. [Provider routing & auto-adaptation](#provider-routing--auto-adaptation)
9. [Safety model](#safety-model-not-optional)
10. [Modes](#modes)
11. [CLI reference](#cli-reference)
12. [Filesystem layout](#filesystem-layout)
13. [Skills · Instructions · MCP](#skills--instructions--mcp)
14. [Run in a container](#run-in-a-container-docker-or-podman)
15. [CI/CD pipeline](#cicd-pipeline)
16. [Architecture map](#architecture-map)
17. [Development](#development)
18. [Why the numbers are real](#why-the-numbers-are-real)
19. [License](#license)

---

## At a glance

<div align="center">

| | count | source |
|---|---|---|
| 🔌 **Model providers** (auto-detected) | **6** | ollama, lmstudio, vllm, llama.cpp, openai-compat, anthropic |
| 🧠 **Model families** classified | **41** | Llama/Qwen/DeepSeek/Gemma/Phi/Mistral/Codestral/CodeLlama/Granite/… |
| 🤖 **Built-in agents** | **6** | planner · architect · executor · reviewer · debugger · memory |
| 🛠 **Tools** available to agents | **18** | read · write · edit · grep · glob · run_command · git · web · … |
| 💬 **CLI subcommands · slash commands** | **24 · 55** | `forge --help` · `/help` in REPL |
| 🎛 **Modes** | **9** | fast · balanced · heavy · plan · execute · audit · debug · architect · offline-safe |
| ✅ **Tests** | **203 / 38 files** · 100% passing | `npm test` |
| 🧬 **LoC** (`src/`) | **18,863** | `find src -name "*.ts" | xargs wc -l` |
| 🐳 **CI jobs · release stages** | **9 · 6** | [`.github/workflows/`](.github/workflows) |
| 📦 **Container image** | ~355 MB · multi-arch · non-root · HEALTHCHECK | `docker pull ghcr.io/forge/forge:latest` |

</div>

> Every number regenerated from source via `bash scripts/metrics.sh` and
> pinned in [`docs/metrics.json`](docs/metrics.json). **No marketing
> numbers live in docs — if you can't `grep` it, it's not in here.**

---

## Why Forge

Most "AI coding tools" are thin chat wrappers over a cloud API. Forge is
**engineering infrastructure** with first-class:

```mermaid
mindmap
  root((Forge))
    Local-first
      Auto-detect Ollama / LM Studio / vLLM / llama.cpp
      Model-family auto-adapt
      Offline-safe mode
    Agentic
      6 role-typed agents
      Iterative tool-use executor
      Validation gate (typecheck/lint)
      Bounded retries + diagnose
    Controllable
      Default-deny permissions
      Path-realpath-confined sandbox
      Risk-classified shell
      OS-keychain credentials
    Inspectable
      Tasks JSON · Sessions JSONL · Events JSONL
      Prompt-hashed, replayable
      Concurrent-writer-safe
    Extensible
      Markdown skills
      MCP connectors
      Pluggable agents + tools
    Performant
      REPL cold-start 238 ms
      UI shell 89 KB · zero CDN
      Providers probe in 1.5 s
```

- **Local-first.** Forge auto-detects Ollama, LM Studio, vLLM, and
  llama.cpp on their default ports. Cloud (Anthropic / OpenAI / LocalAI /
  Together / Groq / Azure) is opt-in, not required.
- **Agentic but controllable.** Every action is classified (risk ×
  side-effect × sensitivity), gated by a permission system, and logged
  with a reproducible prompt hash.
- **Inspectable.** Sessions JSONL, tasks JSON, events JSONL. Two processes
  can edit the same conversation concurrently (POSIX `O_APPEND` +
  `mkdir` lockfile).
- **Mode-driven.** 9 explicit modes — each carries **enforceable**
  budgets (max executor turns, max validation retries, allowMutations,
  maxAutoRisk).
- **Extensible.** Drop a Markdown file in `~/.forge/skills/`. Add an
  `Agent`. Wire an MCP connector. No rebuild required.

---

## Quick start

```bash
# Option 1 — npm (global):
npm install -g @forge/cli
forge doctor             # green checks + role→model mapping
forge run "explain this repo"

# Option 2 — Docker:
docker run --rm -it \
  -v forge-home:/data -v "$PWD:/workspace" \
  ghcr.io/forge/forge:latest forge run "explain this repo"

# Option 3 — full stack (forge + ollama + dashboard):
docker compose -f docker/docker-compose.yml up -d
# open http://127.0.0.1:7823
```

**Requirements:** Node ≥ 20 *and/or* Docker ≥ 25. At least one LLM source
(local runtime or API key). See [`docs/INSTALL.md`](docs/INSTALL.md) for
per-OS notes.

---

## The agentic loop

Every non-trivial task flows through the same pipeline. Nothing escapes
it — no hidden shortcut, no "just this once" bypass.

```mermaid
flowchart LR
  classDef step fill:#0f172a,stroke:#38bdf8,color:#f1f5f9,rx:4,ry:4
  classDef gate fill:#1e1b4b,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4
  classDef term fill:#14532d,stroke:#10b981,color:#d1fae5,rx:4,ry:4
  classDef fail fill:#450a0a,stroke:#f87171,color:#fee2e2,rx:4,ry:4

  IN([user prompt]):::step --> CLASSIFY[classify]:::step
  CLASSIFY --> PLAN[plan · DAG]:::step
  PLAN --> VALID{valid plan?}:::gate
  VALID -->|no| FIX[auto-fix]:::step --> VALID
  VALID -->|yes| APPROVE{user approves?}:::gate
  APPROVE -->|edit| PLAN
  APPROVE -->|cancel| CANCEL([cancelled]):::fail
  APPROVE -->|yes| EXEC[execute]:::step
  EXEC --> STEP[next step]:::step
  STEP --> TOOLS[iterative tool use]:::step
  TOOLS --> VGATE{validation gate?}:::gate
  VGATE -->|fail + budget| TOOLS
  VGATE -->|fail + exhausted| RETRY{retries?}:::gate
  VGATE -->|ok| DONE{more steps?}:::gate
  RETRY -->|yes| STEP
  RETRY -->|no| DIAG[diagnose]:::step --> FAIL([failed]):::fail
  DONE -->|yes| STEP
  DONE -->|no| VERIFY[reviewer]:::step
  VERIFY --> VSUM{approves?}:::gate
  VSUM -->|no| STEP
  VSUM -->|yes| COMP([completed]):::term
```

Source: [`src/core/loop.ts`](src/core/loop.ts). Retry cap is 3, then the
debugger agent diagnoses before the task is marked `failed`.

### A concrete run

```
forge run "fix the failing login test" --mode heavy
  → classified:   bugfix · complexity=moderate · risk=low
  → plan:         4 steps  (analyze → locate → patch → run_tests)
  → approve?      [y/n/edit]
  → executor:     turn 1 — read_file src/auth/login.ts
                  turn 2 — grep "issuedAt" in src
                  turn 3 — apply_patch src/auth/login.ts
                  turn 4 — run_command "npm test -- auth.login"
  → validate:     typecheck ✓   lint ✓
  → reviewer:     approved
  → ✔ Done. Files changed: src/auth/login.ts
```

---

## Task state machine

Every task lives in exactly one of **10 statuses**. Transitions are
enforced by `LEGAL_TRANSITIONS` — illegal moves throw `state_invalid`
with the legal-next list in `recoveryHint`.

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

Source: [`src/persistence/tasks.ts#LEGAL_TRANSITIONS`](src/persistence/tasks.ts).

---

## Executor — iterative tool-use loop

Each plan step runs a **bounded model↔tool conversation**, not a one-shot
call. The model sees every tool result and can adapt within the same
step — retry with different args, switch tools, or signal done.

```mermaid
sequenceDiagram
  autonumber
  participant L as loop.ts
  participant E as executor.ts
  participant M as model
  participant T as tool
  participant V as validator

  L->>E: runStep(step)
  loop up to maxExecutorTurns (mode-capped)
    E->>M: prompt + schema (JSON-mode)
    M-->>E: { actions[], summary, done? }
    alt done && no failures
      E-->>L: completed
    else has actions
      E->>T: execute each action
      T-->>E: stdout / stderr / exitCode / error
      E->>E: digest + append user turn
    end
  end
  opt step wrote files & mode enables gate
    loop up to maxValidationRetries
      E->>V: typecheck / lint / tsc
      alt passes
        E-->>L: completed
      else fails
        E->>M: VALIDATION_FAILED · <output>
        M-->>E: corrective actions
        E->>T: execute
      end
    end
  end
  E-->>L: { toolResults, summary, filesChanged, completed }
```

Mode caps — read directly from [`src/core/mode-policy.ts`](src/core/mode-policy.ts):

| Mode | maxExecutorTurns | maxValidationRetries | allowMutations | maxAutoRisk |
|------|:---:|:---:|:---:|:---:|
| fast | 2 | 0 | ✅ | low |
| balanced | 4 | 1 | ✅ | medium |
| heavy | 8 | 2 | ✅ | high |
| plan | 0→1 | 0 | ❌ | low |
| execute | 4 | 1 | ✅ | medium |
| audit | 3 | 0 | ❌ | low |
| debug | 6 | 2 | ✅ | medium |
| architect | 3 | 1 | ✅ | medium |
| offline-safe | 3 | 1 | ✅ | medium |

---

## Memory layers

Four tiers with distinct retention and access cost:

```mermaid
flowchart TB
  classDef hot  fill:#450a0a,stroke:#f87171,color:#fee2e2,rx:4,ry:4
  classDef warm fill:#451a03,stroke:#fb923c,color:#ffedd5,rx:4,ry:4
  classDef cold fill:#0c4a6e,stroke:#38bdf8,color:#e0f2fe,rx:4,ry:4
  classDef learn fill:#14532d,stroke:#10b981,color:#d1fae5,rx:4,ry:4

  Q[retrieve.ts · query] --> H["Hot<br/>current-session facts<br/>src/memory/hot.ts"]:::hot
  Q --> W["Warm<br/>recent tasks · SQLite<br/>src/memory/warm.ts"]:::warm
  Q --> C["Cold<br/>project files · grep · AST<br/>src/memory/cold.ts"]:::cold
  Q --> L["Learning<br/>patterns + confidence<br/>src/memory/learning.ts"]:::learn

  H -.clear on task end.-> X([evict])
  W -.age out after N days.-> X
  L -.decay if unreinforced.-> L
```

- **Hot** — in-process per-task facts, cleared at task end.
- **Warm** — SQLite index of recent task metadata; powers "what was I
  doing yesterday" queries.
- **Cold** — lazy file/grep/AST index scoped to `projectRoot`. No
  background indexer; populated on demand.
- **Learning** — patterns keyed by `intent:scope` with confidence that
  evolves on success/failure. **The planner reads the top-K patterns
  before producing every plan** (see `src/agents/planner.ts#learnedPatternBlock`).

---

## Provider routing & auto-adaptation

```mermaid
flowchart LR
  classDef local fill:#0c4a6e,stroke:#38bdf8,color:#e0f2fe,rx:4,ry:4
  classDef hosted fill:#3f1d5c,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4
  classDef route fill:#1e293b,stroke:#f1f5f9,color:#f1f5f9,rx:4,ry:4

  ROUTER[router.ts · resolveModel]:::route
  ADAPT[adapter.ts · resolveLocalModel]:::route
  CB[circuit-breaker]:::route
  RL[rate-limit]:::route
  CACHE[prompt cache]:::route
  COST[USD cost ledger]:::route

  subgraph LOCAL[Local runtimes · auto-detected]
    OLL["ollama<br/>:11434"]:::local
    LMS["lmstudio<br/>:1234"]:::local
    VLL["vllm<br/>:8000"]:::local
    LCP["llamacpp<br/>:8080"]:::local
  end
  subgraph HOSTED[Hosted · opt-in]
    ANT["anthropic"]:::hosted
    OAI["openai-compat<br/>(OpenAI / Azure / LocalAI / Together / Groq / Fireworks)"]:::hosted
  end

  ROUTER --> ADAPT --> OLL & LMS & VLL & LCP
  ROUTER --> ANT & OAI
  ROUTER --> CB & RL & CACHE & COST
```

### Auto-adaptation

If your configured model isn't pulled on the provider, Forge **picks the
best-fit installed model for each role** via
[`src/models/local-catalog.ts`](src/models/local-catalog.ts) +
[`src/models/adapter.ts`](src/models/adapter.ts). Cached per process,
warns once, never refuses to route.

### Supported runtimes

| Runtime | Default endpoint | Override |
|---------|------------------|----------|
| Ollama | `http://127.0.0.1:11434` | `OLLAMA_ENDPOINT` |
| LM Studio | `http://127.0.0.1:1234/v1` | `LMSTUDIO_ENDPOINT` |
| vLLM | `http://127.0.0.1:8000/v1` | `VLLM_ENDPOINT` |
| llama.cpp server | `http://127.0.0.1:8080/v1` | `LLAMACPP_ENDPOINT` |
| OpenAI-compatible | env-configured | `OPENAI_BASE_URL` + `OPENAI_API_KEY` |
| Anthropic | hosted | `ANTHROPIC_API_KEY` |

### Model family classification (41 families)

| Role | Families preferred |
|------|--------------------|
| architect / reviewer / debugger | Llama 3.x / 4.x, Mixtral, Command-R+, DeepSeek V3/R1, Mistral-Large |
| planner | Qwen 2.5/3, Llama 3.x, DeepSeek V3, Gemma 3, Mistral-Nemo, Command-R, Phi 4 |
| executor (code specialists) | DeepSeek-Coder, Qwen 2.5-Coder, CodeLlama, Codestral, StarCoder, Granite-Code, WizardCoder |
| fast | Phi 3/4, Gemma 2, TinyLlama, SmolLM, MiniCPM |

Unknown models are accepted too — Forge rates them as generic executors
rather than refusing to route.

---

## Safety model (not optional)

Forge treats safety as load-bearing. These invariants are enforced in
code, not convention:

```mermaid
flowchart TB
  classDef ask fill:#1e1b4b,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4
  classDef allow fill:#14532d,stroke:#10b981,color:#d1fae5,rx:4,ry:4
  classDef deny  fill:#450a0a,stroke:#f87171,color:#fee2e2,rx:4,ry:4

  REQ[tool invocation] --> CLASSIFY[classify risk × sideEffect × sensitivity]
  CLASSIFY --> SANDBOX{path in sandbox? / cmd allow-listed?}
  SANDBOX -->|no| BLOCK[hard-block · sandbox_violation]:::deny
  SANDBOX -->|yes| GATE{risk × sideEffect}
  GATE -->|low · read| AUTO[auto-allow]:::allow
  GATE -->|med · write| ASK[ask user]:::ask
  GATE -->|high · execute / network| STRICT[ask even with --skip-permissions]:::ask
  ASK --> FLAGS{session flags?}
  FLAGS -->|--allow-shell / --allow-files etc.| AUTO
  FLAGS -->|--non-interactive| DENY[deny silently]:::deny
  FLAGS -->|else| PROMPT[interactive prompt]
  PROMPT -->|allow| AUTO
  PROMPT -->|deny| DENY
  AUTO --> EXEC[execute] --> TRUST[trust calibration<br/>auto-allow after N confirmations<br/>src/permissions/manager.ts]
```

| Invariant | Where |
|---|---|
| Instruction precedence: `System Safety > Page Rules > Mode Rules > Approved Plan > Project Defaults > User Preferences` | `src/prompts/assembler.ts` |
| Permission model = default deny | `src/permissions/manager.ts` |
| `--skip-permissions` skips *routine* prompts only; critical/destructive still ask | `src/permissions/risk.ts` |
| Retry cap = 3, then debugger escalates | `src/core/loop.ts` |
| Hard limits: `maxSteps=50` · `maxToolCalls=100` · `maxRuntimeSeconds=600` | `src/config/schema.ts` |
| Untrusted content (web / MCP / retrieved) fenced as data, never instructions | `src/security/injection.ts` |
| Secrets redacted before every log, session entry, and prompt | `src/security/redact.ts` |
| Scoped filesystem sandbox; symlink-escape-proof via realpath | `src/sandbox/fs.ts` |
| Destructive shell commands blocked (`rm -rf /`, `sudo`, fork bombs, curl-to-shell) | `src/sandbox/shell.ts` |
| Credentials in OS keychain (macOS / libsecret / DPAPI) + AES-GCM fallback | `src/keychain/` |
| Release artefacts: SHA-256 + Ed25519 signature verification | `src/release/` |

---

## Modes

```mermaid
flowchart LR
  classDef ro fill:#1e293b,stroke:#64748b,color:#cbd5e1,rx:4,ry:4
  classDef rw fill:#0c4a6e,stroke:#38bdf8,color:#e0f2fe,rx:4,ry:4
  classDef big fill:#3f1d5c,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4

  FAST[fast · 2 turns]:::rw
  BAL[balanced · 4 turns · default]:::rw
  HEAVY[heavy · 8 turns · 2 validate retries]:::big
  PLAN[plan · 0 turns · no mutations]:::ro
  EXEC[execute · 4 turns]:::rw
  AUDIT[audit · 3 turns · no mutations]:::ro
  DEBUG[debug · 6 turns · 2 validate retries]:::rw
  ARCH[architect · 3 turns]:::big
  OFFLINE[offline-safe · 3 turns · never hosted]:::rw
```

Each mode is an **enforceable budget** — not a hint to the model. See
[`src/core/mode-policy.ts`](src/core/mode-policy.ts).

---

## CLI reference

24 subcommands. Full surface:

```
forge                          # REPL (default)
forge init                     # create ~/.forge + project .forge
forge run "<prompt>"           # full agentic loop
forge plan "<prompt>"          # plan-only
forge execute "<prompt>"       # auto-approve + execute
forge resume [taskId]          # resume any prior task (any status)
forge status                   # runtime state
forge doctor                   # health check + role→model mapping
forge task list|search         # task history (SQLite-indexed)
forge session list|replay <id> # session JSONL inspection
forge model list               # probe all providers
forge config get|set|path      # configuration
forge mcp list|add|remove      # MCP connections
forge skills list|new          # skill management
forge agents list              # custom agents
forge permissions reset|list   # permission grants
forge daemon start|stop|status # optional background process
forge memory {hot|warm|cold}   # memory inspection
forge cost                     # USD spend ledger
forge ui start                 # local dashboard at :7823
forge bundle {pack|unpack}     # offline bundles
forge container up|down        # compose wrapper
forge update [--check|--force] # self-update
forge migrate                  # DB migrations
forge changelog                # local changelog view
forge dev                      # dev helpers
forge web {search|fetch}       # web tools
forge spec {new|show|diff}     # spec-driven development
```

### Common flags (`run` / `plan` / `execute`)

```
--mode <m>             fast|balanced|heavy|plan|execute|audit|debug|architect|offline-safe
--yes                  auto-approve plan
--skip-permissions     skip routine prompts (high-risk still asked)
--allow-files          pre-approve file writes for this session
--allow-shell          pre-approve shell for this session
--allow-network        pre-approve network tools
--allow-web            pre-approve web search/fetch/browse
--allow-mcp            pre-approve MCP tool calls
--strict               confirm every action
--non-interactive      deny all prompts silently (CI mode)
--deterministic        fixed temperatures for reproducibility
--trace                full trace (implies --debug)
--no-banner            omit startup banner
```

---

## Filesystem layout

```mermaid
flowchart TB
  classDef g fill:#18181b,stroke:#f59e0b,color:#fef3c7,rx:4,ry:4
  classDef p fill:#0c4a6e,stroke:#38bdf8,color:#e0f2fe,rx:4,ry:4

  subgraph GLOBAL["~/.forge  (global)"]
    G1["config.json"]:::g
    G2["instructions.md"]:::g
    G3["skills/*.md"]:::g
    G4["agents/*.md"]:::g
    G5["mcp/*"]:::g
    G6["models/"]:::g
    G7["logs/forge.log"]:::g
    G8["global/index.db  ← SQLite"]:::g
    G9["projects/&lt;hash&gt;/tasks · sessions · events"]:::g
  end

  subgraph PROJECT["./.forge  (per-project)"]
    P1["config.json"]:::p
    P2["instructions.md"]:::p
    P3["skills/  (override global)"]:::p
    P4["agents/"]:::p
    P5["mcp/"]:::p
  end
```

Paths resolved via [`src/config/xdg.ts`](src/config/xdg.ts) — respects
`XDG_*` env vars on Linux.

---

## Skills · Instructions · MCP

### Skills — a Markdown file with YAML frontmatter

```markdown
---
name: conventional-commit
description: Enforce Conventional Commits in every commit message.
triggers: [commit, git]
---
When writing commit messages, use Conventional Commits:
  feat(scope): …
  fix(scope): …
  refactor(scope): …
```

Drop into `~/.forge/skills/` (global) or `./.forge/skills/` (project).
Project skills override global.

### Instructions

Both `~/.forge/instructions.md` and `./.forge/instructions.md` are
layered into every prompt via [`src/prompts/assembler.ts`](src/prompts/assembler.ts).
Precedence is: **System Safety > Page > Mode > Plan > Project > User**.

### MCP connections

```bash
forge mcp list
forge mcp add <name> --transport stdio --command "…"
forge mcp add <name> --transport http --url https://… --auth oauth2-pkce
forge mcp status
```

Both `stdio` and HTTP-stream transports supported. OAuth 2.0 + PKCE or
API key auth. Tokens stored in the OS keychain.

---

## Run in a container (Docker or Podman)

Single hardened image (non-root, HEALTHCHECK, OCI labels, ~355 MB) that
serves both CLI and UI.

```bash
# Pull (multi-arch: linux/amd64 + linux/arm64):
docker pull ghcr.io/forge/forge:latest

# One-shot CLI:
docker run --rm -it -v forge-home:/data -v "$PWD:/workspace" \
  ghcr.io/forge/forge:latest forge run "explain this repo"

# Dashboard:
docker run --rm -p 7823:7823 -v forge-home:/data \
  ghcr.io/forge/forge:latest forge ui start --bind 0.0.0.0

# Full stack (forge + ollama + UI):
docker compose -f docker/docker-compose.yml up -d
# or: podman-compose -f docker/docker-compose.yml up -d
```

Stack topology:

```mermaid
flowchart LR
  classDef c fill:#0c4a6e,stroke:#38bdf8,color:#e0f2fe,rx:4,ry:4
  classDef v fill:#18181b,stroke:#f59e0b,color:#fef3c7,rx:4,ry:4

  OLLAMA["ollama<br/>:11434 · healthcheck"]:::c
  UI["forge-ui<br/>:7823 · healthcheck · restart unless-stopped"]:::c
  CORE["forge-core<br/>(on-demand via compose run)"]:::c
  FH[forge-home · named volume]:::v
  OM[ollama-models · named volume]:::v

  OLLAMA --> OM
  UI --> FH
  CORE --> FH
  UI --> OLLAMA
  CORE --> OLLAMA
```

Full install guide: [`docs/INSTALL.md`](docs/INSTALL.md).

---

## CI/CD pipeline

### CI (every PR + push)

```mermaid
flowchart LR
  classDef pass fill:#14532d,stroke:#10b981,color:#d1fae5,rx:4,ry:4
  classDef gate fill:#1e1b4b,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4

  PR[PR / push] --> FMT["🎨 format"]:::pass
  PR --> LINT["🧹 lint"]:::pass
  PR --> TYPE["🧠 typecheck"]:::pass
  PR --> TEST["🧪 test matrix<br/>Ubuntu + macOS × Node 20 + 22"]:::pass
  TEST --> COV["📈 coverage"]:::pass
  TYPE --> BUILD["🏗️ build"]:::pass
  BUILD --> DOCKER["🐳 docker-build"]:::pass
  PR --> AUDIT["🔐 audit"]:::pass
  FMT & LINT & TYPE & TEST & BUILD & DOCKER & AUDIT & COV --> STATUS["📊 pipeline status<br/>GH step summary · fails if any required job failed"]:::gate
```

### Release (on `v*` tag)

```mermaid
flowchart LR
  classDef gate fill:#1e1b4b,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4
  classDef ship fill:#451a03,stroke:#fb923c,color:#ffedd5,rx:4,ry:4

  TAG[git tag v*] --> GATE["🧪 pre-release gate<br/>build + full test suite"]:::gate
  GATE --> ART["📦 artifacts<br/>5 tarball targets"]:::ship
  GATE --> DOCKP["🐳 docker publish<br/>multi-arch → ghcr.io"]:::ship
  ART --> MAN["📝 manifest + gh-release<br/>ed25519-signed"]:::ship
  MAN --> NPM["📤 npm publish<br/>--provenance --access public"]:::ship
  GATE & ART & DOCKP & MAN & NPM --> RSUM["📊 release status"]:::gate
```

Workflows: [`.github/workflows/ci.yml`](.github/workflows/ci.yml),
[`.github/workflows/release.yml`](.github/workflows/release.yml),
[`.github/workflows/nightly.yml`](.github/workflows/nightly.yml).

---

## Architecture map

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

  ORCH["Orchestrator · src/core/orchestrator.ts"]:::core
  LOOP["Agentic loop · src/core/loop.ts"]:::core
  CLS["Classifier"]:::core

  subgraph A[Agents · src/agents]
    PL[planner]:::agent
    AR[architect]:::agent
    EX[executor]:::agent
    RV[reviewer]:::agent
    DB[debugger]:::agent
    ME[memory]:::agent
  end

  subgraph I[I/O surfaces]
    TOOLS["18 tools · src/tools"]:::io
    MODELS["6 providers · src/models"]:::io
    PERM["Permissions"]:::io
    SAND["Sandbox (fs + shell)"]:::io
    MCP["MCP bridge"]:::io
  end

  subgraph P[Durable state]
    TASKS[tasks/*.json]:::store
    SESS[sessions/*.jsonl]:::store
    CONV[conversations/*.jsonl]:::store
    IDX[SQLite index]:::store
    MEM["memory/{hot,warm,cold,learning}"]:::store
  end

  CLI --> ORCH
  REPL --> ORCH
  UI --> ORCH
  ORCH --> CLS --> LOOP
  LOOP --> PL --> EX --> RV
  RV --> LOOP
  LOOP --> AR & DB & ME
  EX --> TOOLS
  TOOLS --> PERM & SAND & MCP
  PL --> MODELS
  EX --> MODELS
  LOOP --> TASKS & SESS & CONV & IDX
  ME --> MEM
```

Full map with every subsystem explained: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Subsystem size

```mermaid
xychart-beta
  title "Lines of code per subsystem (18,863 total)"
  x-axis ["cli", "core", "ui", "tools", "models", "agents", "persistence", "memory", "mcp", "types", "web"]
  y-axis "LoC" 0 --> 6000
  bar [5212, 1661, 1603, 1601, 1509, 1053, 1018, 754, 520, 516, 512]
```

---

## Development

```bash
git clone https://github.com/forge/forge && cd forge
npm install
npm run build             # tsc + copy-assets
npm test                  # 203 tests across 38 files; all must pass
./bin/forge.js doctor
```

| Task | Command |
|------|---------|
| Build | `npm run build` |
| Watch | `npm run build:watch` |
| Tests | `npm test` |
| One test file | `npx vitest run test/unit/<file>.test.ts` |
| Coverage | `npm run test:coverage` |
| Typecheck | `npm run typecheck` |
| Lint / format | `npm run lint` · `npm run format` · `npm run format:check` |
| Metrics | `bash scripts/metrics.sh` |
| Docker | `docker build -f docker/Dockerfile -t forge/core:dev .` |
| REPL | `./bin/forge.js` |
| Dashboard | `./bin/forge.js ui start` |

Full guide: [`docs/SETUP.md`](docs/SETUP.md).

### Measured performance (reproduce with the commands shown)

| Target | Measured | How |
|--------|----------|-----|
| `forge --help` cold-start | **238 ms** | `time node bin/forge.js --help` |
| `forge doctor` cold-start | **173 ms** | `time node bin/forge.js doctor --no-banner` |
| UI `app.js` uncompressed | **89 KB** | `wc -c src/ui/public/app.js` |
| Landing `index.html` | **25 KB**, self-contained, zero CDN | `wc -c index.html` |
| Full test suite | **~3.3 s** wall-clock | `npx vitest run` |
| Container image | **~355 MB** multi-arch non-root | `docker images` |

---

## Why the numbers are real

Every number in this README comes from either:

1. A file at `src/` (grep to verify), or
2. [`docs/metrics.json`](docs/metrics.json), regenerated by [`scripts/metrics.sh`](scripts/metrics.sh).

No fabricated benchmarks. No "3x faster than X". If you find a claim you
can't trace, file an issue — that's a documentation bug.

---

## Agent-facing context

If you're a code-writing agent (Claude Code, Codex, Cursor, Aider, Cline,
Continue, …) working in this repo, start here:

- [`CLAUDE.md`](CLAUDE.md) — Claude Code / Claude-family context
- [`AGENTS.md`](AGENTS.md) — OpenAI `AGENTS.md` convention (used by Codex and most others)

Both files carry: canonical commands, hot paths, conventions, performance
posture, security posture, and pre-completion checklist.

---

## License

MIT. See [`LICENSE`](LICENSE).
