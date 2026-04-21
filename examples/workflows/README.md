# Workflows

GitHub Actions recipes that integrate Forge into a team's CI.

| File | What it does |
|---|---|
| [`ci-pr-check.yml`](ci-pr-check.yml) | Every PR: run `forge audit` on the diff and leave a comment if findings exist |
| [`nightly-deps-bump.yml`](nightly-deps-bump.yml) | Cron nightly: open a PR bumping a randomly-chosen dependency, using the `dependency-upgrade` skill |

## Paste-in instructions

Copy a file into `.github/workflows/` and edit the marked placeholders:

```bash
cp examples/workflows/ci-pr-check.yml .github/workflows/
```

Placeholders use the form `<PLACEHOLDER_NAME>` so they're greppable.

## Secrets you'll need

| Secret | Required for |
|---|---|
| `ANTHROPIC_API_KEY` | Cloud-backed runs |
| `FORGE_HOME` (repo var) | Point Forge at a workspace-local home so caches persist across steps |
| `GITHUB_TOKEN` (automatic) | Commenting on PRs, opening PRs |

## Resource hints

- Pin `runs-on` by version (`ubuntu-22.04`, not `ubuntu-latest`). When
  GitHub flips the default, your pipelines won't drift overnight.
- Use a `concurrency` group so a rapid push series doesn't stack up
  redundant Forge runs:
  ```yaml
  concurrency:
    group: forge-${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: true
  ```
- Forge's test suite finishes in ~5s; leave a 5-minute step timeout so a
  hung provider probe can't burn your minutes quota.
