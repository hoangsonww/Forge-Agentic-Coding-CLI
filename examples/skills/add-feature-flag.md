---
name: add-feature-flag
description: Wrap a code path behind a toggle with safe defaults.
inputs:
  - flag_name
  - default_value
tools:
  - read_file
  - edit_file
  - grep
  - run_tests
tags:
  - feature-flag
  - rollout
---

## Instructions

A flag is a commitment to remove it later. Write the rollback as you
write the code.

1. **Pick a name**. `kebab-case`. Noun, not verb. Scope it:
   `billing.cancel-v2`, `auth.oauth-device-flow`. A flag name that
   implies a default (`disable-*`) is a smell — use `enable-*` and
   default to `false`.

2. **Wire it in through the existing flag system**. Look for
   `isEnabled("...")` / `flags.get("...")` / `launchdarkly` /
   `growthbook` elsewhere in the codebase. Don't introduce a new system.

3. **Default safely**. New path starts `false` in production, `true` in
   tests. Wrap:
   ```ts
   const useNewPath = flags.isEnabled("billing.cancel-v2", {
     default: false,
   });
   if (useNewPath) {
     return cancelV2(order);
   }
   return cancelV1(order);
   ```

4. **Keep the call sites narrow**. One if-statement per flag if
   possible. Branching deep inside a function makes it hard to delete
   the flag later.

5. **Instrument**. Log which branch was taken (sampled). Without this
   you can't confirm the rollout is actually hitting the new path.

6. **Test both sides**. Parametrize the test on the flag:
   ```ts
   describe.each([true, false])('cancel (flag=%s)', (enabled) => { ... });
   ```

7. **Document the exit criteria**. Add a TODO with a date or a condition
   for removing the flag:
   ```ts
   // TODO(billing.cancel-v2): remove after 100% rollout, expected 2026-06-01
   ```

**Never**: use a flag as a permanent config knob. That's a config, not a
flag. Flags are temporary by definition.
