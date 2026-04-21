---
name: plan-to-beads
description: Translate a polished markdown plan into self-contained beads in .beads/beads.jsonl. Every bead must be executable without reopening the plan. Use after the plan has converged.
---

Treat this as a translation problem, not task extraction.

Use the verbatim prompt at `.flywheel/prompts/plan-to-beads.md`,
pointing it at the target plan file in `.flywheel/plans/`.

Each new bead in `.beads/beads.jsonl` requires:

- `id` with `fg-` prefix (continue from the last existing number;
  preserve `fg-0`),
- `type`, `status`, `priority` (P0–P4), `labels`,
- `depends_on` and `blocks` edges,
- `description` rich enough to execute without the plan (rationale,
  acceptance criteria, failure modes, Forge invariants touched),
- `tests` list with concrete unit and e2e obligations,
- `created_at` (ISO-8601 UTC).

Do NOT write pseudo-beads in markdown. Edit `.beads/beads.jsonl`
directly.

Do NOT simplify during translation. If unsure, embed more context.

After: run `polish-beads` 4–6 times. If 20+ beads were added,
also run `.flywheel/prompts/dedupe-beads.md`.
