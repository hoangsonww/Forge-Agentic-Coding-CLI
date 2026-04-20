---
paths:
  - "src/models/**/*.ts"
  - "src/agents/**/*.ts"
  - "src/core/**/*.ts"
---

# Model, agent, and core-loop rules

- **Providers**: register in `src/models/registry.ts#initProviders`. Add the
  id to `providerEnum` and, if local, to `isLocalProvider`. Classify model
  ids through `src/models/local-catalog.ts` — do **not** hand-roll regexes
  in a new provider.
- **Agents**: register in `src/agents/registry.ts`. Follow the existing
  base-class shape in `src/agents/base.ts`.
- **Core loop**: hot paths are `src/core/loop.ts`, `src/agents/executor.ts`,
  `src/core/mode-policy.ts`, and `src/core/validation.ts`. Surgical edits
  only — never refactor these without a test covering the new behaviour.
- **Mode policy**: per-mode caps (tokens, turns, concurrency) live in
  `src/core/mode-policy.ts`. Changing a cap is a behaviour change — update
  the mode caps table in `docs/ARCHITECTURE.md` §4 in the same PR.
- **State machine**: task transitions must be in `LEGAL_TRANSITIONS`
  (`src/persistence/tasks.ts`). Never monkey-patch state; if a transition
  is missing, add it to the table with a test.
- **Provider availability probes** should remain ~1.5s, not long timeouts.
