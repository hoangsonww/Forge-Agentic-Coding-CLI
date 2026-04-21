---
name: landing
description: End-of-session ritual. Close finished beads, file new ones for remaining work, run verify, commit in logical groupings, push. Work is not complete until git push succeeds.
---

Use the verbatim prompt at `.flywheel/prompts/landing.md`.

Checklist:

- [ ] New beads filed in `.beads/beads.jsonl` for every thread of
      follow-up work.
- [ ] `verify` skill passes (format, lint, typecheck, build, tests).
- [ ] Closed beads updated with a one-line `closed_reason`.
- [ ] Commits are logically grouped with detailed messages, each
      referencing bead ids (`fg-12: ...`).
- [ ] No ephemeral files committed.
- [ ] `git pull --rebase && git push`; `git status` clean.
- [ ] One-line session report: beads closed, beads opened, test
      count delta, next-session kick-off hint.

Success = a future swarm can pick up the project using only
`.beads/beads.jsonl`, `AGENTS.md`, and `FLYWHEEL.md`.
