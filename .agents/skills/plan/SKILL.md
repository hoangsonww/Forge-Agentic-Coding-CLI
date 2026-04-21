---
name: plan
description: Start a new Flywheel planning round. Produce initial markdown plan, route to competing frontier models, synthesize hybrid, refine 4–5×. Use before any coding begins on a new feature.
---

Plan space. Before any code, before any beads.

1. Create `.flywheel/plans/<YYYY-MM-DD>-<slug>.md`.
2. Copy `.flywheel/prompts/plan-initial.md` as the prompt template.
   Fill in intent, workflows, and feature-specific constraints.
3. Send independently to 3–4 frontier models (GPT Pro, Opus, Gemini
   Deep Think, Grok Heavy). Save each output separately:
   `<date>-<slug>-<model>.md`.
4. Synthesize: use
   `.flywheel/prompts/plan-synthesize-best-of-all-worlds.md` with
   GPT Pro to produce a hybrid plan
   (`<date>-<slug>-hybrid.md`).
5. Apply diffs in Claude Code / Codex with
   `.flywheel/prompts/plan-integrate-synthesis.md`.
6. Refine 4–5× in **fresh** GPT Pro conversations using
   `.flywheel/prompts/plan-refine.md`. Stop when suggestions become
   small and corrective.

Plans at 3k–6k lines are normal and correct. When stable, run the
`plan-to-beads` skill.
