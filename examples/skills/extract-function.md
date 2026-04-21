---
name: extract-function
description: Safely hoist a block of code into a reusable helper, without changing behavior.
inputs:
  - file
  - line_range
  - new_name
tools:
  - read_file
  - edit_file
  - apply_patch
  - grep
  - run_tests
tags:
  - refactor
---

## Instructions

This is a behavior-preserving refactor. The tests must pass at every
step; if they don't, revert and investigate.

1. **Capture behavior first**. Run the existing tests and note which
   ones cover the extracted block. If coverage is thin, add a
   characterization test before touching the code.

2. **Identify the interface**:
   - What variables does the block *read* from its enclosing scope?
     Those become parameters.
   - What does the block *write* or *return*? That's the return type.
   - Does it throw? Preserve the exception contract.
   - Does it have side effects (IO, mutation)? Keep them explicit —
     don't hide them behind an innocuous name.

3. **Extract**:
   - New function gets the same signature shape as its closest cousin
     in the file.
   - Name it for what it *does*, not for what it *contains*.
     `validateCheckoutInput` > `helper1`.
   - Default visibility: private to the file. Export only if a second
     caller already exists.

4. **Replace in place**. The original call site becomes a single call
   to the new function. Diff should be tiny.

5. **Run tests**. If red, revert and investigate — don't patch forward.

6. **Look for duplicates**. Grep the file for similar blocks; hoist them
   to the same helper if they're truly identical.

**Don't**:
- Change the interface while extracting (e.g., swap positional args for
  an options object). Do that in a separate commit.
- Rename adjacent variables "while you're there". Scope discipline.
- Introduce a new abstraction layer. One caller + one extraction =
  one function, not a class.
