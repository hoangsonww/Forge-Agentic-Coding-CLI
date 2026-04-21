---
name: polish-beads
description: Polishing pass over all open beads. Run 4–6 times. "Check your beads N times, implement once." Use after plan-to-beads and between refinement rounds.
---

Use the verbatim prompt at `.flywheel/prompts/polish-beads.md`.

Each round, verify:

1. Self-containment — a fresh agent can execute without the plan.
2. Dependencies — `depends_on` is correct; no missing edges.
3. Tests — concrete obligations with logging expectations.
4. Coverage — cross-reference vs `.flywheel/plans/*.md`.
5. Duplicates — merge overlapping beads (see `dedupe-beads` prompt).
6. Forge invariants — permission gate, `LEGAL_TRANSITIONS`, UI <
   120KB, provider probe ~1.5s.

Stop when two consecutive rounds produce only small corrective
edits. If polishing has flatlined after 3 rounds, switch to a fresh
session and `.flywheel/prompts/fresh-eyes.md`.

Final round: run through a different model (e.g. switch Claude ↔
Codex). Different models catch different things.
