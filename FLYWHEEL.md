# FLYWHEEL.md — The Forge Agentic Coding Flywheel

Forge's default methodology for shipping any non-trivial change:
**plan obsessively in markdown, translate polished plans into
self-contained beads, and only then let a swarm execute.**

This document is the operating manual. It explains how the pieces
inside `.flywheel/`, `.beads/`, `.claude/`, `.codex/`, `.cursor/`,
and `.agents/` fit together, and what rituals to run at each phase.

Based on the methodology described at
[agent-flywheel.com](https://agent-flywheel.com), adapted for a
TypeScript runtime repo.

---

## TL;DR

1. **Plan** a feature end-to-end in
   [`.flywheel/plans/`](.flywheel/plans/) using multiple frontier
   models. Synthesize to a single hybrid. Iterate 4–5 refinement
   rounds in fresh conversations.
2. **Convert** the polished plan to self-contained beads in
   [`.beads/beads.jsonl`](.beads/) via the `/plan-to-beads` skill.
3. **Polish** the beads 4–6 rounds via `/polish-beads`. "Check your
   beads N times, implement once."
4. **Swarm**: multiple coding agents (Claude Code, Codex, Cursor,
   Gemini CLI) each claim an unblocked bead, reserve files through
   commits, and mark beads closed when done.
5. **Review + harden** (`/deep-review`, `/fresh-eyes`,
   `/reality-check`).
6. **Land** the session (`/landing`). Work is not complete until
   `git push` succeeds.

---

## Three reasoning spaces

The whole methodology rests on keeping three artifacts and three
modes of thinking distinct.

| Space          | Artifact                                 | Decides                                                           |
| -------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| **Plan space** | `.flywheel/plans/*.md`                   | Architecture, features, workflows, tradeoffs — whole system fits  |
| **Bead space** | `.beads/beads.jsonl`                     | Task boundaries, dependencies, embedded context for agents        |
| **Code space** | `src/` + `test/`                         | Implementation and verification                                   |

**If you're still redesigning the product, stay in plan space.**
If you're packaging work for execution, move to bead space. If the
plan constrains the high-level decisions, code space becomes
mechanical.

### Why planning gets ~85% of the time

A 4,000-line markdown plan fits in a frontier model's context window.
A 50,000-line codebase does not. Planning tokens are cheap;
implementation tokens are expensive. Every round of plan refinement
evaluates system-wide consequences; every improvement to the plan
gets amortized across every downstream bead and code change.

Catching a bug in plan space is ~1×. In bead space, ~5×. In code
space, ~25×. Plan space is the cheapest place to buy correctness.

---

## Directory map

```
.
├── FLYWHEEL.md                   # this file
├── AGENTS.md                     # agent-neutral operating manual
├── CLAUDE.md                     # Claude Code-specific operating manual
│
├── .flywheel/                    # planning workspace
│   ├── plans/                    # iterated markdown plans (3k–6k lines)
│   ├── proposals/                # external-project integration proposals
│   ├── prompts/                  # reusable prompt modules
│   └── operators/                # the 8 canonical operators
│
├── .beads/                       # task graph (executable memory)
│   ├── beads.jsonl               # one bead per line, commits with code
│   ├── beads.db                  # local SQLite index (gitignored)
│   └── archive/                  # closed-epic archives (gitignored)
│
├── .claude/                      # Claude Code: settings, rules, skills, agents
├── .codex/                       # Codex: config, execpolicy, skills, agents
├── .cursor/                      # Cursor: .mdc rules
└── .agents/                      # portable skills (agentskills.io spec)
```

---

## Phase 1 — Plan

**When:** any new feature, subsystem, or major refactor. Any time a
change touches 3+ hot-path files (`src/core/loop.ts`,
`src/agents/executor.ts`, `src/core/mode-policy.ts`,
`src/core/validation.ts`, `src/models/router.ts`,
`src/models/adapter.ts`, `src/persistence/tasks.ts`) or introduces a
new tool / provider / agent.

**Skill:** `/plan`.

### Before you start — foundation bundle

- `AGENTS.md` and `CLAUDE.md` are current and coherent.
- Tech stack is settled (TypeScript, Node 20+, `undici`, `zod`,
  `better-sqlite3`, `commander`, vitest — see `package.json`).
- The human has written a rough statement of intent.

### Workflow

1. Copy `.flywheel/prompts/plan-initial.md` as a template.
2. Fill in intent, user workflows, and feature-specific constraints.
3. Send independently to multiple frontier models: GPT Pro, Claude
   Opus on the web, Gemini with Deep Think, Grok Heavy. One chat
   each, no cross-contamination.
4. Save each output:
   `.flywheel/plans/<YYYY-MM-DD>-<slug>-<model>.md`.

### Why multi-model

Different frontier models have different tastes and blind spots. The
cheapest way to buy architectural robustness is to pass a plan
through a gauntlet of 3–4 models.

---

## Phase 2 — Synthesize

**Skill:** `/plan-synthesize`.

1. Feed the competing plans into GPT Pro via
   `.flywheel/prompts/plan-synthesize-best-of-all-worlds.md`.
2. GPT Pro returns git-diff-style revisions against the base plan.
3. Apply them in Claude Code or Codex with
   `.flywheel/prompts/plan-integrate-synthesis.md`. The agent
   reports which revisions it wholeheartedly agrees with, somewhat
   agrees with, or disagrees with.
4. Save the result as
   `.flywheel/plans/<YYYY-MM-DD>-<slug>-hybrid.md`.

---

## Phase 3 — Refine (4–5× in fresh conversations)

**Prompt:** `.flywheel/prompts/plan-refine.md`.

**Fresh conversation each round.** This is load-bearing — fresh
sessions prevent the model from anchoring on its own prior output.

Typical arc:

| Round | Character                                                  |
| ----- | ---------------------------------------------------------- |
| 1–2   | Major additions, architectural shifts                      |
| 3–4   | Interface improvements, boundary refinements               |
| 5     | Edge cases, test obligations, nuanced failure modes        |

Stop when suggestions become small and corrective. If a round
feels too short, run the overshoot mismatch hunt
(`.flywheel/prompts/overshoot-mismatch-hunt.md`) — claim the model
missed 80+ things and force another exhaustive pass.

Plans routinely reach 3,000–6,000 lines. That's correct, not slop.

---

## Phase 4 — Plan → beads

**Skill:** `/plan-to-beads`.

Translate the hybrid plan into `.beads/beads.jsonl`. Self-contained
beads, full dependency structure, embedded tests.

### Bead schema (minimum)

```jsonc
{
  "id": "fg-42",
  "title": "Rework executor turn-cap enforcement",
  "type": "task",
  "status": "open",
  "priority": 1,
  "labels": ["core", "executor"],
  "depends_on": ["fg-35"],
  "blocks": [],
  "description": "Long-form markdown. Background, rationale, acceptance criteria, failure modes, Forge invariants touched.",
  "tests": [
    "unit: rejects 6th turn when mode-policy cap is 5",
    "unit: cap exhaustion raises a ForgeRuntimeError (retryable=false)"
  ],
  "created_at": "2026-04-20T00:00:00Z",
  "assigned_agent": null
}
```

The `description` must be rich enough that a fresh agent can execute
the bead **without reopening the plan**.

---

## Phase 5 — Polish beads (4–6×)

**Skill:** `/polish-beads`.

Every polish round is ~100× cheaper than finding the same issue
during implementation. Underinvesting here is the #1 root cause of
later pain.

Each round, check:

1. **Self-containment.** Can a fresh agent execute without the plan?
2. **Dependencies.** Correct? Missing edges? Cycles?
3. **Tests.** Concrete, with logging expectations?
4. **Coverage.** Every plan feature → a bead; every bead → plan
   backing. Use Operator 4
   (`.flywheel/operators/4-plan-to-beads-transfer-audit.md`).
5. **Duplicates.** Merge with `/dedupe-beads` if ≥ 20 new beads just
   arrived.
6. **Forge invariants.** Permission gate, `LEGAL_TRANSITIONS`, UI
   < 120 KB, provider probes ~1.5 s.

### Convergence signals

Stop when **two consecutive rounds** produce only small corrective
edits. If polishing has flatlined earlier than that, switch to
`/fresh-eyes` (new session, no context baggage).

As a final round, run through a **different model** (Claude → Codex
or vice versa). Different models catch different things.

---

## Phase 6 — Swarm

Once beads have converged, launch a swarm. Each coding agent gets
the marching-orders prompt
(`.flywheel/prompts/swarm-marching-orders.md`) and starts work.

### Coordination surface

Forge doesn't require Agent Mail or any specific coordination
daemon. The minimum viable surface:

- `.beads/beads.jsonl` is the task graph. Agents read it, pick an
  open, unblocked bead, mark it `in_progress` with their identity in
  `assigned_agent`, and commit to `master`.
- Commit messages reference the bead id: `fg-12: rework executor
  turn caps`.
- Every agent re-reads `AGENTS.md`, `CLAUDE.md`, and `FLYWHEEL.md`
  at session start and after any compaction.

If you run richer coordination (Agent Mail, file-reservation
services, NTM), layer it on top — but don't make it load-bearing.
The JSONL + commits + `AGENTS.md` trio is the durable substrate.

### Thundering herd

Stagger agent starts by ≥ 30 seconds. Having 5 agents all simultaneously
re-read AGENTS.md and query for work produces avoidable collisions.

### Agent fungibility

Every agent is a generalist. No "role specialization." No
"ringleader." If an agent crashes or gets rate-limited, any other
agent can pick up its in-progress bead. The coordination lives in
the artifacts, not in any specific agent's identity.

### Sample prompt sequence per bead

1. Agent reads the bead.
2. Agent confirms dependencies are all closed.
3. Agent runs `/verify` as a sanity pre-check.
4. Agent implements.
5. Agent runs `/verify` again.
6. Agent **self-reviews** with the fresh-eyes prompt inline.
7. Agent commits (`fg-NN: <summary>`) and pushes.
8. Agent marks the bead closed in `.beads/beads.jsonl` with a
   one-line `closed_reason`.
9. Agent picks the next ready bead.

---

## Phase 7 — Review & harden

- **Self-review after each bead** (agents do this automatically if
  AGENTS.md tells them to).
- **`/deep-review`** every 30–60 minutes — random exploration +
  cross-agent review, alternating. This catches boundary bugs that
  self-review can't.
- **`/reality-check`** at natural milestones. "If we implement all
  open beads, do we actually have the thing we set out to build?"
- **`/fresh-eyes`** whenever review has flatlined.

For user-facing prose, run **`/de-slopify`** line by line.

---

## Phase 8 — Land the plane

**Skill:** `/landing`. User-invocable only.

- Every thread of unfinished work has a new open bead.
- `/verify` is green.
- Closed beads updated with `closed_reason`.
- Commits are logically grouped, bead-referenced.
- `git pull --rebase && git push`. `git status` clean.
- One-line session report.

A future swarm should be able to resume using only
`.beads/beads.jsonl`, `AGENTS.md`, and `FLYWHEEL.md` — no human
re-explanation required.

---

## The Kernel: 9 invariants

1. **Global reasoning belongs in plan space.** Do the hardest
   architectural reasoning while the whole system still fits.
2. **The markdown plan must be comprehensive before coding starts.**
3. **Plan-to-beads is a distinct translation problem.** A good plan
   does not automatically produce a good bead graph.
4. **Beads are the execution substrate.** Once polished, they carry
   enough context that agents no longer need the full plan.
5. **Convergence matters more than first drafts.** Plans and beads
   improve through repeated polishing.
6. **Swarm agents are fungible.** Coordination lives in artifacts
   and tools, never in any special agent.
7. **Coordination must survive crashes and compaction.** AGENTS.md,
   bead state, and commits exist to keep work moving when sessions
   die.
8. **Session history is part of the system.** Repeated prompts,
   failures, and recoveries fold back into skills, rules, and
   tooling (Operator 8).
9. **Implementation is not the finish line.** Review, testing,
   hardening, and feedback-to-infrastructure loops are part of the
   core method.

---

## Mapping to the existing Forge infrastructure

| Flywheel concept              | Where it lives in Forge                                |
| ----------------------------- | ------------------------------------------------------ |
| Markdown plans                | `.flywheel/plans/`                                     |
| Beads (task graph)            | `.beads/beads.jsonl`                                   |
| Operators                     | `.flywheel/operators/`                                 |
| Prompt library                | `.flywheel/prompts/`                                   |
| Invocable skills              | `.claude/skills/`, `.codex/skills/`, `.agents/skills/` |
| Path-scoped rules             | `.claude/rules/`, `.cursor/rules/`                     |
| Execpolicy / permission rules | `.claude/settings.json`, `.codex/rules/default.rules`  |
| Subagents                     | `.claude/agents/`, `.codex/agents/`                    |
| AGENTS.md blurbs              | `AGENTS.md`, `CLAUDE.md`                               |

---

## Operator quick reference

1. **plan-first-expansion** — stay in plan space longer.
2. **competing-plan-triangulation** — multiple frontier models.
3. **overshoot-mismatch-hunt** — force exhaustive review.
4. **plan-to-beads-transfer-audit** — nothing lost in translation.
5. **convergence-polish-loop** — polish until stable.
6. **fresh-eyes-reset** — new session kills local minima.
7. **fungible-swarm-launch** — staggered, artifact-coordinated.
8. **feedback-to-infrastructure-closure** — lessons → skills/rules.

Full text: `.flywheel/operators/`.

---

## Common anti-patterns

- **Single-pass beads.** First drafts are never optimal. 4+ polish
  rounds minimum.
- **Pseudo-beads in markdown.** Go from plan directly to real JSONL
  entries. Never write bead-like bullets in a separate document.
- **Skipping plan-to-bead validation** (Operator 4). Features get
  silently dropped.
- **Communication purgatory.** Agents messaging each other instead
  of picking up ready beads.
- **Holding file-level coordination too long.** Reserve only while
  actively editing. Commit early, commit often.
- **Skipping the AGENTS.md re-read after compaction.** The single
  most common intervention in the methodology.
- **Worktrees per agent.** Don't. Single branch, frequent commits,
  advisory coordination.

---

## When the "foregone conclusion" breaks down

If you find yourself doing heavy cognitive work during
implementation, that's a signal. Specifically:

- **Vague beads** → agents improvise, produce inconsistent
  implementations. Fix: polish beads more.
- **Missing dependencies** → agents work on tasks whose
  prerequisites aren't done. Fix: Operator 4.
- **Thin AGENTS.md** → agents produce non-idiomatic code. Fix: add
  the missing blurb.
- **No coordination surface** → agents step on each other. Fix:
  reserve commit cadence + bead status updates at minimum.

Remedy is always the same: **pause implementation, go back to bead
space, and add the missing detail.** You can't catch up by coding
harder.

---

## Related docs

- [`AGENTS.md`](AGENTS.md) — agent-neutral operating manual
- [`CLAUDE.md`](CLAUDE.md) — Claude Code-specific
- [`.beads/README.md`](.beads/README.md) — bead schema and tooling
- [`.flywheel/README.md`](.flywheel/README.md) — planning workspace
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Forge internals
