# `.agents/` — portable agent skills

This directory follows the [Agent Skills](https://agentskills.io/specification)
open standard. Skills here are readable by any compliant coding agent
(Codex, Cursor, etc.) without tool-specific wiring.

Claude Code and Cursor-specific wiring lives in `.claude/` and
`.cursor/` respectively; Codex-specific wiring lives in `.codex/`. This
directory is the vendor-neutral layer.

## Layout

```
.agents/
  skills/
    verify/        — run Forge's full verification chain
    add-tool/      — scaffold a new src/tools/*.ts tool end-to-end
    add-provider/  — scaffold a new src/models/*.ts provider
    add-agent/     — scaffold a new src/agents/*.ts agent
    debug-loop/    — systematic playbook for loop bugs
    release-check/ — pre-tag checklist
```

Each skill is a directory with a `SKILL.md`. The `name` and
`description` front-matter fields are required; everything else in the
file is free-form instructions for the agent.

## Why duplicate this across `.claude/`, `.codex/`, and `.agents/`?

We don't — they reference the same playbooks. `.agents/` is the
canonical source; the other directories add tool-specific metadata
(permissions, execpolicy, subagent tool lists) on top.

If you update a skill, update the canonical copy here and the
tool-specific `SKILL.md` files if the instructions diverge. For most
skills they won't — the workflow is the same regardless of which agent
runs it.
