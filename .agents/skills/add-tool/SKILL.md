---
name: add-tool
description: Scaffold a new Forge tool end-to-end — implementation, registration, permission/risk metadata, sandbox routing, and a unit test.
---

A new tool touches four places. Do all four or the tool is half-registered.

## 1. `src/tools/<name>.ts`

- `zod` schemas for input and output.
- Declare **both** `sideEffect` (`none|read|write|network|exec`) and
  `risk` (`low|medium|high|critical`) on the schema. Be honest —
  these drive the permission classifier.
- All filesystem access goes through `src/sandbox/fs.ts` helpers.
- All shell commands go through `src/sandbox/shell.ts` +
  `classifyCommandRisk`.
- Request permission via `requestPermission`
  (`src/permissions/manager.ts`) **before** the side effect, not
  after.
- Return `{ ok: true, data }` / `{ ok: false, error }`. Throw only
  for programmer errors, and then use `ForgeRuntimeError`.

## 2. Registration

Wire it into the registry, following the pattern of an existing tool
like `src/tools/read-file.ts`.

## 3. `test/unit/<name>.test.ts`

Minimum coverage:

- happy path with valid input,
- zod rejection on invalid input,
- permission denied → structured error (not throw),
- sandbox refuses path-escape,
- (if shell) `critical` command hard-blocked.

Use `vi.mock` for the permission manager and sandbox boundaries. No
real filesystem writes outside `os.tmpdir()`.

## 4. Docs

If user-visible, update the tools table in `docs/ARCHITECTURE.md` and
the README "At a glance" count.

Finish with the `verify` skill.
