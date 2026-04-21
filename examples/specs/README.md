# Specs

Spec files drive `forge spec <file>`. Forge reads the file, extracts a
title and an actionable task list, and feeds the whole thing to the
agentic loop as a pre-classified task.

## Shape

A spec is plain markdown. Two sections are load-bearing:

1. **`# <title>`** — the first `#` heading becomes the task title.
2. **`## Tasks`** / **`## Requirements`** / **`## Acceptance criteria`** / **`## Todo`** — bullet points in this section become the task checklist.

Everything else is context for the model.

## Example skeleton

```markdown
# <one-line task title>

## Context

Why this matters. Link to relevant files, tickets, prior discussions.

## Tasks

- [ ] Thing one, concrete and verifiable.
- [ ] Thing two.
- [ ] Thing three.

## Non-goals

- Things explicitly out of scope. Prevents over-reach.

## Acceptance criteria

- How we know it's done. Tests pass, a new route returns 200, etc.

## Open questions

- Things the model should ask about before writing code.
```

## Examples in this directory

| File | Shape |
|---|---|
| [`feature-user-auth.md`](feature-user-auth.md) | Green-field feature with acceptance criteria |
| [`bugfix-memory-leak.md`](bugfix-memory-leak.md) | Debug flow: reproduce, localize, fix, test |
| [`refactor-extract-service.md`](refactor-extract-service.md) | Pure refactor with guardrails |

## Invoke

```bash
forge spec examples/specs/feature-user-auth.md
```

Forge will read the file, classify the task, produce a plan, ask for
approval, and execute. Use `--plan-only` to stop after the plan — useful
for reviewing intent before letting the agent touch files.
