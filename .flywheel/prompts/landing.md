# Landing the plane (end-of-session ritual)

**Use with:** one designated agent at end of session. Work isn't
complete until `git push` succeeds.

---

We're wrapping up this work session. Land the plane cleanly:

1. **File beads for remaining work.** Anything uncovered during this
   session that isn't finished goes into `.beads/beads.jsonl` as a
   new open bead, with full context.
2. **Run quality gates.** Run the `/verify` skill. All 249+ tests
   must pass, format clean, lint clean, typecheck clean, build clean.
3. **Update bead status.** Close every finished bead in
   `.beads/beads.jsonl`. Update in-progress status. Every closed bead
   should have a one-line `closed_reason` appended to its description.
4. **Organized commits.** Commit all changed files in a series of
   logically connected groupings with detailed commit messages.
   Reference bead ids (`fg-12: ...`). Don't edit the code at this
   step. Don't commit ephemeral files.
5. **Push.** `git pull --rebase && git push`. Verify
   `git status` shows "up to date with origin".
6. **Report.** Summarize: beads closed, beads opened, test count
   delta, what the next session should pick up first.

Use **ultrathink**.
