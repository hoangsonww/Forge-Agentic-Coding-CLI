# Polish beads (run 4–6×)

**Use with:** Claude Code with Opus. Run repeatedly.

**Goal:** stay in bead space and find everything wrong with the bead
graph *before* burning tokens on implementation. "Check your beads N
times, implement once."

**If compaction happened:** always start by re-reading `AGENTS.md`.

---

Reread `AGENTS.md` and `FLYWHEEL.md` so they're still fresh in your
mind. Check over each bead in `.beads/beads.jsonl` super carefully —
are you sure it makes sense? Is it optimal? Could we change anything
to make the system work better for users? If so, revise the beads.
It's a lot easier and faster to operate in "plan space" before we
start implementing these things!

**DO NOT OVERSIMPLIFY THINGS! DO NOT LOSE ANY FEATURES OR
FUNCTIONALITY!**

Specifically check:

1. **Self-containment.** Could a fresh agent execute this bead without
   reopening the plan? If not, embed the missing context.
2. **Dependencies.** Is `depends_on` correct? Are there missing edges?
3. **Tests.** Does every bead include concrete unit/e2e test
   obligations with detailed logging? If not, add them.
4. **Coverage.** Cross-reference beads against the plan:
   `.flywheel/plans/*.md`. Is any feature missing from the graph? Is
   any bead orphaned with no plan backing?
5. **Duplicates.** Any beads overlapping? Merge into one canonical
   bead that best exemplifies the strengths of each.
6. **Forge-specific invariants.** Every bead that touches a tool
   declares permission + risk + sideEffect implications. Every bead
   that touches state transitions references LEGAL_TRANSITIONS. Every
   bead that touches the UI respects the < 120 KB budget.

Edit `.beads/beads.jsonl` in place. Use **ultrathink**.
