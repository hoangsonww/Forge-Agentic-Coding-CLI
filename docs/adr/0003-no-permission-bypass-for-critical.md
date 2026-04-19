# 0003. `--skip-permissions` never bypasses critical risk

- Status: accepted
- Date: 2026-04-18
- Tags: security, permissions

## Context

Users want a fast path for CI and power use. `--skip-permissions` is the obvious flag. But a literal "skip all permissions" flag is a loaded gun: a small classification mistake or an LLM hallucinating `rm -rf` silently lands in prod.

## Decision

`--skip-permissions` skips **routine** prompts only. A prompt is routine iff `risk` ∈ {`low`, `medium`} AND `sideEffect` ∉ {`execute`, `network`}. Everything else always prompts, even when the flag is set.

`--non-interactive` exists for CI: it denies all would-be-interactive prompts rather than silently approving them. Pair with `--allow-files`, `--allow-shell`, etc., to pre-authorize specific categories.

## Consequences

- Positive: bypass mistakes are structurally impossible.
- Negative: aggressive CI usage needs explicit `--allow-*` flags. Acceptable tradeoff.
- Follow-ups: UI indicators for "would have been blocked" during dry-run mode.
