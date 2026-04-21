---
name: fresh-eyes
description: Reset review context when bead polishing or code review has flatlined. Requires starting a brand-new Claude / Codex session. Use when you're seeing the same small edits round after round.
---

# /fresh-eyes — break the local minimum

When a session has accumulated too many assumptions, fresh eyes beat
tired eyes. Context exhaustion can feel like convergence.

## Prerequisite

Start a **new** Claude Code or Codex session. Don't just `/clear`.

## Two-step prompt

Send, in order, the two prompts at
`.flywheel/prompts/fresh-eyes.md`:

1. First, a deep context load (AGENTS.md + CLAUDE.md + FLYWHEEL.md +
   README.md + code investigation).
2. Then, a review of `.beads/beads.jsonl` against
   `.flywheel/plans/<PLAN>.md`.

## When this operator pays off most

- Bead polishing flatlined after 3–4 rounds.
- Deep code review keeps finding the same class of bug.
- A major architectural decision feels locked in but nobody remembers
  justifying it.

## After

If the fresh session finds new issues → back to `/polish-beads`.
If it comes back clean → you're genuinely at convergence. Proceed.
