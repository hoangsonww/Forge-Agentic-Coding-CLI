---
name: verify
description: Run the full Forge verification suite (format:check + lint + typecheck + build + test). Use this before claiming any task complete or before opening a PR.
---

# /verify — canonical pre-commit gate

Run the exact check sequence that CI runs, in the order that gives the
fastest failure signal. **Do not mark a task complete until every step
below passes.**

## Steps

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm test
```

## Rules

- If `format:check` fails, run `npm run format` and re-run the suite.
- If `lint` fails, fix the lint errors directly — never add
  `eslint-disable` without a comment explaining why.
- If `typecheck` or `build` fails, fix the types. No `as any` casts to
  silence the compiler.
- If `test` fails, read the failing test first, then the code under test.
  Never skip, `.only`, or comment out a test to make the suite green.
- All 249 tests across 43 files must pass. If you added logic, the count
  should go up, not stay flat.

## Report back

After the suite passes, print a one-line summary:

```
verify: format ✓ lint ✓ typecheck ✓ build ✓ test ✓ (N tests)
```

If anything failed, print which step and the first error. Do not claim
success unless every step passed.
