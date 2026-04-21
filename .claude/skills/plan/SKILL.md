---
name: plan
description: Start a new Flywheel planning round for a Forge feature. Writes the initial markdown plan to .flywheel/plans/ and gives instructions for sending it to competing frontier models. Use at the very beginning of a new feature or subsystem.
argument-hint: <slug>
---

# /plan — start a new planning round

**This is plan space.** Before any code, before any beads, before any
agents. Resist the instinct to start implementing.

Slug: **$ARGUMENTS** (kebab-case; e.g. `async-validation` →
`.flywheel/plans/2026-04-20-async-validation.md`).

## Step 1 — Create the plan file

1. Today's date (UTC), then slug. Filename:
   `.flywheel/plans/<YYYY-MM-DD>-$ARGUMENTS.md`.
2. Copy the initial-plan prompt from
   `.flywheel/prompts/plan-initial.md` into a scratch area.
3. Fill in: intent, user workflows, constraints/invariants specific
   to this feature. Keep the Forge-wide invariants as-is (permission
   gate, `LEGAL_TRANSITIONS`, UI < 120 KB, etc.).

## Step 2 — Send to 3–4 frontier models independently

Ideally: GPT Pro (Extended Reasoning), Claude Opus on the web,
Gemini with Deep Think, and Grok Heavy. Each one solo, not combined.

## Step 3 — Save each output

Save each model's response to a separate file:

```
.flywheel/plans/<date>-$ARGUMENTS-gpt-pro.md
.flywheel/plans/<date>-$ARGUMENTS-opus.md
.flywheel/plans/<date>-$ARGUMENTS-gemini.md
.flywheel/plans/<date>-$ARGUMENTS-grok.md
```

## Step 4 — Synthesize

Run `/plan-synthesize` next. That skill feeds the competing plans
into GPT Pro to produce a single hybrid.

## Step 5 — Iterate

Run `.flywheel/prompts/plan-refine.md` in **fresh** GPT Pro
conversations. Typically 4–5 rounds until suggestions get
incremental. Plans routinely reach 3,000–6,000 lines — that's
correct, not slop.

## Step 6 — When to stop

Stop when:
- whole-workflow questions aren't moving around,
- architecture debates are settled,
- fresh models stop finding substantial missing features.

Then run `/plan-to-beads`.
