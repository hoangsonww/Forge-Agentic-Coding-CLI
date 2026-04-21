# Plan → beads conversion

**Use with:** Claude Code with Opus (or Codex with GPT high).

**Goal:** translate a polished markdown plan into a comprehensive,
self-documenting set of beads in `.beads/beads.jsonl` with full
dependency structure.

**Critical:** do not write pseudo-beads in a separate markdown file.
Edit `.beads/beads.jsonl` directly. Every bead must be self-contained
enough that a fresh agent can execute it without re-reading the plan.

---

OK so please read ALL of `.flywheel/plans/<PLAN_FILE>.md` and take ALL
of that and elaborate on it more and then create a comprehensive and
granular set of beads for all this with tasks, subtasks, and
dependency structure overlaid, with detailed comments so that the
whole thing is totally self-contained and self-documenting (including
relevant background, reasoning/justification, considerations,
etc. — anything we'd want our "future self" to know about the goals
and intentions and thought process and how it serves the over-arching
goals of the project).

**Write the beads directly into `.beads/beads.jsonl`.** Use the `fg-`
prefix. One JSON object per line. Required fields: `id`, `title`,
`type`, `status`, `priority`, `labels`, `depends_on`, `blocks`,
`description`, `tests`, `created_at`. The `description` must be a
rich, long-form markdown string. The `tests` field is a list of
concrete test names or obligations.

Preserve the existing `fg-0` bootstrap bead; start numbering your new
beads from `fg-1`.

**Do not simplify or lose functionality.** If in doubt, include more
context in the description, not less.

Use **ultrathink**.
