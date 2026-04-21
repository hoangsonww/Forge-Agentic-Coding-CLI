# CLAUDE.md

Project-specific context for Claude Code (and compatible Claude-based
coding agents) working on the Forge repository.

> If you're a human reader, the real docs are in [README.md](README.md),
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and
> [docs/SETUP.md](docs/SETUP.md). This file exists so automated agents
> don't re-learn the repo on every turn.

> **Claude-specific tooling** lives in `.claude/`:
>
> - `.claude/settings.json` — safe Bash allowlist, deny rules for
>   destructive commands, status line.
> - `.claude/rules/*.md` — path-scoped rules that only load when
>   Claude reads matching files (TypeScript, testing, tools, models,
>   security, UI).
> - `.claude/skills/` — invocable workflows: `/verify`, `/add-tool`,
>   `/add-provider`, `/add-agent`, `/debug-loop`, `/release-check`.
> - `.claude/agents/` — subagents with isolated context:
>   `code-reviewer`, `test-runner`, `docs-auditor`.
> - `.claude/commands/` — `/metrics`, `/fix-issue`.
>
> Use `/verify` before claiming any change done. Delegate reviews to
> the `code-reviewer` subagent so full diffs don't pollute the main
> context.
>
> **Agentic Coding Flywheel.** For any non-trivial change, work in
> plan space → bead space → code space (see [FLYWHEEL.md](FLYWHEEL.md)).
> Skills: `/flywheel` (overview), `/plan`, `/plan-synthesize`,
> `/plan-to-beads`, `/polish-beads` (4–6×), `/fresh-eyes`,
> `/dedupe-beads`, `/idea-wizard`, `/deep-review`, `/reality-check`,
> `/landing`, `/de-slopify`. Subagents: `bead-polisher`,
> `plan-synthesizer`, `skill-refiner`. Task graph lives in
> `.beads/beads.jsonl`; plans in `.flywheel/plans/`.
>
> When confused after a compaction: "Reread AGENTS.md, CLAUDE.md, and
> FLYWHEEL.md so they're still fresh in your mind."

---

## Identity of this repo

**Forge** — a local-first, multi-agent, programmable software-engineering
CLI runtime. Written in TypeScript, targets Node 20+. Ships as:

- `@hoangsonw/forge` (npm)
- `ghcr.io/hoangsonw/forge-agentic-coding-cli` (Docker image, multi-arch)
- `docker/docker-compose.yml` for the full stack with Ollama + UI

**It is not** a chat wrapper, a VS Code extension, or a web app. The
runtime is the product; the REPL and dashboard are surfaces over it.

## Build & verify commands (canonical)

| Intent | Command |
|--------|---------|
| Install deps | `npm ci --ignore-scripts` |
| Full build | `npm run build` |
| Typecheck only | `npm run typecheck` |
| Run all tests | `npm test` |
| Run one file | `npx vitest run test/unit/<file>.test.ts` |
| Lint | `npm run lint` |
| Format (write) | `npm run format` |
| Format (check) | `npm run format:check` |
| Coverage | `npm run test:coverage` |
| Sanity check | `./bin/forge.js doctor --no-banner` |
| Regenerate metrics | `bash scripts/metrics.sh` |

Always run the following before claiming a change is done:

```bash
npm run format && npm run lint && npm run build && npm test
```

548 tests across 97 files must remain at **100% passing**.

## Repository map

```
src/
  cli/           CLI, REPL, input editor
  core/          orchestrator, agentic loop, mode policy, validation gate
  agents/        planner / architect / executor / reviewer / debugger / memory
  models/        6 providers (ollama / anthropic / openai / llamacpp / vllm / lmstudio)
                 + router + adapter + local-catalog
  tools/         18 tools (read/write/edit/grep/glob/run_command/git/web/…)
  permissions/   risk classifier + interactive manager + trust calibration
  sandbox/       fs scope + command risk classifier
  persistence/   tasks/sessions/conversations/events + SQLite index
  memory/        hot / warm / cold / learning
  scheduler/     DAG topo-sort + resource permits
  ui/            HTTP + WS dashboard + public/ shell
  mcp/           Model Context Protocol bridge
test/unit/       92 files · test/integration/ 4 · test/e2e/ 1 · fixtures + helpers
                  548 tests total, 100% passing
docs/            ARCHITECTURE / INSTALL / SETUP
.github/workflows/  ci.yml (9 jobs) · release.yml (6 stages) · nightly.yml
docker/          Dockerfile (single multi-stage) + docker-compose.yml
```

