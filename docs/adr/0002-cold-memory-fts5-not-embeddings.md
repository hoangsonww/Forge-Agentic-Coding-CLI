# 0002. Cold memory uses SQLite FTS5, not embeddings

- Status: accepted
- Date: 2026-04-18
- Tags: memory, retrieval

## Context

The planning doc calls for a "local vector database" for cold memory. The natural reading is embeddings. But embedding models carry significant weight: either ship a tokenizer + model (~100MB+ for a usable encoder) or depend on a running Ollama model for every query.

## Options

1. **Ship `@xenova/transformers` with MiniLM**: good recall; +100MB+ install; Node native stack.
2. **Require Ollama for embeddings**: pushes work onto the already-running runtime; adds latency per query.
3. **FTS5 BM25 with code-aware tokenizer**: no extra deps (better-sqlite3 is already here); fast; competitive on code search; swappable behind the `cold` interface later.

## Decision

Option 3 for v1. The `cold` module exposes a small surface (`indexProject`, `search`, `forgetProject`) so an embedding-backed implementation can be swapped in without touching callers.

## Consequences

- Positive: zero new dependencies; index is fast and small; transparent to users.
- Negative: recall is worse than semantic search for paraphrased queries. Mitigated by (a) warm-memory dep-graph traversal, (b) the planner model re-ranks.
- Follow-ups: add optional embedding backend gated behind `forge config set memory.cold.backend embedding`.
