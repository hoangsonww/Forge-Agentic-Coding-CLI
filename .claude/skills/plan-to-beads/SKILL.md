---
name: plan-to-beads
description: Translate a polished markdown plan into self-contained beads in .beads/beads.jsonl. Treat this as a distinct translation problem, not task extraction. Use after /plan-synthesize produces a stable hybrid plan.
argument-hint: <plan-file>
---

# /plan-to-beads — translate plan → executable memory

Bead space is different from plan space. A beautiful plan does not
automatically produce a good bead graph. **Treat this as a
translation problem:** every rich-in-context element in the plan must
end up embedded in a bead, so a fresh agent can execute the bead
without reopening the plan.

Plan file: **$ARGUMENTS** (e.g.
`.flywheel/plans/2026-04-20-async-validation-hybrid.md`).

## Prompt

Use the verbatim prompt at `.flywheel/prompts/plan-to-beads.md`.
Point it at `$ARGUMENTS`.

## What "good" looks like

Each new bead in `.beads/beads.jsonl` must have:

- `id` with prefix `fg-` (numbering continues from the last existing
  bead; preserve `fg-0`).
- `description` rich enough to execute without the plan — embed
  rationale, acceptance criteria, failure modes, invariants touched.
- `tests` populated with concrete unit and e2e obligations.
- correct `depends_on` / `blocks` edges.
- `labels` that reflect subsystem (`core`, `executor`, `tools`,
  `models`, `permissions`, `sandbox`, `persistence`, `ui`, …).
- `priority` on P0–P4 (0 = critical, 4 = backlog).

## What **NOT** to do

- Don't write pseudo-beads in a markdown document. Edit
  `.beads/beads.jsonl` directly.
- Don't simplify. If unsure, include more context in the description,
  not less.
- Don't lose features during translation. Run Operator 4
  (plan-to-beads transfer audit) afterwards:
  `.flywheel/operators/4-plan-to-beads-transfer-audit.md`.

## After

Run `/polish-beads` 4–6 times before any implementation.
