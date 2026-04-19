# 0001. Local-first with optional cloud fallback

- Status: accepted
- Date: 2026-04-18
- Tags: providers, model-routing

## Context

Forge's planning doc commits to "local-first by default". Meanwhile, shipping a useful agent without a 70B local model makes cold-start hostile: a fresh install with nothing running would be an unusable CLI.

## Options

1. **Local-only (Ollama)**: matches the doctrine verbatim; cold start is broken.
2. **Cloud-only (Anthropic)**: fastest bring-up; breaks local-first, privacy, cost model.
3. **Local-first with opt-in cloud fallback**: ship both providers, route by config; users choose where to run.

## Decision

Option 3. Ollama is the default provider. Anthropic is registered but selected only if either:
(a) the user explicitly sets `provider: anthropic` in config, or
(b) Ollama is unreachable AND the user has `ANTHROPIC_API_KEY` set.

`offline-safe` mode forces Ollama and refuses cloud fallback regardless of config.

## Consequences

- Positive: works on first install even without Ollama. Users can graduate to local as needed.
- Negative: two provider code paths to maintain.
- Follow-ups: add vLLM + llama.cpp providers; keep the provider interface stable.
