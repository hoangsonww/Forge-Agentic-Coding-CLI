---
name: add-provider
description: Scaffold a new model provider for Forge — class implementation, registry wiring, providerEnum entry, local-catalog classification, and unit test with mocked transport. Use for anything under src/models/.
argument-hint: <provider-name>
---

# /add-provider — add a new model provider

Providers in Forge follow a uniform shape (see `src/models/ollama.ts`,
`src/models/openai.ts`, `src/models/anthropic.ts`). Copy the shape, don't
invent a new one.

Provider name: **$ARGUMENTS**.

## 1. Provider class — `src/models/$ARGUMENTS.ts`

- Export a class that matches the shape of existing providers
  (availability probe, chat/complete, token counting, streaming).
- Availability probe must be **~1.5s max**. Long timeouts block the REPL
  cold-start budget.
- Use `undici` for HTTP (already a dependency). Do not add `axios`,
  `node-fetch`, or similar.
- Redact credentials via `src/security/redact.ts` before any log call.
- Map transport errors to `ForgeRuntimeError` with the right
  `retryable` flag and a `recoveryHint` where possible.

## 2. Registry — `src/models/registry.ts`

- Add the provider id to `providerEnum`.
- Register the class in `initProviders`.
- If the provider is local (Ollama-style, runs on the user's machine),
  add it to `isLocalProvider`.

## 3. Catalog — `src/models/local-catalog.ts`

- Add model id → family classification there.
- **Do not** write regexes inside your provider to detect model
  capabilities. The catalog is the single source of truth.

## 4. Router — `src/models/router.ts`

- Verify the router can reach the new provider via the standard routing
  rules. If routing needs a change, update the router **and** add a test
  in `test/unit/adapter.test.ts`.

## 5. Unit test

- Mock the transport (see `test/unit/adapter.test.ts` for the pattern).
- Cover: availability probe success/failure, chat/complete happy path,
  429 retry logic, auth failure surfaces a non-retryable structured
  error.

## 6. Docs

- Update the provider table in `docs/ARCHITECTURE.md` §6.
- Bump the provider count in `README.md` "At a glance" if applicable.
- Add a one-line setup note to `docs/SETUP.md`.

Run `/verify` to close the loop.
