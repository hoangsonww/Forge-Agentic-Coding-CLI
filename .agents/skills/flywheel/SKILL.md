---
name: flywheel
description: Overview of Forge's Agentic Coding Flywheel methodology. Use to route between plan, bead, and code space. See FLYWHEEL.md at the repo root.
---

Forge follows the Agentic Coding Flywheel: plan obsessively in
markdown, translate polished plans into self-contained beads, then
let a swarm execute.

| Phase                 | Skill / Prompt                                  |
| --------------------- | ----------------------------------------------- |
| new feature           | `plan`                                          |
| competing plans → one | `.flywheel/prompts/plan-synthesize-best-of-all-worlds.md` |
| refine plan           | `.flywheel/prompts/plan-refine.md` (4–5×)       |
| translate to beads    | `plan-to-beads`                                 |
| polish beads          | `polish-beads` (4–6×)                           |
| session reset         | start fresh + `.flywheel/prompts/fresh-eyes.md` |
| cross-agent review    | `deep-review`                                   |
| strategic drift?      | `reality-check`                                 |
| end of session        | `landing`                                       |
| post-compaction       | "Reread AGENTS.md, CLAUDE.md, FLYWHEEL.md"      |

Layered artifacts:

- `.flywheel/plans/` — plan space.
- `.beads/beads.jsonl` — bead space (source of truth once polished).
- `src/`, `test/` — code space.

Core invariants live in `FLYWHEEL.md` (the Kernel, 9 items). Read
`AGENTS.md` and `CLAUDE.md` for Forge-wide rules.
