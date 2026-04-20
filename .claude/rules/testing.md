---
paths:
  - "test/**/*.ts"
  - "src/**/*.test.ts"
---

# Testing rules

- Runner: **vitest**. Run one file with
  `npx vitest run test/unit/<file>.test.ts`.
- 249 tests across 43 files must remain 100% green. Never skip or `.only` a
  test when committing.
- **Never** make real network calls in unit tests. Mock with `vi.mock`. See
  `test/unit/executor-loop.test.ts` for the `callModel` stub pattern and
  `test/unit/adapter.test.ts` for the provider stub pattern.
- Use tempdirs (`os.tmpdir()` + `fs.mkdtempSync`) for anything that writes
  to disk, and clean up in `afterEach`. See
  `test/unit/validation-gate.test.ts`.
- Test names describe behaviour, not implementation:
  "should reject task when provider is unreachable", not "calls
  provider.ping once".
- When you add logic to `src/core`, `src/agents`, or `src/tools`, a unit
  test is required, not optional.
