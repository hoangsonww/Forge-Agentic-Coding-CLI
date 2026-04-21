---
name: de-slopify
description: Remove AI-writing tells from README, docs, and user-facing text. Must be done line-by-line, no regex. Use after agents write any user-visible prose.
---

Use the verbatim prompt at `.flywheel/prompts/de-slopify.md`.

Hard rule: **no regex, no scripts.** Read each line and revise
manually. Automation fails because fixes are context-dependent.

Strip: emdashes, "It's not just X, it's Y" contrasts, "Here's why"
lead-ins, "Let's dive in," "At its core," unnecessary hedges, forced
enthusiasm.

Preserve: technical specifics, command names, exact flag names,
actual counts. Strip tone, not information.
