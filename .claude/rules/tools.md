---
paths:
  - "src/tools/**/*.ts"
---

# Tool authoring rules

- Every new tool registers in `src/tools/registry.ts` via `registerTool`.
- Tool schemas must declare `sideEffect` (`none` | `read` | `write` |
  `network` | `exec`) and `risk` (`low` | `medium` | `high` | `critical`).
  These drive the permission classifier — be honest.
- Every tool invocation must go through `requestPermission`
  (`src/permissions/manager.ts`). Never call the filesystem or shell
  directly from a tool without the gate.
- Paths must be resolved to realpath and confined via `src/sandbox/fs.ts`.
  No ad-hoc `path.resolve` + `fs.readFile` — use the sandboxed helpers.
- Shell commands go through `classifyCommandRisk` (`src/sandbox/shell.ts`).
  `critical` commands are hard-blocked; do not add bypasses.
- Prefer returning structured `{ ok, data }` / `{ ok: false, error }`
  objects. Reserve throws for programmer errors.
