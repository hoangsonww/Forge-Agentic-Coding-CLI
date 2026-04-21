# Operator 1 — Plan-first expansion

**When:** the project still fits in plan space but would explode in
size once implemented. Multiple architectural paths are plausible, or
the user workflow is still fuzzy.

**Failure mode it prevents:** skeleton-first coding that locks in bad
boundaries.

---

[OPERATOR: plan-first-expansion]

1) Restate the goals, workflows, and constraints in concrete terms.
2) Expand the markdown plan in `.flywheel/plans/<PLAN_FILE>.md` until
   the main architectural and user-flow decisions are explicit.
3) Do not start coding until the plan covers testing, failure paths,
   and sequencing.

**Output (required):** revised markdown plan with clarified workflows,
architecture, and test obligations.
