---
name: add-tool
description: Scaffold a new Forge tool — implementation, registration, permission/risk metadata, sandbox routing, and a unit test. Use when adding anything to src/tools/.
---

# add-tool

Four places change. Do all four or the tool is half-registered.

1. **`src/tools/<name>.ts`** — the tool module.
   - `zod` schemas for input and output.
   - Declare `sideEffect` (`none|read|write|network|exec`) and `risk`
     (`low|medium|high|critical`). Be honest — these drive permission
     prompts and auto-approval.
   - All filesystem access via `src/sandbox/fs.ts` helpers.
   - All shell commands via `src/sandbox/shell.ts` +
     `classifyCommandRisk`.
   - Request permission via `requestPermission`
     (`src/permissions/manager.ts`) **before** the side effect.
   - Return `{ ok, data }` / `{ ok: false, error }`. Throw only for
     programmer errors, using `ForgeRuntimeError`.

2. **Registration** — wire into the registry following the pattern in
   an existing tool like `src/tools/read-file.ts`.

3. **`test/unit/<name>.test.ts`** — at minimum:
   - happy path,
   - zod rejection on invalid input,
   - permission denied → structured error (not throw),
   - path-escape refused by sandbox,
   - (if shell) critical command hard-blocked.

   Use `vi.mock` for the permission manager and sandbox boundaries.

4. **Docs** — if user-visible, update the tools table in
   `docs/ARCHITECTURE.md` and the README "At a glance" count.

Finish with the `verify` skill.
