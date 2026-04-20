---
name: add-provider
description: Scaffold a new model provider for Forge — class, registry wiring, providerEnum entry, local-catalog classification, router check, and a unit test with mocked transport.
---

Copy the shape of an existing provider (`src/models/ollama.ts`,
`src/models/openai.ts`, `src/models/anthropic.ts`). Do not invent a new
shape.

## 1. `src/models/<name>.ts`

- Match the existing provider interface (availability probe,
  chat/complete, token count, streaming).
- Availability probe ≤ 1.5 seconds. Long timeouts break REPL
  cold-start budget.
- HTTP via `undici` (already a dependency). No `axios`, no
  `node-fetch`.
- Redact credentials via `src/security/redact.ts` before any log call.
- Map transport errors to `ForgeRuntimeError` with the right
  `retryable` flag and a `recoveryHint` where possible.

## 2. `src/models/registry.ts`

- Add the id to `providerEnum`.
- Register the class in `initProviders`.
- If local (runs on the user's machine), add it to `isLocalProvider`.

## 3. `src/models/local-catalog.ts`

- Add model id → family classification here. Do **not** write
  ad-hoc regex in the provider for capability detection.

## 4. `src/models/router.ts`

- Verify routing reaches the new provider via standard rules. If
  routing changes, update `test/unit/adapter.test.ts`.

## 5. Unit test

Mock the transport (see `test/unit/adapter.test.ts`). Cover:

- availability probe success and failure,
- chat/complete happy path,
- 429 retry behaviour,
- auth failure surfaces a non-retryable structured error.

## 6. Docs

Update the provider table in `docs/ARCHITECTURE.md` §6, bump the
README "At a glance" count, and add a one-line setup note to
`docs/SETUP.md`.

Finish with the `verify` skill.
