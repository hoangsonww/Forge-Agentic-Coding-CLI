---
name: debug-race-condition
description: Systematic reproduce + fix for a suspected data race.
inputs:
  - symptom
  - repro_command
tools:
  - read_file
  - edit_file
  - grep
  - run_tests
  - run_command
tags:
  - debugging
  - concurrency
---

## Instructions

Races are timing-dependent, not random. The trick is pinning down *what*
must be ordered and making that ordering explicit.

1. **Confirm it's a race**, not a non-deterministic-output bug. Symptoms
   that point to a race: "fails under load", "fails in CI but not
   locally", "fails more often on fewer-core machines", corrupt counts,
   lost updates.

2. **Turn on the detectors**:
   - Go: `go test -race ./...` (non-optional for this skill).
   - Rust: `cargo test -- --test-threads=1` to isolate, then run
     under `miri` or ThreadSanitizer.
   - C/C++: compile with `-fsanitize=thread`.
   - Node: `async_hooks` + `perf_hooks` traces; there's no ThreadSan
     equivalent, but most Node "races" are actually async ordering
     bugs — see step 5.

3. **Reproduce with amplification**. Loop the repro 100–1000× with
   varying thread counts. If the race needs load, use `parallel` or
   `xargs -P`.

4. **Localize**. The race is between two specific accesses to a shared
   piece of state. Name them both:
   - Writer A: `order.status = "paid"` in `handlePayment`.
   - Reader B: `if (order.status === "paid")` in `expireStale`.
   If A and B aren't ordered by a mutex / channel / actor boundary,
   you've found the race.

5. **For Node / async**: the race is usually "I awaited X in the wrong
   order" or "I didn't await X at all". Look for:
   - Missing `await` before a Promise.
   - `Promise.all` where `Promise.allSettled` was meant.
   - Shared mutable state across overlapping async operations.

6. **Fix**:
   - Prefer to *remove* shared state over adding a lock.
   - If you must lock, keep the critical section tiny.
   - Prefer channels / message passing over mutexes when the language
     supports it idiomatically (Go, Elixir, actor systems).

7. **Guard**. Add a regression test that stresses the exact pattern.
   It must fail without the fix and pass with it. Pin the fix commit
   SHA in a comment.
