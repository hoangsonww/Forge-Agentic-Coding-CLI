---
description: Testing rules for vitest suite
globs:
  - "test/**/*.ts"
  - "src/**/*.test.ts"
---

# Testing rules

- Runner: **vitest**. Run one file:
  `npx vitest run test/unit/<file>.test.ts`.
- 249 tests across 43 files must remain 100% green. Never `.only`,
  skip, or comment out a test to make the suite pass.
- **Never** make real network calls in unit tests. Mock with
  `vi.mock`. See `test/unit/executor-loop.test.ts` for the
  `callModel` stub and `test/unit/adapter.test.ts` for the
  provider stub.
- Use tempdirs (`os.tmpdir()` + `fs.mkdtempSync`) for disk writes;
  clean up in `afterEach`. See `test/unit/validation-gate.test.ts`.
- Test names describe behaviour: "should reject task when provider is
  unreachable", not "calls provider.ping once".
- New logic in `src/core`, `src/agents`, or `src/tools` **requires**
  a unit test — not optional.
