---
name: deep-review
description: Deep review — random exploration + cross-agent review, alternating. Finds integration bugs that self-review misses. Run every 30–60 min during active implementation.
---

Use the verbatim prompts at `.flywheel/prompts/deep-review.md`,
alternating Round A (random exploration) and Round B (cross-agent
review).

Run this on 1–2 agents who just finished a bead, not the whole
swarm. Continue until two consecutive rounds from different agents
come back clean.

If agents keep finding bugs after 4+ rounds, the real issue is a
pattern — go back to bead space and create fix-beads for the bug
class.
