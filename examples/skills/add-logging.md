---
name: add-logging
description: Instrument a function with structured logs at the right boundaries.
inputs:
  - target
  - level
tools:
  - read_file
  - edit_file
  - grep
  - run_tests
tags:
  - observability
  - debugging
---

## Instructions

Bad logging is worse than no logging — it trains people to ignore the
signal. Add logs at boundaries, not at every line.

**Where to log**:
- Entry + exit of public functions (one line each, with duration).
- Before and after any network/db call (record outcome + latency).
- Every `catch` block (error, stack, relevant context).

**Where NOT to log**:
- Inside tight loops (unless level = trace and the loop is cold).
- Private helpers called from a logged public function.
- Successful cases of high-frequency operations (one line per request
  is fine; one per loop iteration is not).

**Shape**:
- Structured JSON where the logger supports it (`slog` for Go, `winston`
  / `pino` for Node, `structlog` for Python).
- Every line has: `level`, `msg`, `request_id` / `trace_id` (if known),
  and relevant ids (user_id, order_id).
- Never log: passwords, tokens, full request bodies, PII. Use the
  project's redaction helper if it has one.

**Levels**:
- `debug`: state transitions, query plans, cache hits/misses.
- `info`: request started/completed, scheduled job ran, feature flag
  flipped.
- `warn`: recoverable error, fallback taken, deprecation used.
- `error`: operation failed; include the error chain, not just the
  top-level message.

**Outcome**:
- Show the diff.
- Note any performance impact (structured logging + JSON serialization
  is measurable on hot paths — call it out if the target is hot).
- If the logger isn't set up yet, don't silently pick one; surface the
  choice ("suggest `pino`; OK to proceed?").