Hot paths you'll touch most:

- `src/core/loop.ts` — the agentic pipeline
- `src/agents/executor.ts` — the iterative tool-use loop
- `src/core/mode-policy.ts` — per-mode caps
- `src/core/validation.ts` — post-step gate
- `src/models/router.ts` + `src/models/adapter.ts` — model resolution
- `src/persistence/tasks.ts` — state machine + legal transitions
- `src/core/conversation.ts` — conversation store used by both REPL & UI

## Conventions

- **TypeScript strict mode.** No `any` in production code without a
  comment explaining why (see `src/tools/registry.ts` for the one
  accepted exception).
- **Default to no comments.** Only comment *why*, never *what*.
- **Errors are structured.** Throw `ForgeRuntimeError` with a class,
  message, `retryable`, and optional `recoveryHint`.
- **New tools** register in `src/tools/registry.ts` and must declare
  `sideEffect` + `risk`.
- **New providers** register in `src/models/registry.ts#initProviders`;
  add to `providerEnum` and `isLocalProvider` if local.
- **New agents** register in `src/agents/registry.ts`.
- **New CLI commands** register in `src/cli/index.ts`.
- **State-machine transitions** must stay in `LEGAL_TRANSITIONS`
  (`src/persistence/tasks.ts`). Never monkey-patch.
- **Never** bypass permission prompts unless the user has explicitly
  passed `--skip-permissions` / `--allow-*`.
- **Never** make network calls from unit tests. Use `vi.mock` — see
  `test/unit/executor-loop.test.ts` for the pattern.

## Performance posture (the user cares about this)

- REPL cold-start < 250 ms.
- `forge doctor` < 1 s on a box with no providers running.
- UI `app.js` stays < 120 KB uncompressed (currently < 100 KB).
- No synchronous disk reads on REPL redraw or UI poll paths.
- Default executor turn caps (see `src/core/mode-policy.ts`) keep
  token spend bounded.
- The UI is a single vanilla-JS shell — no framework, no CDN fetches.

Before adding a dependency, ask whether a 20-line hand-written utility
would do. The answer is usually yes.

## Security posture (non-negotiable)

- Every tool invocation goes through `requestPermission`
  (`src/permissions/manager.ts`).
- All paths are resolved to realpath and confined to the project root
  or explicit extra roots (`src/sandbox/fs.ts`).
- Shell commands are classified by `classifyCommandRisk`
  (`src/sandbox/shell.ts`); `critical` is hard-blocked.
- Credentials live in the OS keychain or an encrypted fallback
  (`src/keychain/`).
- Prompt-injection defence uses fenced-data boundaries
  (`src/security/injection.ts`).

Never add a code path that writes outside the sandbox without a
corresponding permission gate. Never store secrets in the config file.

## Before marking a task complete

- [ ] `npm run build` clean
- [ ] `npm test` 100% green
- [ ] `npm run format:check` + `npm run lint` green
- [ ] Relevant docs updated (ARCHITECTURE if you changed a hot path)
- [ ] If you added a subsystem: `bash scripts/metrics.sh` regenerated
- [ ] If it's user-facing: README `At a glance` table still accurate

## Style prefs for Claude-family agents

- Prefer surgical edits over refactors.
- Don't remove comments you don't understand.
- Don't add speculative abstractions — concrete first, abstract after
  three real callers.
- Surface assumptions early, especially when the spec is ambiguous.
- When you can't do the task (missing perms, missing env), say so
  explicitly instead of faking success.
