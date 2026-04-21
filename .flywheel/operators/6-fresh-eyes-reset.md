# Operator 6 — Fresh-eyes reset

**When:** the current agent has done several long review rounds and
suggestions are getting repetitive or shallow.

**Failure mode it prevents:** trusting a tired context window to keep
finding subtle flaws; mistaking context exhaustion for genuine
convergence.

---

[OPERATOR: fresh-eyes-reset]

1) Start a fresh Claude Code or Codex session.
2) Reload `AGENTS.md`, `CLAUDE.md`, `FLYWHEEL.md`, and the relevant
   project context (see `.flywheel/prompts/fresh-eyes.md`).
3) Ask for a full review of the plan or beads as if seeing them for
   the first time.

**Output (required):** a fresh critical pass unconstrained by the
prior session's local minima.
