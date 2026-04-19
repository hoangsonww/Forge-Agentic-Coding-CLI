---
name: security-audit
description: Audit code for common security issues.
inputs:
  - path
tools:
  - read_file
  - grep
  - list_dir
tags:
  - security
  - audit
---

## Instructions

Report findings, do NOT modify files (mode should be `audit`).

Check for:
- Hard-coded secrets (API keys, tokens, passwords)
- SQL injection (string concat into queries)
- Command injection (`exec`/`spawn` with user-controlled input)
- Path traversal (user-controlled paths without normalization)
- Insecure deserialization (`eval`, `Function`, `pickle.loads`)
- CSRF / missing CORS review in web handlers
- Weak crypto (MD5/SHA1 for passwords, `Math.random()` for tokens)

For each issue output: file:line, severity (info|warning|error|critical),
brief description, recommended fix. Stop with a summary table.
