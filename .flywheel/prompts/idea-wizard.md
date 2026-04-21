# Idea-Wizard — 30 → 5 → 15 funnel for existing-project features

**Use with:** Claude Code or Codex, on an existing, mature Forge
install. Not for greenfield projects.

**Why the funnel works:** generating 30 then winnowing to 5 forces
critical evaluation in a way that asking for 5 directly never does.

---

## Phase 1 — Ground in reality

Read `AGENTS.md`. List all existing beads:

```bash
jq -c 'select(.status!="closed")' .beads/beads.jsonl | head -100
```

## Phase 2 — Generate 30, winnow to 5

Prompt:

> Come up with 30 ideas for improvements, enhancements, new features,
> or fixes for this project. Then winnow to your VERY best 5 and
> explain why each is valuable. Be sure each idea is novel against
> the existing bead graph and genuinely moves the Forge project
> forward (local-first, multi-agent, safe, fast). Use **ultrathink**.

## Phase 3 — Expand to 15

Prompt:

> OK and your next best 10 and why. For each of these 10, verify
> against the existing beads that the idea isn't already captured or
> adjacent to open work.

## Phase 4 — Human review

You pick which of the 15 to pursue.

## Phase 5 — Turn selections into beads

Prompt:

> Create beads in `.beads/beads.jsonl` for the following selected
> ideas: <list>. For each one, embed full description, rationale,
> acceptance criteria, test obligations, and dependencies. Use the
> `fg-` prefix. Use **ultrathink**.

## Phase 6 — Polish

Run `/polish-beads` (see `polish-beads.md`) 4–5 times.
