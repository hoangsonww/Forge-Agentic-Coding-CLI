# forge-run — GitHub Action

Run [Forge](https://github.com/hoangsonww/Forge-Agentic-Coding-CLI) agentic coding tasks inside any GitHub Actions workflow. Plan-only previews on every PR, full execution + verification on demand, results posted as a PR comment.

## Quick start

```yaml
# .github/workflows/forge-plan.yml
name: forge plan
on: [pull_request]
jobs:
  forge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hoangsonww/Forge-Agentic-Coding-CLI/actions/forge-run@v1
        with:
          task: "Audit this PR for missing tests and propose a plan to add them."
          mode: plan
          comment: true
```

## Inputs

| Input | Default | Purpose |
|---|---|---|
| `task` | (required) | Task description for Forge. Multi-line allowed. |
| `mode` | `plan` | `plan` (read-only, safe), `balanced` (executes), `risky` (no permission prompts). |
| `extra-args` | `''` | Extra flags forwarded to `forge run`, e.g. `--max-steps 30`. |
| `forge-version` | `latest` | Pin a specific runtime version for reproducibility. |
| `node-version` | `20` | Node version for the install step. |
| `working-directory` | `.` | Where to run the task. |
| `provider` | `''` | Override provider (`anthropic`, `openai`, `ollama`, …). Empty = runtime default. |
| `comment` | `false` | Post the result as a PR comment when the trigger is `pull_request`. |
| `fail-on-error` | `true` | Whether to fail the workflow when Forge exits non-zero. |
| `cache-forge-home` | `true` | Cache `~/.forge` between runs to keep the SQLite index warm. |

## Outputs

| Output | Example | Notes |
|---|---|---|
| `success` | `true` | `false` if Forge exited non-zero. |
| `task-id` | `task_22ce1f014275` | Forge task ID. |
| `summary` | `Added /healthz and a test` | One-line summary. Multi-line via heredoc-encoded output. |
| `files-changed` | `src/a.ts test/a.test.ts` | Space-separated list. |
| `duration-ms` | `12345` | Wall-clock duration. |
| `cost-usd` | `0.0000` | Estimated cost (zero for local providers). |
| `log-path` | `/tmp/forge-action/run.log` | Full log file on the runner. |

## Examples

### Plan-only preview on every PR

```yaml
name: forge plan
on: [pull_request]
jobs:
  forge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hoangsonww/Forge-Agentic-Coding-CLI/actions/forge-run@v1
        with:
          task: |
            Read the PR diff. Identify any files that gained behavior
            without test coverage. Output a plan with one task per gap.
          mode: plan
          comment: true
```

### Auto-fix lint warnings on demand

Triggered manually via `Run workflow`:

```yaml
name: forge fix
on:
  workflow_dispatch:
    inputs:
      task:
        description: 'What should Forge do?'
        required: true
jobs:
  forge:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: hoangsonww/Forge-Agentic-Coding-CLI/actions/forge-run@v1
        id: forge
        with:
          task: ${{ inputs.task }}
          mode: balanced
          extra-args: "--max-steps 60"
      - name: Open PR with changes
        if: steps.forge.outputs.success == 'true'
        uses: peter-evans/create-pull-request@v6
        with:
          commit-message: 'forge: ${{ inputs.task }}'
          branch: forge/${{ steps.forge.outputs.task-id }}
          title: '🤖 ${{ steps.forge.outputs.summary }}'
          body: |
            Forge task `${{ steps.forge.outputs.task-id }}` completed in ${{ steps.forge.outputs.duration-ms }} ms.

            **Files changed:** `${{ steps.forge.outputs.files-changed }}`
```

### Pin to a specific Forge version

```yaml
- uses: hoangsonww/Forge-Agentic-Coding-CLI/actions/forge-run@v1
  with:
    forge-version: '1.0.0'
    task: '…'
```

### Use Anthropic instead of the default provider

```yaml
- uses: hoangsonww/Forge-Agentic-Coding-CLI/actions/forge-run@v1
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  with:
    provider: anthropic
    task: '…'
```

## Modes

| Mode | What it does | When to use |
|---|---|---|
| `plan` | Generates a plan, never writes a file. Permissions and risky tools are off. | Default for any PR check. Cannot break anything. |
| `balanced` | Full classify → plan → execute → verify pipeline. Permission prompts are auto-approved (`--skip-permissions` is on). | When you trust the task and want it to land. |
| `risky` | Same as balanced. Reserved for future capabilities that need a higher trust level. | Advanced flows. |

## Behaviour notes

- **Caching**: `~/.forge` is cached by default. The cache key is keyed on `runner.os + forge-version + repo`, so two repos using the same runner don't share secrets via the index DB. Disable with `cache-forge-home: false`.
- **Outputs are GitHub-Action standard**: single-line outputs go straight into `$GITHUB_OUTPUT`; the `summary` field uses the heredoc form because it can be multi-line. Read it with `${{ steps.<id>.outputs.summary }}`.
- **PR comments** are only posted when both `comment: true` and the workflow event is `pull_request`. The action skips silently in any other event.
- **Job summary**: every run writes a markdown table to `$GITHUB_STEP_SUMMARY` so the result shows up in the Actions UI tab.

## Security

- Forge runs inside the runner's normal sandbox. Tasks in `plan` mode are read-only.
- The action does not exfiltrate any data. All processing happens on your runner.
- Pin `forge-version` if you want reproducible runs across CI; `latest` follows the npm `latest` tag.
- If you set `provider: anthropic` or `provider: openai`, supply the corresponding API key via `secrets.*` and `env:` — the action does not touch your secrets.

## Testing

```bash
cd actions/forge-run
bash test/run.test.sh
```

The test stubs `forge` and asserts that the runner script parses the completion block, writes the right outputs, and respects `fail-on-error`. Runs in a few hundred ms.

## License

MIT — same as the parent project.
