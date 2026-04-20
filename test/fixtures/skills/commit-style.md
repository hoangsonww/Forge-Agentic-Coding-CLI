---
name: conventional-commit
description: Enforce Conventional Commits for every commit message Forge drafts.
triggers: [commit, git]
---

When drafting a commit message, follow Conventional Commits:

- `feat(scope): …` for new user-facing behaviour
- `fix(scope): …` for bug fixes
- `refactor(scope): …` for internal restructuring with no behaviour change
- `docs(scope): …` for doc-only changes
- `test(scope): …` for test-only changes
- `chore(scope): …` for tooling / CI / housekeeping

Keep the first line under 72 characters. Do not prefix with an emoji.
