---
name: debug-loop
description: Systematic debugging playbook for the Forge agentic loop (src/core/loop.ts and src/agents/executor.ts). Use when a task is stuck, looping, or producing wrong tool calls.
---

# /debug-loop — debug the agentic loop

The loop is the single most expensive place to be wrong. Before you
change anything, instrument.

## 1. Reproduce deterministically

- Run with `FORGE_LOG_LEVEL=debug ./bin/forge.js <command>`.
- Capture a session id. Events are in
  `~/.config/forge/events/<session>.ndjson`.
- If the bug only repro's against a real provider, pin to a single
  model and disable the router's fallback:
  `FORGE_MODEL=... FORGE_ROUTER_FALLBACK=0`.

## 2. Read the event stream, not the terminal

Each turn emits: `turn.start`, `model.call`, `tool.call`, `tool.result`,
`validation.result`, `turn.end`. If any stage is missing or out of
order, that is your bug. Grep the ndjson before staring at code.

## 3. Check the usual suspects, in order

1. **Mode caps** (`src/core/mode-policy.ts`) — is the agent hitting the
   turn/token cap and being cut off? The event will say so.
2. **Validation gate** (`src/core/validation.ts`) — is the gate
   rejecting a valid step? Look at `validation.result.reason`.
3. **Tool registry** — is the tool the model asked for actually
   registered? `tool.call` with `class: not_found` means no.
4. **Permissions** — is the call being silently denied?
   `tool.result.denied=true` in the stream.
5. **State machine** (`src/persistence/tasks.ts`) — is an illegal
   transition being attempted?

## 4. Add a failing test before the fix

- Unit-test the smallest failing path with `callModel` mocked.
- If the bug is in the loop itself, `test/unit/executor-loop.test.ts`
  is the template.

## 5. Fix, then verify

Run `/verify`. If the test you added doesn't turn green, you fixed the
wrong thing.
