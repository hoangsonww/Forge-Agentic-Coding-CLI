---
name: add-tool
description: Scaffold a new Forge tool end-to-end — type, implementation, registration, permission/risk classification, and unit test. Use when adding anything to src/tools/.
argument-hint: <tool-name-kebab-case>
---

# /add-tool — add a new Forge tool

Adding a tool touches four places. Do all four in one change, or the tool
is half-registered.

Tool name: **$ARGUMENTS** (kebab-case, e.g. `read-manifest`).

## 1. Implementation — `src/tools/$ARGUMENTS.ts`

- Import `Tool` from `../types` and `ForgeRuntimeError` from
  `../types/errors`.
- Define a `zod` schema for input and output.
- Declare **both** metadata fields on the tool schema:
  - `sideEffect`: `none | read | write | network | exec`
  - `risk`: `low | medium | high | critical`
- Route every filesystem access through `src/sandbox/fs.ts` helpers.
- Route every shell command through `src/sandbox/shell.ts` +
  `classifyCommandRisk`.
- Request permission via `requestPermission` from
  `src/permissions/manager.ts` **before** the side-effecting call, not
  after.
- Return `{ ok: true, data }` / `{ ok: false, error }`. Throw only for
  programmer errors.

## 2. Registration — `src/tools/registry.ts` (indirectly)

Follow the existing pattern used by sibling tools: export a `register`
helper or a `tool` constant and wire it up wherever `registerTool` is
called at startup. Read one existing tool (e.g. `src/tools/read-file.ts`)
before writing yours.

## 3. Unit test — `test/unit/$ARGUMENTS.test.ts`

At minimum, cover:

- happy path with valid input
- invalid input (zod rejection)
- permission denied → structured error, not throw
- path-escape attempt is refused by the sandbox
- (if shell) critical command is hard-blocked

Use `vi.mock` for the permission manager and sandbox boundaries. No
real filesystem writes outside `os.tmpdir()`.

## 4. Documentation

If the tool is user-visible, add a row to the tools table in
`docs/ARCHITECTURE.md` (it lists all 18 tools today). Update the count in
`README.md` "At a glance" if it changed.

## Verification

Run `/verify` when you're done. The test count should increase by the
number of tests you added.
