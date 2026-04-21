# `.beads/` — task graph for the Forge Flywheel

This directory holds the **bead graph** for Forge: self-contained work
units with dependencies, polished offline and then executed by a swarm
of coding agents. It's the "executable memory" layer of the
[Agentic Coding Flywheel](../FLYWHEEL.md).

## Layout

```
.beads/
  README.md              # this file
  beads.jsonl            # canonical task graph (JSONL, commits with code)
  beads.db               # local SQLite index (gitignored)
  archive/               # closed-epic archives (gitignored by default)
```

- `beads.jsonl` is the **source of truth**. Every bead — id, title,
  description, dependencies, priority, status, labels — is one JSON
  line. Commit it with your code.
- `beads.db` is a local SQLite cache built from the JSONL. It's
  gitignored because every agent rebuilds it from the JSONL on startup.
- `archive/` holds snapshots of completed epics. Keep locally; don't
  commit by default.

## Why flat JSONL?

- Diffs cleanly in PRs (each bead is one line).
- Every agent (Claude Code, Codex, Gemini CLI, Cursor) can read it
  natively — no vendor lock-in.
- Conflict resolution is trivial: two agents editing different beads
  touch different lines.

## Bead schema (minimum)

```jsonc
{
  "id": "fg-101",
  "title": "Rework executor turn-cap enforcement",
  "type": "task",                // task | bug | feature | epic | question | docs
  "status": "open",              // open | in_progress | blocked | closed
  "priority": 1,                 // 0=critical, 1=high, 2=medium, 3=low, 4=backlog
  "labels": ["core", "executor"],
  "depends_on": ["fg-95"],
  "blocks": [],
  "description": "Long-form markdown. Context, rationale, acceptance criteria, test obligations, failure modes.",
  "tests": [
    "unit: executor rejects a 6th turn when mode-policy cap is 5",
    "unit: cap exhaustion produces a structured ForgeRuntimeError"
  ],
  "created_at": "2026-04-20T00:00:00Z",
  "assigned_agent": null
}
```

The `description` field is where planning lives: acceptance criteria,
rationale, failure modes, and test obligations must be embedded so a
fresh agent can execute the bead without reopening the upstream
markdown plan.

## Prefix

Forge beads use the prefix **`fg-`** (e.g. `fg-1`, `fg-2`, …). Use it
consistently in:

- `beads.jsonl` `id` fields
- commit messages (`fg-12: rework executor turn caps`)
- file-reservation reasons in agent coordination layers
- cross-agent thread subjects (`[fg-12] executor turn caps`)

## Working with beads (any agent)

If you're using `br` / `bv` locally:

```bash
br list --status open --json
br ready --json                   # unblocked work
bv --robot-triage                 # PageRank/betweenness routing
bv --robot-next                   # next single pick
```

If you don't have `br` installed, the JSONL is still human- and
agent-readable. Any coding agent can `jq` it:

```bash
# next open, high-priority, unblocked bead
jq -c 'select(.status=="open" and .priority<=1)' .beads/beads.jsonl
```

## The flywheel

1. **Plan** in `.flywheel/plans/` (multi-model, iterated).
2. **Convert** the plan to beads in `beads.jsonl` using the
   `/plan-to-beads` skill.
3. **Polish** the beads 4–6 times (`/polish-beads`) until convergence.
4. **Swarm**: agents each claim a ready bead, reserve files, commit to
   `master`, mark the bead closed.
5. **Review + harden** (`/deep-review`, `/fresh-eyes`).
6. **Land** the session (`/landing`) — no work is complete until it's
   pushed.

See [`FLYWHEEL.md`](../FLYWHEEL.md) for the full methodology and the
skills at `.agents/skills/flywheel-*` for the prompts.
