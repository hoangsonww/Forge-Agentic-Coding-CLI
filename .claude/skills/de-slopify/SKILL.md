---
name: de-slopify
description: Remove telltale AI-writing patterns from README, docs, and user-facing text. Must be done line-by-line, manually. No regex. Use after agents write any user-visible prose.
---

# /de-slopify

AI writing has tells. Emdashes. "It's not just X, it's Y." "Here's
why." Forced enthusiasm. Pseudo-profound openers. These patterns
signal "LLM wrote this" to readers and erode trust in the project.

## Prompt

Use the verbatim prompt at `.flywheel/prompts/de-slopify.md`.

## Hard rule

**No regex. No script.** Read each line. Revise each line
deliberately. Attempts to automate this pass fail, because the fixes
are context-dependent.

## When to run

- After an agent writes or substantially revises `README.md`.
- After any change to user-facing CLI help text, error messages, or
  the onboarding walkthrough.
- After generating release notes or `CHANGELOG.md` entries.

## What to preserve

Technical specifics, command names, exact flag names, actual counts
(tests, providers, tools). Strip tone tics, not information.
