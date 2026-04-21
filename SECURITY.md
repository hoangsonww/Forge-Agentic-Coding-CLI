# Security Policy

Forge is a local-first agentic runtime that touches the filesystem, runs
shell commands, reaches out to model providers, and hosts a local HTTP
dashboard. The security surface area is intentional — this doc describes
how the project handles vulnerabilities and how to report one.

---

## Supported versions

Security fixes land in the most recent MINOR of the current MAJOR.

| Version      | Supported |
|--------------|-----------|
| `0.x` latest | ✅ yes    |
| older `0.x`  | ❌ upgrade to latest |

Pre-1.0, we don't backport to prior minors. Once 1.0 ships, the current
and previous MAJOR will each receive security fixes for 12 months after
the next MAJOR is released.

---

## Reporting a vulnerability

**Do not file a public GitHub issue for security bugs.**

Preferred disclosure channels, in order:

1. **GitHub private advisory** — the
   [repository's Security tab](https://github.com/hoangsonww/Forge-Agentic-Coding-CLI/security/advisories)
   → *Report a vulnerability*. This is the fastest path; it routes
   directly to maintainers and keeps the discussion attached to a fix.
2. **Email** — `hoangson091104@gmail.com` with subject
   `[forge-security] <short title>`. PGP welcome but not required.

Please include:
- A short description of the issue and its impact.
- Reproduction steps or a minimal proof-of-concept.
- The Forge version (`forge --version`) and platform.
- Whether you've already disclosed the issue elsewhere.

### What to expect

| Step | Timing |
|------|--------|
| Acknowledgement of receipt | within **48 hours** |
| Triage + severity assessment | within **7 days** |
| Fix landed in main (typical) | within **14 days** for high/critical |
| Coordinated disclosure | after fix ships on the latest stable |

For **critical** issues (remote code execution, credential exfiltration,
sandbox escape), we aim to ship a patched release within **72 hours** of
confirmed reproduction.

---

## Scope

### In scope

- The Forge runtime and every component under `src/`.
- The signed release pipeline, including SHA-256 and Ed25519 verification
  (`src/release/`).
- The built-in updater (`src/daemon/updater.ts`) and its interaction with
  the npm registry + GitHub Releases.
- The permission manager, sandbox, and classifier
  (`src/permissions/`, `src/sandbox/`).
- The MCP client transports (`src/mcp/`).
- The HTTP+WS dashboard served by `forge ui start` (`src/ui/server.ts`)
  when bound to a network interface.
- Prompt-injection handling in `src/security/injection.ts`.
- Secret storage (`src/keychain/`), including the encrypted fallback.

### Out of scope

- Issues that require the attacker to already have local code execution
  on the same account (Forge runs as the user; that's the trust boundary).
- Findings in third-party model providers — report those to the provider.
- Denial-of-service of a locally-bound dashboard when the attacker already
  controls traffic to `localhost`.
- `FORGE_ALLOW_UNSIGNED=1` bypasses are a documented dev-only escape hatch;
  not a vulnerability.
- Lint / style / typing issues with no security impact.

---

## Hardening guidance for operators

Forge is safe by default, but a few things are worth knowing:

- **The dashboard** (`forge ui start`) binds to `127.0.0.1` by default.
  Never expose it on a public interface without putting a reverse proxy
  with authentication in front of it.
- **`--skip-permissions`** drops routine (low-risk) prompts. It does not
  bypass high/critical prompts — those always ask. Do not pass
  `--skip-permissions` in environments where the prompt is your only
  approval gate.
- **API keys** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `TAVILY_API_KEY`,
  `BRAVE_SEARCH_API_KEY`) live in the OS keychain or the encrypted
  fallback. Never commit them, and don't paste them into model prompts.
- **Prompt injection defence**: content fetched via `web.fetch`,
  `web.search`, `web.browse`, and MCP tools is fenced as untrusted data
  before it reaches the model. If you add a new source of external text,
  route it through `src/security/injection.ts#fenceUntrusted` or the
  question re-fences in assembler.
- **Release verification**: by default, Forge refuses to install a
  release artifact whose SHA-256 doesn't match a signed manifest or whose
  manifest isn't signed by a trusted Ed25519 key. See
  [`RELEASES.md`](RELEASES.md#artifact-verification-sha-256--ed25519).

---

## Cryptographic details

- Release signatures: **Ed25519**. Trusted keys ship in
  `src/release/trusted-keys.json`. Rotation is additive — old keys keep
  trust during the `rotatedOutAt` grace window.
- Keychain fallback: **AES-256-GCM**, key derived from a per-user
  pseudorandom secret stored in the OS keychain (so the fallback needs
  both the vault file *and* keychain access to decrypt).
- Transport security: **HTTPS enforced** for all web/provider calls.
  Private IP ranges and loopback are rejected in `src/web/fetch.ts` to
  prevent SSRF from a model-driven URL.

---

## Credit

We're happy to credit reporters in release notes and GitHub advisories.
If you'd prefer to remain anonymous, say so in your report.
