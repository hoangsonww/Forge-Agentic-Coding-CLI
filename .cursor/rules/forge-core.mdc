---
description: Core Forge project conventions — always applied
alwaysApply: true
---

# Forge — core conventions

Forge is a local-first, multi-agent, programmable software-engineering
CLI runtime (TypeScript, Node 20+). Ships as `@hoangsonw/forge` on npm
and as a multi-arch Docker image.

## Canonical verify chain

Before claiming any change done:

```bash
npm run format && npm run lint && npm run build && npm test
```

249 tests across 43 files must remain 100% passing.

## Hot paths — surgical edits only

- `src/core/loop.ts` — agentic pipeline
- `src/agents/executor.ts` — iterative tool-use loop
- `src/core/mode-policy.ts` — per-mode caps
- `src/core/validation.ts` — post-step gate
- `src/models/router.ts` + `src/models/adapter.ts` — routing
- `src/persistence/tasks.ts` — state machine + `LEGAL_TRANSITIONS`

## Non-negotiables

- Every tool call goes through `requestPermission`
  (`src/permissions/manager.ts`).
- Paths resolved to realpath and confined to project root
  (`src/sandbox/fs.ts`).
- Shell commands classified by `classifyCommandRisk`
  (`src/sandbox/shell.ts`); `critical` is hard-blocked.
- Credentials in OS keychain (`src/keychain/`), never in config files.
- State transitions live in `LEGAL_TRANSITIONS` — never monkey-patch.

## Style

- TypeScript strict. No `any` in production without a comment
  explaining why (exception: `src/tools/registry.ts`).
- Comments explain **why**, not what. Never add a comment that
  describes the change you just made.
- Prefer `readonly` and immutable data flow. Prefer function modules
  over classes (exception: provider classes in `src/models/`).
- Throw `ForgeRuntimeError` (`src/types/errors.ts`) with
  `{ class, message, retryable, recoveryHint? }`. Use `Result<T, E>`
  shapes for expected failures.

## Performance posture

- REPL cold-start < 250 ms.
- `forge doctor` < 1 s with no providers running.
- UI `app.js` < 120 KB uncompressed.
- No synchronous disk reads on REPL redraw or UI poll paths.
- Provider availability probes ~1.5 s, not long timeouts.

Before adding a dependency, ask whether a 20-line hand-written utility
would do. It usually would.

## Also see

`AGENTS.md` and `CLAUDE.md` at the repo root, and the skills in
`.agents/skills/` (portable), `.claude/skills/` (Claude Code), and
`.codex/skills/` (Codex).
