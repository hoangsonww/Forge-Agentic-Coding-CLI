---
name: landing
description: End-of-session ritual — close finished beads, file new ones for remaining work, run verify, commit in logical groupings, push. Work is not complete until git push succeeds.
disable-model-invocation: true
---

# /landing — land the plane

User-invocable only. Don't auto-trigger; landing is a deliberate
session boundary.

Unpushed work is invisible to every other agent. Mid-flight work that
isn't captured as beads is lost when context compacts or the session
ends. This skill turns a work session into a clean hand-off.

## Prompt

Use the verbatim prompt at `.flywheel/prompts/landing.md`.

## Checklist

- [ ] New beads filed for every open thread of follow-up work.
- [ ] `/verify` passes — format, lint, typecheck, build, tests.
- [ ] Closed beads updated in `.beads/beads.jsonl` with a one-line
      `closed_reason`.
- [ ] Commits are **logically grouped**, each with a detailed
      message referencing bead ids (`fg-12: ...`).
- [ ] No ephemeral files committed.
- [ ] `git pull --rebase && git push` → `git status` clean.
- [ ] One-line session report: beads closed, beads opened, test
      count delta, next-session kick-off hint.

## What success looks like

> A future swarm can pick the project up again using only
> `.beads/beads.jsonl`, `AGENTS.md`, and `FLYWHEEL.md` — no human
> has to re-explain anything.
