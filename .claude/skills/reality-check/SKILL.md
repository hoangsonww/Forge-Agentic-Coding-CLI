---
name: reality-check
description: High-level reality check when the swarm feels busy but directionally off. Use when lots of code is landing but the real goal still feels far away.
---

# /reality-check — are we actually getting there?

Strategic drift: busy agents, growing commit count, feature still
feels far. This prompt breaks the spell of local productivity.

## Prompt

Use the verbatim prompt at `.flywheel/prompts/reality-check.md`.

## What to do with the answer

| Answer                                                     | Action                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| "Yes, completing all open beads closes the gap."           | Keep going. This was a false alarm.                                 |
| "Close, but these specific things are missing…"            | Revise existing beads or add new ones for each gap. Polish, resume. |
| "No, we'd still be far." → structural issue                | Stop the swarm. Back to `/plan` or `/plan-synthesize`.              |
| "Yes but the plan itself targets the wrong outcome."       | Stop. Revisit intent in plan space.                                 |

## How often

At natural milestones (epic closed, ~25% of beads done, ~50% done),
and any time you feel the urge to ask "wait, are we actually
shipping what we set out to?"

Busy agents are not the goal. A bead graph that converges on the
real outcome is the goal.
