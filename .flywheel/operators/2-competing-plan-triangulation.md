# Operator 2 — Competing-plan triangulation

**When:** the project is important enough that one model's biases are
dangerous, or early drafts feel plausible but not obviously excellent.

**Failure mode it prevents:** picking the first decent plan and
calling it done.

---

[OPERATOR: competing-plan-triangulation]

1) Collect independent plans from multiple strong frontier models
   (GPT Pro, Claude Opus, Gemini Deep Think, Grok Heavy). Save each
   to `.flywheel/plans/<date>-<slug>-<model>.md`.
2) Compare them for better ideas, missing concerns, and incompatible
   assumptions.
3) Integrate only the strongest elements into one revised plan using
   `.flywheel/prompts/plan-synthesize-best-of-all-worlds.md`.

**Output (required):** a single merged markdown plan plus explicit
notes on what changed and why.
