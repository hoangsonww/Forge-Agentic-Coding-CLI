# Contributing to Forge

Forge is engineering infrastructure. Contributions should meet the bar you'd hold for core-team code: tested, typed, redacted, permissioned.

## Dev setup

```bash
git clone https://github.com/hoangsonww/Forge-Agentic-Coding-CLI
cd forge
npm install
npm run build
npm test
./bin/forge.js doctor
```

## Commit style

We follow [Conventional Commits](https://www.conventionalcommits.org/). The release automation derives the next version directly from commit subjects on `main`.

```
feat(memory): add learning decay
fix(sandbox): reject symlink escapes
docs(arch): clarify permission model
chore: bump playwright types
BREAKING CHANGE: renamed --allow-mcp flag
```

## The bar

Before opening a PR, make sure:

- `npm run build` succeeds with zero TypeScript errors.
- `npm test` passes (we won't merge without green CI).
- `npx eslint 'src/**/*.ts'` has no new warnings you introduced.
- `npx prettier --check 'src/**/*.ts' 'test/**/*.ts'` passes.
- Your change ships with tests if it adds logic. Bug fixes should include a reproducer test.
- You updated `README.md`, `docs/ARCHITECTURE.md`, or an ADR under `docs/adr/` when user-facing behavior changed.
- You did **not** introduce any path that bypasses permission gating, the sandbox, or redaction.
- You did **not** add a dependency on a native module unless the module is truly necessary. We prefer `undici`, `better-sqlite3`, Node stdlib.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). For significant design changes please open an ADR in `docs/adr/NNNN-title.md` using the template at `docs/adr/template.md`.

## Security

Never commit real tokens, even for tests — the redaction patterns will mask them in logs but they'd still be in git history. Use obvious fake values (`ghp_fake_fake_fake_...`).

To report a vulnerability privately, email security@forge.dev (not yet monitored — file a GitHub security advisory in the meantime).

## Release

Releases are cut by tagging `vX.Y.Z` on `main`. The release workflow handles building artifacts for every supported platform, signing the manifest, publishing to GitHub Releases, and pushing to npm with provenance. No manual steps.
