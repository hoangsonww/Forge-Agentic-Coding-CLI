# AGENTS.md

Project-wide guidance for any code-writing agent (Codex, OpenAI agent
runtime, Cursor, Aider, Cline, Continue, …). Claude Code reads this too
but also reads [CLAUDE.md](CLAUDE.md).

> Conform to the OpenAI `AGENTS.md` convention: this file is a flat
> Markdown cheat-sheet that answers the questions "where am I, what
> can I run, and what shouldn't I break?".

---

## 1. Project identity

Forge is a **TypeScript CLI runtime** for local-first agentic software
engineering. Node 20+. Ships via npm and a multi-arch Docker image.

- Entry point: `bin/forge.js` → `dist/cli/index.js`
- Orchestrator: `src/core/orchestrator.ts`
- Agentic loop: `src/core/loop.ts`

## 2. Commands you'll run

```bash
npm ci --ignore-scripts
npm run build          # tsc + copy-assets
npm test               # vitest; 203 tests must pass
npm run typecheck
npm run lint
npm run format         # writes
npm run format:check   # reads, for CI
npm run test:coverage
./bin/forge.js doctor
```

Always end a change with:

```bash
npm run format && npm run lint && npm run build && npm test
```

## 3. Layout

| Path | Purpose |
|------|---------|
| `src/cli/` | commander-based CLI, REPL, raw-mode input editor |
| `src/core/` | orchestrator, agentic loop, mode policy, validation gate |
| `src/agents/` | planner, architect, executor, reviewer, debugger, memory |
| `src/models/` | providers (ollama/openai/anthropic/llamacpp/vllm/lmstudio), router, adapter, catalog |
| `src/tools/` | 18 tools |
| `src/permissions/` | risk + interactive permission manager |
| `src/sandbox/` | path-safe fs + command risk classifier |
| `src/persistence/` | tasks/sessions/conversations/events + SQLite |
| `src/memory/` | hot/warm/cold/learning |
| `src/ui/` | HTTP + WS dashboard + static app |
| `src/mcp/` | MCP bridge |
| `test/unit/` | vitest unit tests |
| `docs/` | ARCHITECTURE, INSTALL, SETUP, metrics |
| `.github/workflows/` | ci, release, nightly |
| `docker/` | Dockerfile + compose |

## 4. Rules

### Must

- Keep `npm test` at **100%** pass.
- Respect the state machine in `src/persistence/tasks.ts`.
- Gate every new tool through `requestPermission`.
- Classify model ids through `src/models/local-catalog.ts` (don't
  hand-roll regexes in a new provider).
- Add a unit test for any new logic in `src/core`, `src/agents`, or
  `src/tools`.

### Must not

- Bypass the permission system.
- Introduce network calls in tests — use `vi.mock`.
- Log credentials. Use `src/security/redact.ts`.
- Add dependencies without a clear reason.
- Rename exported APIs without updating every caller + the docs.

### Good defaults

- Prefer `readonly` / immutable data flow.
- Prefer function modules over classes unless state really needs
  encapsulation (see the provider classes for the accepted shape).
- Prefer explicit `Result<T, E>`-style shapes over thrown errors for
  expected failures. Throw only for programmer errors.

## 5. Testing

Vitest. Patterns to copy:

- Stubbing `callModel`: see `test/unit/executor-loop.test.ts`.
- Stubbing providers: see `test/unit/adapter.test.ts`.
- Tempdir + cleanup: see `test/unit/validation-gate.test.ts`.

## 6. CI quick reference

9 parallel jobs on every PR:

1. 🎨 format (prettier --check)
2. 🧹 lint (eslint)
3. 🧠 typecheck (tsc --noEmit)
4. 🧪 test (matrix: ubuntu + macOS × Node 20 + 22)
5. 📈 coverage
6. 🏗️ build (full `npm run build`)
7. 🐳 docker-build (catches Dockerfile drift)
8. 🔐 audit (npm audit, informational)
9. 📊 pipeline status (aggregates + fails if any required job failed)

Release (tag `v*`): 6-stage pipeline — gate, artifacts, docker publish to
GHCR, signed manifest + GH release, npm publish (provenance), status.

## 7. Performance posture

The product runs on personal machines, often alongside Ollama. Keep it
lean:

- No UI framework (app shell is vanilla JS + CSS, < 100 KB).
- No synchronous disk reads on REPL redraw or UI poll paths.
- Default executor turn cap in `src/core/mode-policy.ts`.
- Watchers are ref-counted so multiple surfaces share one file watcher.
- Providers do 1.5 s availability probes, not long timeouts.

## 8. Security posture

- All paths resolved to realpath + confined to project root.
- All tool invocations classified by risk × sideEffect and gated.
- Shell commands classified before execution; `critical` is hard-blocked.
- Credentials via `src/keychain/` (macOS keychain / libsecret / DPAPI).
- Prompt injection fenced by `src/security/injection.ts`.

## 9. Useful anchors

- Why the agentic loop works: [docs/ARCHITECTURE.md §2](docs/ARCHITECTURE.md#2-agentic-loop)
- State machine diagram: [docs/ARCHITECTURE.md §3](docs/ARCHITECTURE.md#3-task-state-machine)
- Mode caps table: [docs/ARCHITECTURE.md §4](docs/ARCHITECTURE.md#4-executor--iterative-tool-use-with-validation-gate)
- Provider routing: [docs/ARCHITECTURE.md §6](docs/ARCHITECTURE.md#6-model-routing--provider-registry)
- Dev setup: [docs/SETUP.md](docs/SETUP.md)
- Install: [docs/INSTALL.md](docs/INSTALL.md)

## 10. When uncertain

Read the failing test first. Then read `src/core/loop.ts`. Then ask.
Surfacing "I don't know what this invariant is" is better than guessing
and breaking a test six commits later.
