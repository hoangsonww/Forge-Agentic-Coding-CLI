---
description: Model, agent, and core-loop rules
globs:
  - "src/models/**/*.ts"
  - "src/agents/**/*.ts"
  - "src/core/**/*.ts"
---

# Model, agent, and core-loop rules

**Providers** (`src/models/`):
- Register in `src/models/registry.ts#initProviders`. Add id to
  `providerEnum`. If local, add to `isLocalProvider`.
- Classify model ids via `src/models/local-catalog.ts` — do not
  hand-roll regexes in a new provider.
- Availability probe ≤ ~1.5 s.
- HTTP via `undici`. Redact credentials via
  `src/security/redact.ts`.

**Agents** (`src/agents/`):
- Register in `src/agents/registry.ts`. Extend
  `src/agents/base.ts`.
- Declare narrow allowed tool sets. Never "all tools" to pass a test.

**Core loop** (`src/core/`):
- Hot paths (`loop.ts`, `mode-policy.ts`, `validation.ts`): surgical
  edits only.
- Mode-cap changes require updating the caps table in
  `docs/ARCHITECTURE.md` §4.
- State transitions go in `LEGAL_TRANSITIONS`
  (`src/persistence/tasks.ts`). Never monkey-patch.
