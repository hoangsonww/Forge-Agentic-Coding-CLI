---
paths:
  - "src/**/*.ts"
  - "test/**/*.ts"
---

# TypeScript rules

- Strict mode is on. Never use `any` in production code without a comment
  explaining why. The one accepted exception is `src/tools/registry.ts`
  (heterogeneous tool signatures erased behind `Tool<any, any>`).
- Prefer `readonly` and immutable data flow. Prefer function modules over
  classes, except where a provider-style shape is already established
  (`src/models/*` provider classes).
- Return `Result<T, E>`-shaped objects for expected failures. Throw only for
  programmer errors or genuinely exceptional conditions.
- Throw `ForgeRuntimeError` (`src/types/errors.ts`) with a `class`,
  `message`, `retryable`, and optional `recoveryHint` — not bare `Error`.
- Comments explain **why**, not what. Delete comments that only narrate the
  code. Never leave a comment describing the change you just made.
- Named exports only where the module already uses them; follow the file's
  existing convention.
