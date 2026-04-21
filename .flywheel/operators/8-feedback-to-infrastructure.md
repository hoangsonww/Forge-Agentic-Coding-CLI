# Operator 8 — Feedback-to-infrastructure closure

**When:** the same confusion or recovery pattern appears repeatedly
across sessions; agents complain about a tool; a project finishes
with clear lessons worth retaining.

**Failure mode it prevents:** treating lessons as anecdotes instead
of durable system inputs. This is the operator that turns repeated
behaviour into ritual, ritual into skill, skill into infrastructure.

---

[OPERATOR: feedback-to-infrastructure-closure]

1) Mine session history for repeated prompts, breakdowns, and fixes.
   (If CASS is available, use it; otherwise scan chat transcripts or
   commit history for patterns.)
2) Distill the useful patterns into:
   - a skill under `.agents/skills/` + `.claude/skills/` +
     `.codex/skills/`,
   - a rule under `.claude/rules/` or `.cursor/rules/`,
   - an AGENTS.md / CLAUDE.md section, or
   - a tool blurb in an existing Forge tool.
3) Update the reusable artifact so the next swarm starts from the
   improved baseline.

**Output (required):** a revised reusable artifact plus a short note
describing the lesson it now encodes.
