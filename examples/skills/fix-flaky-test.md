---
name: fix-flaky-test
description: Reproduce, localize, de-flake, then guard against regression.
inputs:
  - test_name
  - iterations
tools:
  - read_file
  - edit_file
  - grep
  - run_tests
  - run_command
tags:
  - testing
  - reliability
---

## Instructions

Flakiness is a signal, not a nuisance. Don't just `@retry(3)` it.

1. **Reproduce**. Run the named test in a loop until you get both a pass
   and a fail. If you can't reproduce in 100 iterations, ask — maybe
   it's environmental (CI vs. local).

   ```bash
   # vitest
   for i in {1..100}; do npx vitest run -t "<test_name>" || break; done
   # pytest
   pytest -q -k "<test_name>" --count=100 -x
   # go test
   go test -run "<TestName>" -count=100 -race
   ```

2. **Localize**. Find the non-determinism:
   - Time: `Date.now()`, `time.Now()`, wall-clock assertions.
   - Ordering: dict/map iteration, `Promise.all` without ordering,
     goroutine scheduling.
   - Shared state: globals, singletons, a test that mutates the DB
     without rolling back.
   - External calls: network, filesystem, spawned processes.
   - Sleep-based waits: `setTimeout(100)` to "wait for async work".

3. **De-flake at the root**, not with retries:
   - Freeze the clock (`vi.useFakeTimers()`, `time.Now = mock`).
   - Sort before asserting on iteration order.
   - Use `await expect(...).toResolve()` patterns, not arbitrary sleeps.
   - Isolate shared state: one DB per test, transaction rollback, or a
     `beforeEach` reset hook.

4. **Guard**. Run the test 200× in a row after the fix. If it's still
   green, add a comment in the test pointing at the fix commit SHA so
   future-you knows why the extra ceremony is there.

5. **Scan for siblings**. Grep for the same pattern elsewhere in the
   test suite — flakes travel in packs.

Output a short report: reproducer command, root cause, fix commit, and a
grep list of files that might have the same issue.
