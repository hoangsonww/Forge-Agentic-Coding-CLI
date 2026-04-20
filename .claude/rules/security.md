---
paths:
  - "src/permissions/**/*.ts"
  - "src/sandbox/**/*.ts"
  - "src/keychain/**/*.ts"
  - "src/security/**/*.ts"
---

# Security rules (non-negotiable)

- Credentials live in the OS keychain (`src/keychain/`), or the encrypted
  fallback. Never store secrets in `~/.config/forge/config.json` or any
  file at rest in the repo.
- All log output must be routed through `src/security/redact.ts`. Do not
  `console.log` a config object that may contain an API key.
- Prompt-injection defence uses fenced-data boundaries
  (`src/security/injection.ts`). When you add a new place where untrusted
  content reaches the model, fence it.
- Never add a code path that writes outside the sandbox without a matching
  permission gate. Never bypass prompts unless the user explicitly passed
  `--skip-permissions` or `--allow-*`.
- Shell command risk is classified in `src/sandbox/shell.ts`. The
  `critical` tier is hard-blocked — do not add exceptions.
