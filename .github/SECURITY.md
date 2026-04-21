# Security Policy

Thank you for helping us keep Forge secure. We take the security of this project seriously, especially given its nature as an agentic coding runtime that executes commands, reads files, and interacts with external services.

## Supported Versions

Currently, only the latest release of Forge is supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Forge, **please do not open a public issue**. Instead, report it privately so we can investigate and patch it before public disclosure.

Please report security issues via GitHub Security Advisories:
1. Go to the [Security Advisories tab](https://github.com/hoangsonww/Forge-Agentic-Coding-CLI/security/advisories) on this repository.
2. Click **Report a vulnerability**.
3. Provide a clear description of the issue, including steps to reproduce, potential impact, and any suggested mitigations.

We will acknowledge receipt of your vulnerability report within 48 hours and strive to send you regular updates about our progress. If the issue is confirmed as a vulnerability, we will release a patch as quickly as possible.

## Security Posture & Architecture

Forge is designed with a **default-deny** security model. When reporting a vulnerability, please consider our intended security boundaries:

- **Permission System:** Every tool call is classified by risk, side-effect, and sensitivity. High-risk commands (e.g., executing shell scripts, making arbitrary network requests) must prompt the user unless explicitly allowed via session flags.
- **Filesystem Sandbox:** Agents are confined to the `projectRoot` via realpath resolution. Access to sensitive paths (like `~/.ssh`, `~/.aws`) is hard-blocked.
- **Shell Classifier:** Destructive commands (e.g., `rm -rf /`, `sudo`, fork bombs) are statically blocked.
- **Keychain Storage:** Credentials and API keys should only be stored in the OS keychain (macOS Keychain, Windows DPAPI, or libsecret), not in plain text files.
- **Prompt Injection Defense:** Untrusted content fetched from the web or MCP servers is fenced as data and must not be able to execute as instructions.

If you find a way to bypass these boundaries without explicit user consent (e.g., escaping the filesystem sandbox, bypassing the permission prompt for a high-risk command, or executing prompt injections that gain control of the agent loop), we consider this a critical vulnerability.
