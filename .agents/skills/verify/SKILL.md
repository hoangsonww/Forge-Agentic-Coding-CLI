---
name: verify
description: Run Forge's canonical verification chain (format:check + lint + typecheck + build + test). Use before claiming any task complete or opening a PR.
---

Run the checks in order; stop at the first failure.

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm test
```

All 249 tests across 43 files must remain green. If you added logic to
`src/core`, `src/agents`, or `src/tools`, the count should increase.

On success, print one line:

```
verify: format ✓ lint ✓ typecheck ✓ build ✓ test ✓ (N tests)
```

On failure, print which step failed and the first error line. Do not
claim success unless every step passed.
