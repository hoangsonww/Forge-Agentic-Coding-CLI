# Operator 7 — Fungible swarm launch

**When:** beads are polished enough to execute and multiple agents
are about to work in the same repository.

**Failure mode it prevents:** launching too early before beads are
self-contained; making agent identity or role specialization
load-bearing.

---

[OPERATOR: fungible-swarm-launch]

1) Confirm readiness:
   - `AGENTS.md` and `CLAUDE.md` reflect current Forge invariants.
   - `.beads/beads.jsonl` has polished, self-contained beads with
     correct dependencies.
   - Your coordination surface (Agent Mail or file reservations via
     the `assigned_agent` field + commits) is ready.
2) Start agents **staggered** (≥ 30s apart) with
   `.flywheel/prompts/swarm-marching-orders.md` as the initial prompt.
3) Keep coordination in beads, reservations, and threads — never in a
   special "overseer" agent.

**Output (required):** an active swarm with claimed work, low
collision risk, and no special-agent bottleneck.
