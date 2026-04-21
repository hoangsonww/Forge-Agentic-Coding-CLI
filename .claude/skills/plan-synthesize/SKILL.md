---
name: plan-synthesize
description: Synthesize competing plans from multiple frontier models into a single best-of-all-worlds hybrid. Use after /plan has produced 2+ competing plans in .flywheel/plans/.
---

# /plan-synthesize — best-of-all-worlds

Feed competing plans into a single GPT Pro session and produce a
hybrid that integrates the strongest ideas from every input.

## Workflow

1. **Pick a primary.** Choose the best of the competing plans as
   your "base" — usually GPT Pro's. Its content gets the git-diff
   revisions applied to it.

2. **Open the synthesis prompt.** Read
   `.flywheel/prompts/plan-synthesize-best-of-all-worlds.md`. Copy it
   into a fresh GPT Pro (web) conversation.

3. **Paste the base plan, then each competitor.** Label each
   clearly.

4. **Receive git-diff revisions.** GPT Pro will produce a list of
   diff-style changes integrating the best ideas.

5. **Apply in-place with Claude / Codex.** Use the prompt in
   `.flywheel/prompts/plan-integrate-synthesis.md`. The agent
   applies the diffs to `.flywheel/plans/<date>-<slug>-gpt-pro.md`
   (renaming it to `-hybrid.md` is a good practice) and reports
   which revisions it wholeheartedly agrees with, somewhat agrees
   with, or disagrees with.

6. **Iterate.** Use `.flywheel/prompts/plan-refine.md` in fresh GPT
   Pro conversations 4–5 more times until convergence.

7. **Sanity overshoot.** Once per synthesis, run
   `.flywheel/prompts/overshoot-mismatch-hunt.md` to catch elements
   the model silently dropped.

## Output

A single hybrid plan at
`.flywheel/plans/<date>-<slug>-hybrid.md`. This is the one you'll
feed into `/plan-to-beads`.
