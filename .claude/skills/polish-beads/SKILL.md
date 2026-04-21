---
name: polish-beads
description: Polishing pass over all open beads. "Check your beads N times, implement once." Run 4–6 times. Use after /plan-to-beads and between refinement rounds.
---

# /polish-beads — convergence loop

Single most-underinvested step in the methodology. Every polish round
is ~100× cheaper than finding the same issue during implementation.

## Prompt

Use the verbatim prompt at `.flywheel/prompts/polish-beads.md`.

## What to check each round

1. **Self-containment.** Fresh agent, no plan — can they execute?
2. **Dependencies.** `depends_on` correct? Missing edges?
3. **Tests.** Concrete unit + e2e obligations with detailed logging?
4. **Coverage.** Cross-reference beads vs `.flywheel/plans/*.md`.
5. **Duplicates.** Merge overlapping beads into canonical ones.
6. **Forge invariants.** Permission gate, `LEGAL_TRANSITIONS`, UI
   budget, provider probe timing.

## Run count

4–6 rounds typical. Stop when:

- two consecutive rounds produce only small corrective edits,
- no new structural issues surface,
- dependency graph is stable.

If polishing has flatlined after 3 rounds, switch to `/fresh-eyes` —
a new session with no context baggage.

If 20+ new beads were added in a batch, also run `/dedupe-beads`.

## Final round: different model

As a final polishing pass, run this same prompt through a different
model (e.g. switch from Claude to Codex, or vice versa). Different
models catch different things.
