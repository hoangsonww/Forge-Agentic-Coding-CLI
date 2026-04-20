---
name: release-check
description: Pre-release checklist for Forge — verify, version bump, changelog, docs, docker build, smoke test. Run before tagging v*.
---

A bad release is worse than a late release. Do each step manually.

## 1. Clean tree

```bash
git status                               # must be clean
git fetch origin
git log --oneline origin/master..HEAD    # what's going out
```

## 2. Version + changelog

- `package.json` version bumped per semver.
- `CHANGELOG.md` has a section for this version (Added / Changed /
  Fixed / Security), referencing issues/PRs.

## 3. Run the verify skill

All 249+ tests pass; format, lint, typecheck, build all clean.

## 4. Docs

- README "At a glance" counts match reality.
- `docs/ARCHITECTURE.md` reflects hot-path changes.
- `docs/SETUP.md` / `docs/INSTALL.md` reflect new env vars or deps.
- If any counts changed: `bash scripts/metrics.sh`.

## 5. Docker

```bash
docker build -f docker/Dockerfile -t forge:dev .
docker run --rm forge:dev doctor --no-banner
```

## 6. Smoke test

```bash
npm run build
./bin/forge.js doctor
./bin/forge.js --version
```

## 7. Tag

Only after every step above passes. The tag triggers a 6-stage
release workflow — do not push one you haven't verified.

```bash
git tag v<x.y.z>
git push origin v<x.y.z>
```
