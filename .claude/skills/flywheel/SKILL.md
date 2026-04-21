---
name: flywheel
description: Overview of Forge's Agentic Coding Flywheel methodology — plan space, bead space, code space. Invoke this skill when you need to know which Flywheel skill or prompt applies to the current phase.
---

# /flywheel — methodology overview

Forge follows the **[Agentic Coding Flywheel](../../../FLYWHEEL.md)**
methodology: plan obsessively in markdown, translate polished plans
into self-contained beads, and only then let a swarm execute.

## Where you are now

| If you are…                                               | Use                                                    |
| --------------------------------------------------------- | ------------------------------------------------------ |
| starting a new feature / subsystem                        | `/plan` → write the initial plan                       |
| you have 2+ competing plans from different models         | `/plan-synthesize` → GPT Pro synthesizes hybrid        |
| refining a plan                                           | `.flywheel/prompts/plan-refine.md` (fresh chats, 4–5×) |
| plan feels stable and complete                            | `/plan-to-beads` → create `.beads/beads.jsonl`         |
| beads were just created                                   | `/polish-beads` (run 4–6×)                             |
| polishing has flatlined                                   | `/fresh-eyes` → new session, reload docs               |
| ≥ 20 new beads were just batched in                       | `/dedupe-beads`                                        |
| adding features to existing Forge                         | `/idea-wizard` (30 → 5 → 15 funnel)                    |
| swarm is running, agents finished a bead                  | self-review inline, then `/deep-review` every hour     |
| swarm feels busy but directionally off                    | `/reality-check`                                       |
| end of session                                            | `/landing` → close beads, commit, push                 |
| agent confused after compaction                           | "Reread AGENTS.md, CLAUDE.md, and FLYWHEEL.md"         |

## Layered artifacts (don't confuse them)

- **plan space** → `.flywheel/plans/*.md` (where architecture lives)
- **bead space** → `.beads/beads.jsonl` (where execution lives)
- **code space** → `src/` + `test/` (where implementation lives)
- **rules & skills** → `.claude/`, `.codex/`, `.cursor/`, `.agents/`
  (how agents behave)

Once polished beads exist, **the beads are the source of truth** for
execution. You don't keep editing the plan while agents implement.

## Core invariants (the Kernel)

1. Global reasoning in plan space — the plan must fit in context.
2. Plan must be comprehensive before any code.
3. Plan-to-beads is a distinct translation problem.
4. Beads carry enough context that agents don't need the plan anymore.
5. Convergence matters more than first drafts.
6. Swarm agents are fungible — coordination lives in artifacts.
7. Coordination survives compaction (`AGENTS.md` re-reads, beads).
8. Session history is part of the system (feed lessons back).
9. Implementation is not the finish line — review/test/harden.

See `FLYWHEEL.md` at the repo root for the full methodology.
