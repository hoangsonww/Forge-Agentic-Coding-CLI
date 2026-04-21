---
name: deep-review
description: Deep code review after beads have landed — random exploration + cross-agent review, alternating. Use every 30–60 min during active implementation, or after any epic lands.
---

# /deep-review — random-exploration × cross-agent

Self-review (inline, after each bead) catches most bugs in the code
an agent just wrote. Deep review catches the **boundary** bugs: code
one agent wrote being called wrong by another agent, integration
mismatches, and latent bugs in code no-one's been staring at.

## Prompts

Use the verbatim prompts at `.flywheel/prompts/deep-review.md`,
alternating Round A and Round B.

## How to run

- Pick 1–2 agents who just finished a bead. Don't stop the whole
  swarm.
- Send Round A to one, Round B to another.
- After they report, swap: send Round A to the second agent, Round B
  to the first.
- Continue until **two consecutive rounds** come back clean from
  different agents.

## What the two rounds find

- **Round A (random exploration):** latent bugs in utility modules,
  error paths, and edge branches that nobody has reviewed because
  nobody's been touching them.
- **Round B (cross-agent):** boundary mismatches between agents'
  code, root causes behind symptoms, "I trusted the other agent's
  assumption and they weren't thinking about X."

## If agents keep finding bugs after 4+ rounds

Back to bead space. Create fix-beads for the bug classes that keep
appearing. The real problem isn't the individual bug, it's the
pattern.
