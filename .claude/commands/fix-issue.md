---
argument-hint: <issue-number>
---

!`gh issue view $ARGUMENTS 2>/dev/null || echo "Could not fetch issue $ARGUMENTS"`

Investigate and fix the issue above in the Forge repository.

1. Identify the root cause. Prefer reading `src/core/loop.ts`,
   `src/agents/executor.ts`, and the relevant registry file first.
2. Write or update a failing test that reproduces the bug before the
   fix.
3. Implement the minimal fix. No speculative abstractions.
4. Run `/verify` and confirm the test turns green.
5. Draft a commit message that follows conventional-commit style and
   references the issue. Do **not** push or open a PR unless explicitly
   asked.
