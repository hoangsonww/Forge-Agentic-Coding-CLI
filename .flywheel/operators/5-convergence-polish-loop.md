# Operator 5 — Convergence polish loop

**When:** a plan or bead graph has visible rough edges and the first
polishing pass found real issues.

**Failure mode it prevents:** treating the first decent revision as
final, or polishing past the point of diminishing returns.

**Stop signal:** two consecutive rounds are mostly corrective;
change magnitude has collapsed.

---

[OPERATOR: convergence-polish-loop]

1) Re-run a full critical review in a fresh session (see
   `.flywheel/prompts/fresh-eyes.md`).
2) Integrate the fixes and compare the magnitude of changes to the
   previous round.
3) Stop only when the revisions are small, mostly corrective, and
   coverage checks keep passing.

**Output (required):** revised artifact plus a judgment of whether
it's still in major-change mode or near convergence.
