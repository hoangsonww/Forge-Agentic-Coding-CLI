---
description: Tool authoring rules
globs:
  - "src/tools/**/*.ts"
---

# Tool authoring rules

- Every new tool registers in `src/tools/registry.ts`.
- Tool schemas must declare `sideEffect`
  (`none|read|write|network|exec`) and `risk`
  (`low|medium|high|critical`). These drive the permission
  classifier — be honest.
- Every tool invocation must go through `requestPermission`
  (`src/permissions/manager.ts`). No direct filesystem or shell calls.
- Paths resolved to realpath and confined via `src/sandbox/fs.ts`.
- Shell commands go through `classifyCommandRisk`
  (`src/sandbox/shell.ts`). `critical` is hard-blocked — do not add
  bypasses.
- Prefer `{ ok, data }` / `{ ok: false, error }` returns. Throw only
  for programmer errors, using `ForgeRuntimeError`.
