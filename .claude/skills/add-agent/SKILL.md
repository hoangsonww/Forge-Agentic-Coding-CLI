---
name: add-agent
description: Scaffold a new Forge subagent (planner/architect/executor/reviewer/debugger/memory-style). Use when adding anything to src/agents/.
argument-hint: <agent-name>
---

# /add-agent — add a new Forge agent

Agents extend `src/agents/base.ts`. Follow the existing shape from
`src/agents/reviewer.ts` or `src/agents/debugger.ts` — they are the
simplest examples.

Agent name: **$ARGUMENTS**.

## Steps

1. **`src/agents/$ARGUMENTS.ts`** — extend the base agent class. Declare:
   - allowed tool set
   - model preferences (router falls back if unavailable)
   - system prompt (keep it short; long prompts burn tokens every turn)
2. **`src/agents/registry.ts`** — register the agent.
3. **Unit test** — mock `callModel` (see
   `test/unit/executor-loop.test.ts`). Cover:
   - the agent only calls the tools it declared
   - a failing tool call is surfaced as a structured error, not a throw
   - turn caps from `src/core/mode-policy.ts` are respected
4. **Docs** — update the agent list in `docs/ARCHITECTURE.md` if
   user-visible.

## Invariants

- Never widen the allowed tool set to "all tools" to make your agent
  pass a test. Fix the agent instead.
- Never bypass the validation gate (`src/core/validation.ts`).
- Do not call the model directly — always go through the router/adapter.

Run `/verify` when done.
