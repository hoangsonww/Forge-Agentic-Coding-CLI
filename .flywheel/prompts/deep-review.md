# Deep review — random exploration + cross-agent

**Use with:** 1–2 agents at a time, after several beads have landed.
Alternate the two prompts until two consecutive rounds come back
clean.

---

## Round A — Random exploration

I want you to sort of randomly explore the code files in this project,
choosing code files to deeply investigate and understand and trace
their functionality and execution flows through the related code files
which they import or which they are imported by.

Once you understand the purpose of the code in the larger context of
the workflows, I want you to do a super careful, methodical, and
critical check with "fresh eyes" to find any obvious bugs, problems,
errors, issues, silly mistakes, etc. and then systematically and
meticulously and intelligently correct them.

Be sure to comply with ALL rules in `AGENTS.md`, `CLAUDE.md`, and the
path-scoped `.claude/rules/` / `.cursor/rules/` files. Use
**ultrathink**.

---

## Round B — Cross-agent review

Now turn your attention to reviewing the code written by your fellow
agents and checking for any issues, bugs, errors, problems,
inefficiencies, security problems, reliability issues, etc. and
carefully diagnose their underlying root causes using first-principles
analysis and then fix or revise them if necessary.

Don't restrict yourself to the latest commits — cast a wider net and
go super deep! Look especially at:

- boundaries between modules that different agents have touched
- utility modules and error-handling paths (bugs that survive early
  review live here)
- configuration parsing and edge-case branches
- integration points between hot-path files (`src/core/loop.ts`,
  `src/agents/executor.ts`, `src/models/router.ts`,
  `src/persistence/tasks.ts`)

Use **ultrathink**.
