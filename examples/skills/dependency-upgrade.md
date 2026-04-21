---
name: dependency-upgrade
description: Bump a single dependency with a regression check and changelog review.
inputs:
  - package
  - target_version
tools:
  - read_file
  - edit_file
  - grep
  - run_command
  - run_tests
  - web.fetch
tags:
  - maintenance
  - security
---

## Instructions

Dependency bumps are small changes with large blast radius. Do one at a
time.

1. **Read the changelog**. Fetch
   `https://github.com/<org>/<repo>/releases` or
   `https://www.npmjs.com/package/<name>?activeTab=versions`. Any
   breaking change between current and target? Any deprecations used in
   this codebase? grep for the deprecated symbol before continuing.

2. **Audit transitive changes**. `npm ls <package>`, `pnpm why
   <package>`, `cargo tree -i <name>`, `go mod graph | grep <name>`.
   If the dep is pulled in by others, their pins may constrain you.

3. **Bump, then verify in stages**:
   - Update `package.json` / `go.mod` / `Cargo.toml` / `pyproject.toml`.
   - Run the lockfile update (`npm install`, `pnpm i`, `cargo update -p
     <name>`, `poetry lock`).
   - Typecheck (if applicable). Fix breakages at the call sites.
   - Lint. Fix breakages.
   - Run the test suite. Fix breakages.
   - Run the project's integration / e2e suite if there is one.

4. **Security check**. `npm audit` / `pnpm audit` / `cargo audit`.
   New high-severity findings block the merge.

5. **Don't drag in other bumps**. If `npm install` wants to update
   transitive deps you didn't ask for, either pin them or file a
   follow-up — mixing bumps defeats the point.

6. **Document**. The commit message includes:
   - Old → new version.
   - Link to the release notes.
   - Any call-site changes and why.
   - A one-line note if perf / bundle size moved noticeably.
