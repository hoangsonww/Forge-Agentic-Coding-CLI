#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Forge GitHub Action — task runner
#
# Spawns `forge run`, captures stdout to a log, parses key fields out of the
# completion block (task id, summary, files changed, duration, cost), and
# emits them as GitHub Actions outputs. Also prepares a markdown comment
# payload that the action.yml composite step uses for `actions/github-script`.
# -----------------------------------------------------------------------------
set -uo pipefail

# Output sinks. GITHUB_OUTPUT is provided by the runner; fall back to a temp
# file when invoked locally for testing.
GH_OUTPUT="${GITHUB_OUTPUT:-/tmp/forge-action-outputs.txt}"
GH_SUMMARY="${GITHUB_STEP_SUMMARY:-/tmp/forge-action-summary.md}"

# Mode → forge args. `plan` is the safe default (no writes); `balanced` and
# `risky` enable execution. We always pass `--yes` so the agent never blocks
# on a prompt in CI.
case "${FORGE_MODE:-plan}" in
  plan)     mode_args=(--mode plan --yes);;
  balanced) mode_args=(--mode balanced --yes --skip-permissions);;
  risky)    mode_args=(--mode risky --yes --skip-permissions);;
  *) echo "::error::Unknown mode: ${FORGE_MODE}. Use plan|balanced|risky."; exit 2;;
esac

# Extra args from the caller — split on whitespace, no quoting tricks.
read -r -a extra_args <<< "${FORGE_EXTRA_ARGS:-}"

log_dir="${RUNNER_TEMP:-/tmp}/forge-action"
mkdir -p "$log_dir"
log_file="$log_dir/run.log"
comment_file="$log_dir/comment.md"

echo "::group::forge run"
echo "task: ${FORGE_TASK}"
echo "mode: ${FORGE_MODE:-plan}"
echo "extra: ${FORGE_EXTRA_ARGS:-(none)}"
echo "log: ${log_file}"
echo "::endgroup::"

now_ms() {
  perl -MTime::HiRes=time -e 'printf("%.0f", time*1000)' 2>/dev/null \
    || python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null \
    || echo $(($(date +%s) * 1000))
}
start_ms=$(now_ms)

forge run "${FORGE_TASK}" "${mode_args[@]}" ${extra_args[@]+"${extra_args[@]}"} 2>&1 | tee "$log_file"
exit_code=${PIPESTATUS[0]}

end_ms=$(now_ms)
duration=$((end_ms - start_ms))

# ---------------------------------------------------------------------------
# Parse the completion block. Forge prints lines like:
#   ━━━ DONE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#     task     task_xxxxxxxxxxxx
#     summary  Added /healthz and a test for it.
#     changed  src/server.ts test/server.test.ts
#     duration 12.3s
#     cost     $0.0000
# Use a set of forgiving greps so we don't break if any one line moves.
# ---------------------------------------------------------------------------
strip() { sed -E "s/^[[:space:]]*//; s/[[:space:]]*\$//; s/$(printf '\033')\[[0-9;]*m//g"; }
field()  { grep -E "^[[:space:]]*${1}[[:space:]]+" "$log_file" | tail -1 | sed -E "s/^[[:space:]]*${1}[[:space:]]+//" | strip; }

task_id=$(field 'task')
summary=$(field 'summary')
changed=$(field 'changed' | tr -s ' ' || true)
cost=$(field 'cost' | sed 's/^\$//')

# Fallback: if the completion block didn't render (e.g. plan-only mode),
# pull the task id from the LAUNCHING block.
if [ -z "$task_id" ]; then
  task_id=$(grep -Eo 'task_[a-z0-9]+' "$log_file" | head -1)
fi

success="true"
if [ "$exit_code" -ne 0 ]; then success="false"; fi

# Single-line outputs only — multi-line needs the heredoc form, which we use
# below for `summary` if it contains newlines.
{
  echo "success=${success}"
  echo "task-id=${task_id}"
  echo "files-changed=${changed}"
  echo "duration-ms=${duration}"
  echo "cost-usd=${cost:-0}"
  echo "log-path=${log_file}"
  echo "comment-path=${comment_file}"
} >> "$GH_OUTPUT"

# Multi-line summary via heredoc syntax.
{
  printf 'summary<<__FORGE_EOF__\n'
  printf '%s\n' "${summary:-(no summary)}"
  printf '__FORGE_EOF__\n'
} >> "$GH_OUTPUT"

# ---------------------------------------------------------------------------
# Job summary — markdown that lands in the Actions UI tab.
# ---------------------------------------------------------------------------
{
  if [ "$success" = "true" ]; then
    printf '### ✅ Forge run completed\n\n'
  else
    printf '### ❌ Forge run failed (exit %s)\n\n' "$exit_code"
  fi
  printf '| Field | Value |\n|---|---|\n'
  printf '| Task ID | `%s` |\n' "${task_id:-?}"
  printf '| Mode | `%s` |\n' "${FORGE_MODE:-plan}"
  printf '| Duration | %d ms |\n' "$duration"
  printf '| Cost | $%s |\n' "${cost:-0}"
  if [ -n "$changed" ]; then
    printf '| Files changed | `%s` |\n' "$changed"
  fi
  printf '\n#### Summary\n\n%s\n' "${summary:-(no summary)}"
} >> "$GH_SUMMARY"

# ---------------------------------------------------------------------------
# PR comment payload (action.yml conditionally posts this).
# ---------------------------------------------------------------------------
{
  if [ "$success" = "true" ]; then
    printf '### 🤖 Forge — task complete\n\n'
  else
    printf '### ❌ Forge — task failed\n\n'
  fi
  printf '> %s\n\n' "${summary:-(no summary)}"
  printf '<details><summary>details</summary>\n\n'
  printf '| Field | Value |\n|---|---|\n'
  printf '| Task | `%s` |\n' "${task_id:-?}"
  printf '| Mode | `%s` |\n' "${FORGE_MODE:-plan}"
  printf '| Duration | %d ms |\n' "$duration"
  printf '| Cost | $%s |\n' "${cost:-0}"
  if [ -n "$changed" ]; then
    printf '| Files | `%s` |\n' "$changed"
  fi
  printf '\n</details>\n'
} > "$comment_file"

if [ "$exit_code" -ne 0 ] && [ "${FORGE_FAIL_ON_ERROR:-true}" = "true" ]; then
  echo "::error::forge run exited with status $exit_code"
  exit "$exit_code"
fi
