---
name: debug-loop
description: Systematic debugging playbook for the Forge agentic loop (src/core/loop.ts and src/agents/executor.ts). Use when a task is stuck, looping, or emitting wrong tool calls.
---

The loop is the most expensive place to be wrong. Instrument before
you change anything.

## 1. Reproduce deterministically

```bash
FORGE_LOG_LEVEL=debug ./bin/forge.js <command>
```

Capture the session id. Events land in
`~/.config/forge/events/<session>.ndjson`.

If the bug only reproduces against a real provider, pin the model and
disable router fallback:

```bash
FORGE_MODEL=... FORGE_ROUTER_FALLBACK=0 ./bin/forge.js <command>
```

## 2. Read the event stream, not the terminal

Each turn emits: `turn.start`, `model.call`, `tool.call`,
`tool.result`, `validation.result`, `turn.end`. Missing or
out-of-order events are your bug.

## 3. Check the usual suspects, in order

1. **Mode caps** (`src/core/mode-policy.ts`) — is the agent hitting
   turn/token cap?
2. **Validation gate** (`src/core/validation.ts`) — is a valid step
   being rejected?
3. **Tool registry** — is the requested tool actually registered?
   `tool.call` with `class: not_found` means no.
4. **Permissions** — silently denied? `tool.result.denied=true`.
5. **State machine** (`src/persistence/tasks.ts`) — illegal
   transition attempted?

## 4. Add a failing test before the fix

Template: `test/unit/executor-loop.test.ts`. Mock `callModel`. If the
test you add doesn't turn green after your fix, you fixed the wrong
thing.

## 5. Finish with `verify`.
