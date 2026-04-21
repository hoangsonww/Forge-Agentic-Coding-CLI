# Fix memory leak in `/events` SSE handler

## Context

Ops reports the API process's RSS grows ~50MB/hour and eventually OOMs
after ~18 hours. Restart clears it. Heap dumps show EventEmitter
listeners piling up on a singleton `eventBus`.

The suspect handler is `src/routes/events.ts#streamEvents`. It attaches
a listener to `eventBus` per client and — we think — doesn't detach on
disconnect.

## Tasks

- [ ] Reproduce locally. A load generator that opens and kills 1000 SSE
      clients in a loop should show the listener count climbing on
      `eventBus.listenerCount('event')`.
- [ ] Localize. Confirm the listener is the leak (vs. buffered chunks,
      vs. closure retention) using `--inspect` + Chrome DevTools heap
      snapshot, or `heapdump`.
- [ ] Fix at the root. Detach in the response's `close` event handler
      *and* ensure the handler is the same function reference passed to
      `on` and `off` (fat-arrow inline = new reference each time).
- [ ] Add a regression test: open 1000 SSE connections, close them,
      assert `listenerCount` returns to its baseline.
- [ ] Add a counter metric: `sse_active_listeners` gauge, updated on
      attach/detach.

## Non-goals

- Rewriting the SSE handler to use a library. Just fix the leak.
- Touching unrelated handlers even if they look similarly shaped.

## Acceptance criteria

- Reproducer that showed a growing listener count now shows a flat
  count after the fix.
- Regression test green.
- RSS stays flat for a 2-hour soak test.

## Open questions

- Is there an agreed graceful-shutdown path? The fix should cooperate
  with it.
