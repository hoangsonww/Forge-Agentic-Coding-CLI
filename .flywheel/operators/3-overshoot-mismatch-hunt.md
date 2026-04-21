# Operator 3 — Overshoot mismatch hunt

**When:** review output looks too short or self-satisfied; a large
plan or bead graph still feels under-audited.

**Failure mode it prevents:** shallow passes that find the first
~20 issues and stop.

---

[OPERATOR: overshoot-mismatch-hunt]

1) Tell the model it likely missed a large number of issues (80+).
2) Make it compare the artifact against prior feedback or source
   material again.
3) Require another full pass rather than a small patch list.

**Output (required):** an expanded list of missed elements,
contradictions, and corrections.

See `.flywheel/prompts/overshoot-mismatch-hunt.md` for the verbatim
prompt.
