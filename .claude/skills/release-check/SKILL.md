---
name: release-check
description: Pre-release checklist for Forge — runs verify, checks version bump, changelog, docs, and docker build. Use before tagging v*.
disable-model-invocation: true
---

# /release-check — pre-tag checklist

Run **only when preparing a release**. Do each step manually; do not
shortcut. A bad release is worse than a late release.

## 1. Clean tree

```bash
git status                    # must be clean
git fetch origin
git log --oneline origin/master..HEAD   # changes going out
```

## 2. Version + changelog

- `package.json` version bumped per semver.
- `CHANGELOG.md` has an entry for this version with sections:
  Added / Changed / Fixed / Security.
- Entry references issue/PR numbers where applicable.

## 3. Verify

Run `/verify`. All 249+ tests pass, clean format, clean lint, clean
typecheck, clean build.

## 4. Docs

- `README.md` "At a glance" numbers still match reality.
- `docs/ARCHITECTURE.md` reflects any hot-path changes.
- `docs/SETUP.md` / `docs/INSTALL.md` reflect any new env vars or
  dependencies.
- If counts changed (tools, providers, agents), regenerate:
  `bash scripts/metrics.sh`.

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

Only after every step above passes. Tagging triggers the 6-stage
release workflow — do not push a tag you haven't verified.

```bash
git tag v<x.y.z>
git push origin v<x.y.z>
```
