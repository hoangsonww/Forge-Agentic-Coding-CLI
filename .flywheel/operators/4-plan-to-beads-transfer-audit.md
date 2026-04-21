# Operator 4 — Plan-to-beads transfer audit

**When:** a large plan is about to be turned into execution tasks, or
agents have just converted it quickly and may have dropped rationale.

**Failure mode it prevents:** beautiful plan + terse beads that
depend on tacit knowledge from the markdown file.

---

[OPERATOR: plan-to-beads-transfer-audit]

1) Walk every important section of `.flywheel/plans/<PLAN>.md` and
   map it to actual beads in `.beads/beads.jsonl`.
2) Ensure rationale, constraints, acceptance criteria, and test
   obligations are embedded in each bead's `description` / `tests`.
3) Identify anything in the plan that has no bead, and any bead that
   has no clear plan backing. Flag both.

**Output (required):** coverage report plus bead edits that close
the gaps, directly in `.beads/beads.jsonl`.
