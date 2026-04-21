# Dedupe beads

**Use with:** Claude Code, after any batch where ≥ 20 new beads were
created.

---

Reread `AGENTS.md` so it's still fresh in your mind. Check over ALL
open beads in `.beads/beads.jsonl`. Make sure none of them are
duplicative or excessively overlapping — try to intelligently and
cleverly merge them into single canonical beads that best exemplify
the strengths of each.

For each merge, preserve:

- The richest description between the pair.
- The union of `depends_on` and `blocks` edges (dedupe edges too).
- The higher priority (lower number wins).
- Every test obligation from both beads.

Use **ultrathink**.
