# Forge — Installation

> End-user install guide. If you want to hack on Forge itself, see
> [SETUP.md](SETUP.md).

## Table of contents

- [1. Choose your install path](#1-choose-your-install-path)
- [2. npm (global)](#2-npm-global)
- [3. Docker](#3-docker)
- [4. Podman](#4-podman)
- [5. Compose (Forge + Ollama + UI)](#5-compose-forge--ollama--ui)
- [6. Platform-specific notes](#6-platform-specific-notes)
- [7. Model runtimes you can point Forge at](#7-model-runtimes-you-can-point-forge-at)
- [8. First-run checklist](#8-first-run-checklist)
- [9. Uninstall](#9-uninstall)
- [10. Troubleshooting](#10-troubleshooting)

---

## 1. Choose your install path

```mermaid
flowchart TD
  classDef q fill:#1e1b4b,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4
  classDef r fill:#14532d,stroke:#10b981,color:#d1fae5,rx:4,ry:4

  START([What's your setup?]):::q
  START --> Q1{Prefer isolation?}:::q
  Q1 -->|yes| Q2{Docker or Podman installed?}:::q
  Q2 -->|yes| COMPOSE["§5 · compose stack<br/>forge + ollama + UI"]:::r
  Q2 -->|no| NPM1["§2 · npm -g @forge/cli"]:::r
  Q1 -->|no| Q3{Node 20+ on path?}:::q
  Q3 -->|yes| NPM2["§2 · npm -g @forge/cli"]:::r
  Q3 -->|no| DOCK["§3 · one-shot docker run"]:::r
```

| Path | Best for | Keeps host clean? |
|------|----------|-------------------|
| npm -g | you already have Node + your own LLM | ⚠️ installs to your npm prefix |
| docker run | quick try, no Node needed | ✅ |
| compose | want Ollama + UI + Forge in one stack | ✅ |
| podman-compose | rootless container setup | ✅ |

---

## 2. npm (global)

```bash
npm install -g @forge/cli
forge doctor       # verify
forge init         # create ~/.forge
forge run "explain this repo"
```

Requirements: **Node 20+**. macOS, Linux, Windows (via WSL or native —
see §6).

### What happens on first run

```mermaid
sequenceDiagram
  autonumber
  participant U as you
  participant F as forge
  participant FS as ~/.forge
  participant P as providers
  U->>F: forge doctor
  F->>FS: ensure ~/.forge exists · init SQLite
  F->>P: probe ollama · lmstudio · vllm · llamacpp · (hosted if keys set)
  P-->>F: up / down per runtime
  F->>F: for each role — pick best-fit installed model
  F-->>U: green checks + role→model mapping (or exact "start X" guidance)
  U->>F: forge run "<task>"
  F->>F: classify → plan → approve → execute → verify → learn
  F-->>U: summary + files changed + cost ledger
```

Upgrade:

```bash
npm update -g @forge/cli
```

Local install from a checkout (for PR testing):

```bash
git clone https://github.com/forge/forge && cd forge
npm install
npm run build
npm link              # adds `forge` to PATH
```

---

## 3. Docker

### Image anatomy

```mermaid
flowchart LR
  classDef s1 fill:#1e293b,stroke:#64748b,color:#f1f5f9,rx:4,ry:4
  classDef s2 fill:#082f49,stroke:#38bdf8,color:#e0f2fe,rx:4,ry:4
  classDef layer fill:#18181b,stroke:#f59e0b,color:#fef3c7,rx:4,ry:4

  subgraph BUILD["Stage 1 · builder"]
    B1[node:20-bookworm-slim]:::s1
    B2[npm ci + tsc + copy-assets]:::s1
    B3[npm prune --omit=dev]:::s1
    B1 --> B2 --> B3
  end
  subgraph RUNTIME["Stage 2 · runtime (~355 MB)"]
    R1[node:20-bookworm-slim]:::s2
    R2[apt: git · ripgrep · tini · ca-certs]:::layer
    R3[non-root user forge · uid 10001]:::layer
    R4[dist + node_modules pruned]:::layer
    R5[HEALTHCHECK · forge doctor]:::layer
    R6[OCI labels · version · commit · build-date]:::layer
    R1 --> R2 --> R3 --> R4 --> R5 --> R6
  end
  BUILD -.prod deps + dist.-> RUNTIME
```

Pull:

```bash
docker pull ghcr.io/forge/forge:latest
```

One-shot invocation (your CWD → `/workspace`):

```bash
docker run --rm -it \
  -v forge-home:/data \
  -v "$PWD:/workspace" \
  ghcr.io/forge/forge:latest \
  forge run "explain this repo"
```

Dashboard:

```bash
docker run --rm -p 7823:7823 \
  -v forge-home:/data \
  ghcr.io/forge/forge:latest \
  forge ui start --bind 0.0.0.0
# open http://127.0.0.1:7823
```

Image facts (from `docs/metrics.json`):

- multi-stage build, **~355 MB** final
- runs as non-root user `forge` (uid 10001)
- HEALTHCHECK wired to `forge doctor`
- multi-arch: `linux/amd64`, `linux/arm64`
- OCI labels carry version + commit + build date

Build locally from a clone:

```bash
docker build -f docker/Dockerfile -t forge/core:dev .
```

---

## 4. Podman

Everything in §3 works by swapping `docker` for `podman`:

```bash
podman pull ghcr.io/forge/forge:latest
podman run --rm -it \
  -v forge-home:/data \
  -v "$PWD:/workspace" \
  ghcr.io/forge/forge:latest
```

Rootless mode is supported — the image uses a static uid (10001) so
volume ownership is predictable across hosts.

---

## 5. Compose (Forge + Ollama + UI)

```bash
git clone https://github.com/forge/forge && cd forge
docker compose -f docker/docker-compose.yml up -d
# or:
podman-compose -f docker/docker-compose.yml up -d
```

What it runs:

```mermaid
flowchart LR
  classDef c fill:#0c4a6e,stroke:#38bdf8,color:#e0f2fe,rx:4,ry:4
  classDef v fill:#18181b,stroke:#f59e0b,color:#fef3c7,rx:4,ry:4

  OLLAMA["ollama<br/>:11434"]:::c
  UI["forge-ui<br/>:7823"]:::c
  CORE["forge-core<br/>(docker compose run --rm)"]:::c
  FH[forge-home]:::v
  OM[ollama-models]:::v

  OLLAMA --> OM
  UI --> FH
  CORE --> FH
  UI --> OLLAMA
  CORE --> OLLAMA
```

Invoke the CLI on demand:

```bash
docker compose -f docker/docker-compose.yml run --rm forge-core \
  forge run "refactor src/api/*.ts"
```

Tear down:

```bash
docker compose -f docker/docker-compose.yml down
# keep volumes:     add --volumes to wipe them
```

---

## 6. Platform-specific notes

### macOS

- Apple Silicon: Docker image runs `linux/arm64` natively.
- Keychain integration: `src/keychain/mac.ts` uses the Security framework.
- Gatekeeper: the npm install is a plain Node install, no codesigning needed.

### Linux

- Rootless Podman works out of the box.
- SELinux: mount with `:Z` if volume labels matter —
  `-v "$PWD:/workspace:Z"`.
- Keychain: `src/keychain/linux.ts` tries `libsecret` first, falls back
  to an encrypted file in `$XDG_DATA_HOME`.

### Windows

- PowerShell:
  ```powershell
  npm install -g @forge/cli
  forge doctor
  ```
- WSL 2: preferred for shell-intensive workflows (ripgrep, git).
- Keychain: `src/keychain/windows.ts` uses DPAPI.

---

## 7. Model runtimes you can point Forge at

Forge auto-detects these on their default ports — **no env vars needed**
when you're running on the defaults:

| Runtime | Default endpoint | Notes |
|---------|------------------|-------|
| Ollama | `http://127.0.0.1:11434` | `ollama serve`; models via `ollama pull …` |
| LM Studio | `http://127.0.0.1:1234/v1` | "Local Server → Start Server" |
| vLLM | `http://127.0.0.1:8000/v1` | `vllm serve <model>` |
| llama.cpp | `http://127.0.0.1:8080/v1` | `llama-server -m model.gguf` |
| OpenAI-compatible | `OPENAI_BASE_URL` | LocalAI, Together, Groq, Azure, Fireworks |
| Anthropic | hosted | `ANTHROPIC_API_KEY` |

Override endpoints per runtime: `OLLAMA_ENDPOINT`, `LMSTUDIO_ENDPOINT`,
`VLLM_ENDPOINT`, `LLAMACPP_ENDPOINT`, `OPENAI_BASE_URL`.

Forge's catalog classifies **41 model families** — Llama 3/3.1/3.2/3.3/4,
Qwen 2/2.5/3 + Coder, DeepSeek V3/R1/Coder, Gemma 2/3, Phi 3/4,
Mistral/Mixtral/Nemo/Small/Large, Nemotron, Command-R/R+, Granite +
Granite-Code, CodeLlama, Codestral, StarCoder, Yi, Solar, Zephyr,
MiniCPM, LLaVA, TinyLlama, SmolLM, Aya, and more. Unknown models still
get a routable role rather than being refused.

### Runtime selection flow

```mermaid
flowchart TB
  classDef q fill:#1e1b4b,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4
  classDef r fill:#14532d,stroke:#10b981,color:#d1fae5,rx:4,ry:4
  classDef h fill:#3f1d5c,stroke:#a78bfa,color:#ede9fe,rx:4,ry:4

  Q1{Have a GPU / local RAM?}:::q
  Q1 -->|yes · best perf| Q2{Prefer point-and-click GUI?}:::q
  Q1 -->|no| Q3{Want to keep traffic on-prem?}:::q
  Q2 -->|yes| LMS[LM Studio]:::r
  Q2 -->|no · prefer CLI| OLL[Ollama]:::r
  Q3 -->|yes| VLL[vLLM on a server · serve team]:::r
  Q3 -->|no · cloud OK| ANT[Anthropic or OpenAI-compat]:::h
```

---

## 8. First-run checklist

```bash
forge doctor            # 1. green checks + role→model mapping per provider
forge init              # 2. create ~/.forge; writes a project .forge/ when inside a repo
forge model list        # 3. verify what you can call
forge run "…task…"      # 4. your first real run
```

If `doctor` reports "No model provider is reachable", it prints **exactly**
what to start and which env vars unlock cloud fallback.

---

## 9. Uninstall

```bash
npm uninstall -g @forge/cli    # or remove the image:
docker rmi ghcr.io/forge/forge:latest

# optional — wipe state:
rm -rf ~/.forge                # global
rm -rf ./.forge                # per-project
```

Compose stack:

```bash
docker compose -f docker/docker-compose.yml down --volumes --remove-orphans
```

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `forge: command not found` | npm global bin not on PATH | add `$(npm bin -g)` to PATH, or use `npx @forge/cli` |
| `No model provider is reachable` | nothing running on default ports | start Ollama / LM Studio / vLLM / llama.cpp, or export `ANTHROPIC_API_KEY` |
| `adapter: substituted model` warning | your configured model isn't pulled | either `ollama pull <id>` or accept the substitution (Forge picked the best-fit) |
| Container exits immediately | default CMD is `forge --help` | pass a subcommand: `docker run … ghcr.io/forge/forge:latest forge run "…"` |
| Permission prompts every single call | strict mode on, or no flags | `--skip-permissions` for routine tools, or `--allow-shell` / `--allow-files` |
| UI can't reach backend services | bind address wrong | `forge ui start --bind 0.0.0.0 --port 7823` |
| SQLite locked | daemon + REPL both writing | Forge handles this with O_APPEND; if you see this, file an issue with the full log |

Further diagnostics: `forge doctor --no-banner` for a machine-friendly
dump, `FORGE_LOG_LEVEL=debug forge …` for verbose tracing.
