# Swarm marching orders

**Use with:** every agent in the swarm as their initial prompt.
Stagger starts by 30+ seconds.

---

First read ALL of the `AGENTS.md`, `CLAUDE.md`, `FLYWHEEL.md`, and
`README.md` files super carefully and understand ALL of them. Then
use your code-investigation mode to fully understand the Forge code,
its technical architecture, and its purpose.

Introduce yourself to the other agents via whatever coordination
layer this repo supports (Agent Mail if configured; otherwise use
`.beads/beads.jsonl` + clear commit messages + the bead `assigned_agent`
field as the coordination surface).

Be sure to check for messages and promptly respond if needed; then
proceed meticulously with your next assigned beads, working on tasks
systematically and tracking progress via beads.

Don't get stuck in "communication purgatory" where nothing is getting
done. Be proactive about starting tasks that need doing; inform your
fellow agents when you do so and mark beads appropriately.

When you're not sure what to do next, query `.beads/beads.jsonl` for
the most impactful unblocked bead. Pick the next one you can usefully
work on and start immediately. Before editing a file, either reserve
it (if a coordination layer supports that) or check that no other
agent has marked a touching bead as `in_progress` in the last 30
minutes.

Hard rules:

- Respect everything in `AGENTS.md` and `CLAUDE.md`.
- Every tool change goes through `requestPermission`.
- Every state transition stays in `LEGAL_TRANSITIONS`.
- Run `/verify` before marking a bead closed.
- Commit messages reference the bead id: `fg-12: <short summary>`.

Use **ultrathink**.
