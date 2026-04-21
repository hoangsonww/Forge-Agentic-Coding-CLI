---
name: idea-wizard
description: 30 → 5 → 15 funnel for brainstorming new features on the existing Forge codebase. Use when adding capability to a mature install, not for greenfield.
---

# /idea-wizard — add features to existing Forge

Winnowing forces critical evaluation. Asking for "5 ideas" directly
produces weak lists; asking for 30 then winnowing produces strong
ones.

## Phases

1. **Ground in reality.** Read AGENTS.md + CLAUDE.md. Skim the open
   bead graph: `jq -c 'select(.status!="closed")' .beads/beads.jsonl`.
2. **Generate 30, winnow to 5.** Use the Phase 2 prompt in
   `.flywheel/prompts/idea-wizard.md`.
3. **Expand to 15.** "OK and your next best 10 and why." Each one
   must be verified novel against the current bead graph.
4. **Human review.** You pick from the 15 which to pursue.
5. **Create beads** in `.beads/beads.jsonl` with full descriptions.
6. **Polish** 4–5 times with `/polish-beads`.

## When NOT to use this

- For bounded, small changes — use the TODO-list approach inline
  instead, without formal beads.
- For greenfield projects — use `/plan` from the start.
- For porting ideas from an external project — use the
  research-and-reimagine approach (see `FLYWHEEL.md` §5); save the
  proposal to `.flywheel/proposals/`.

## Verification before bead creation

For every idea that survives winnowing, verify:

- It respects Forge's security and permission invariants.
- It fits under one of the existing subsystem labels.
- It doesn't duplicate something closed (check closed beads too).
