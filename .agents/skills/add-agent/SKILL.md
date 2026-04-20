---
name: add-agent
description: Scaffold a new Forge subagent (planner/architect/executor/reviewer/debugger/memory-style).
---

Agents extend `src/agents/base.ts`. Copy from the simplest existing
agent (`src/agents/reviewer.ts` or `src/agents/debugger.ts`).

## Steps

1. `src/agents/<name>.ts` — extend base. Declare:
   - allowed tool set (narrow, not "all tools"),
   - model preferences (router falls back if unavailable),
   - system prompt (short — it's paid for every turn).
2. Register in `src/agents/registry.ts`.
3. Unit test — mock `callModel` (see
   `test/unit/executor-loop.test.ts`). Cover:
   - the agent only calls the tools it declared,
   - a failing tool call is surfaced as a structured error, not a
     throw,
   - turn caps from `src/core/mode-policy.ts` are respected.
4. Docs — update the agent list in `docs/ARCHITECTURE.md` if
   user-visible.

Invariants you cannot break:

- Do not widen the allowed tool set to "all tools" to make a test
  pass.
- Do not bypass `src/core/validation.ts`.
- Do not call the model directly — always go through router/adapter.

Finish with the `verify` skill.
