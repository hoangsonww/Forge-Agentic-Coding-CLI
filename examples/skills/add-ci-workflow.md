---
name: add-ci-workflow
description: Add a GitHub Actions workflow with sensible defaults and pinned deps.
inputs:
  - workflow_name
  - trigger
tools:
  - read_file
  - write_file
  - grep
  - run_command
tags:
  - ci
  - infrastructure
---

## Instructions

A new workflow is infrastructure. It gets the same scrutiny as code.

1. **Decide the trigger** precisely:
   - `pull_request` for PR gates.
   - `push` on `main` / `master` for post-merge checks.
   - `schedule` for nightlies — always include `workflow_dispatch` too,
     so you can run it on demand.
   - `workflow_call` if it's a reusable workflow.

2. **Scope permissions**. Default to the least:
   ```yaml
   permissions:
     contents: read
   ```
   Add `pull-requests: write` / `issues: write` / `id-token: write`
   only when the workflow actually needs them. Don't grant `write-all`.

3. **Pin third-party actions by SHA**, not tag. Tags are mutable:
   ```yaml
   - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
   ```

4. **Use a concurrency group** for triggers that can stampede:
   ```yaml
   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true
   ```

5. **Cache wisely**. `actions/setup-node@v4` + `cache: npm` is usually
   enough. Don't hand-roll a cache key unless you've measured a miss.

6. **Fail fast when you can**. `fail-fast: true` for matrix jobs that
   are redundant on failure (e.g., lint on three Node versions — one
   failure means all fail).

7. **Write the step names for humans**. "🧪 test matrix (ubuntu, node
   20)" beats "test-ubuntu-20".

8. **Don't echo secrets**. GitHub masks them in logs, but one ugly
   concatenation can still leak. Use `env:` blocks, not inline.

9. **Test the workflow**. Push to a branch and open a draft PR. Watch
   at least one full run before claiming done.
