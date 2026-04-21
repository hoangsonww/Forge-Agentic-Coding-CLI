# Initial plan — first draft

**Use with:** GPT Pro (Extended Reasoning), Claude Opus on the web, or
Gemini Deep Think. Each model on its own, not combined.

**Goal:** produce an initial markdown design document for the feature
or subsystem in question.

**How to use:** replace the placeholders, paste into a fresh chat, and
save the model's output to `.flywheel/plans/<date>-<slug>-<model>.md`.

---

I want to design <FEATURE OR SUBSYSTEM> for the Forge project.

**Project context.** Forge is a local-first, multi-agent, programmable
software-engineering CLI runtime in TypeScript (Node 20+). Hot paths
are:

- `src/core/loop.ts` — agentic pipeline
- `src/agents/executor.ts` — iterative tool-use loop
- `src/core/mode-policy.ts` — per-mode token/turn caps
- `src/core/validation.ts` — post-step gate
- `src/models/router.ts` + `src/models/adapter.ts` — routing
- `src/persistence/tasks.ts` — state machine (LEGAL_TRANSITIONS)
- `src/tools/registry.ts` — tool registry
- `src/permissions/manager.ts` — permission gate (every tool call
  passes through it)
- `src/sandbox/fs.ts` + `src/sandbox/shell.ts` — realpath-confined
  filesystem + command risk classifier

Forge has ~18 tools, 6 providers (ollama, anthropic, openai, llamacpp,
vllm, lmstudio), 6 agents (planner, architect, executor, reviewer,
debugger, memory), and 249 tests across 43 files (100% passing).

**Intent.** <WHAT you are trying to build and WHY>

**User workflows.** <Concrete end-to-end user interactions>

**Constraints & invariants.**
- every tool call must go through `requestPermission`
- state transitions must stay in `LEGAL_TRANSITIONS`
- UI `app.js` stays < 120 KB uncompressed
- provider probes ~1.5 s
- no synchronous disk reads on REPL redraw or UI poll paths
- <any additional constraints specific to this feature>

**Deliverable.** Produce a comprehensive markdown plan covering:

1. **Overview & intent** — what, why, how it serves users.
2. **User-visible workflows** — step-by-step flows.
3. **Architecture** — modules touched, new modules added, data flow.
4. **Integration points** — hot paths above that are affected.
5. **State transitions** — any new `LEGAL_TRANSITIONS` entries.
6. **Permission & sandbox implications** — new risk/sideEffect tiers.
7. **Testing strategy** — unit + integration + e2e; concrete test
   names and fixtures.
8. **Failure modes** — what goes wrong and how we surface it.
9. **Sequencing** — which pieces must land first; dependency order.
10. **Open questions** — explicit list of things still ambiguous.

Be thorough. This is plan-space: we want the whole system to fit in
your context window so you can reason globally. A 2000–4000 line plan
is fine. Use markdown headings, tables, and code snippets wherever
they clarify. Use **ultrathink**.
