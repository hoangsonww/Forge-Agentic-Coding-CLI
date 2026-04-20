---
name: verify
description: Run Forge's canonical verification chain (format:check + lint + typecheck + build + test). Use before claiming any task done or opening a PR.
---

# verify

Run the checks in order. Stop at the first failure and report which
step failed and the first error line.

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm test
```

All 249 tests across 43 files must pass. If you added logic to
`src/core`, `src/agents`, or `src/tools`, the count should increase.

On success, print a single line:

```
verify: format ✓ lint ✓ typecheck ✓ build ✓ test ✓ (N tests)
```
