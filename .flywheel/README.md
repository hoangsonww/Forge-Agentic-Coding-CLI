# `.flywheel/` — Forge's Agentic Coding Flywheel workspace

This directory is where the **planning** half of the Flywheel lives:
markdown plans, integration proposals, canonical operator prompts, and
the shared prompt library. The **execution** half lives in
[`.beads/`](../.beads/), and the end-to-end methodology is documented
in [`FLYWHEEL.md`](../FLYWHEEL.md).

## Layout

```
.flywheel/
  plans/           # iterated markdown plans (3k–6k+ lines each)
  proposals/       # integration proposals (studying external projects)
  prompts/         # reusable prompt modules (plan, synthesize, polish…)
  operators/       # the 8 canonical operators (plan-first-expansion, …)
```

## How the pieces connect

```
intent ─▶ plans/*.md ─▶ proposals/*.md? ─▶ .beads/beads.jsonl ─▶ swarm ─▶ src/
        (plan space)     (research space)    (bead space)      (code space)
             ▲                                                       │
             └───────────────── feedback, CASS mining ────────────────┘
```

- **plans/** — long, iterated markdown plans. One file per feature or
  epic. File naming: `YYYY-MM-DD-<slug>.md`
  (e.g. `2026-04-20-async-validation.md`). Each plan goes through
  multi-model synthesis and 4+ refinement rounds before becoming beads.
- **proposals/** — integration proposals when reimagining ideas from
  external projects (e.g. porting NATS-style patterns into Forge).
  Naming: `PROPOSAL_TO_INTEGRATE_<EXTERNAL>_INTO_FORGE.md`.
- **prompts/** — reusable prompt modules (`plan-initial.md`,
  `plan-synthesize-best-of-all-worlds.md`, …). Copy these verbatim
  into any frontier model UI.
- **operators/** — the 8 canonical Flywheel operators as
  drop-in prompt modules.

## Rules

- **Plans are committed.** They're the cheapest layer for global
  reasoning and the audit trail of architectural decisions.
- **Don't write pseudo-beads in markdown.** Once a plan is stable,
  convert it to real beads in `.beads/beads.jsonl` via the
  `/plan-to-beads` skill. After that, edit beads, not the plan.
- **Keep the plan for reference, not truth.** Once beads are polished,
  beads are the source of truth for execution.

## When to use each directory

| You have                                                | Put it in                          |
| ------------------------------------------------------- | ---------------------------------- |
| A rough idea you want a frontier model to expand        | `plans/`                           |
| A plan that's been through 3+ refinement rounds         | `plans/` (iterate in place)        |
| You want to port an idea from an external open project  | `proposals/`                       |
| A reusable prompt you want every coding agent to use    | `prompts/` or `operators/`         |
| Polished, executable work                               | **`.beads/beads.jsonl`** (not here) |

## Quick start

1. Read [`FLYWHEEL.md`](../FLYWHEEL.md).
2. Draft a plan:
   `cp .flywheel/prompts/plan-initial.md /tmp/my-prompt.md`, paste your
   intent, send to GPT Pro / Claude Opus / Gemini Deep Think.
3. Save each model's output into `plans/` as a separate file.
4. Synthesize: feed them all into the best-of-all-worlds prompt
   (`prompts/plan-synthesize-best-of-all-worlds.md`). Save the hybrid.
5. Refine 4–5 times (`prompts/plan-refine.md`) in fresh conversations.
6. Convert to beads with the `/plan-to-beads` skill.
7. Polish beads 4–6 times with `/polish-beads`.
8. Launch the swarm.
