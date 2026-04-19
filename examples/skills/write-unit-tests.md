---
name: write-unit-tests
description: Generate unit tests for a target file or function.
inputs:
  - file
  - framework
tools:
  - read_file
  - write_file
  - run_tests
  - grep
tags:
  - testing
  - quality
---

## Instructions

1. Read the target source file. Identify public API surface.
2. Detect the existing test framework (vitest, jest, pytest, go test, etc.).
   If none, ask before scaffolding one.
3. For each public function or class:
   - cover happy path
   - cover at least one edge case
   - cover one error path
4. Keep tests isolated — no network, no real filesystem when possible.
5. Run the test suite and only stop once it passes.
