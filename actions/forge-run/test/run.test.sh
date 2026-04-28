#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Smoke-tests for the forge-action runner. Stubs `forge` with a fake binary
# that prints a canned completion block, drives `run.sh`, then asserts on
# the parsed outputs and the generated comment / summary payloads.
# -----------------------------------------------------------------------------
set -uo pipefail

cd "$(dirname "$0")/.."

failures=0
assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    printf '  ✓ %s\n' "$name"
  else
    printf '  ✗ %s\n      expected: %s\n      actual:   %s\n' "$name" "$expected" "$actual"
    failures=$((failures+1))
  fi
}
assert_match() {
  local name="$1" pattern="$2" file="$3"
  if grep -qE -- "$pattern" "$file"; then
    printf '  ✓ %s\n' "$name"
  else
    printf '  ✗ %s\n      pattern not found: %s\n      in file: %s\n' "$name" "$pattern" "$file"
    failures=$((failures+1))
  fi
}

# ---------------------------------------------------------------------------
# Stub a `forge` binary that emits a realistic LAUNCHING + DONE block.
# ---------------------------------------------------------------------------
TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

stub_dir="$TMP/bin"
mkdir -p "$stub_dir"
cat > "$stub_dir/forge" <<'STUB'
#!/usr/bin/env bash
echo "━━━ LAUNCHING ━━━━━━━━━━━━━━━━━━"
echo "    task task_22ce1f014275"
echo ""
echo "doing the thing..."
echo "━━━ DONE ━━━━━━━━━━━━━━━━━━━━━━━"
echo "    task     task_22ce1f014275"
echo "    summary  Added /healthz route and a test"
echo "    changed  src/server.ts test/server.test.ts"
echo "    duration 12.3s"
echo "    cost     \$0.0000"
exit 0
STUB
chmod +x "$stub_dir/forge"

# ---------------------------------------------------------------------------
# Drive the script with stubbed env. Capture outputs into a writable file.
# ---------------------------------------------------------------------------
export PATH="$stub_dir:$PATH"
export RUNNER_TEMP="$TMP"
export GITHUB_OUTPUT="$TMP/outputs.txt"
export GITHUB_STEP_SUMMARY="$TMP/summary.md"
: > "$GITHUB_OUTPUT"
: > "$GITHUB_STEP_SUMMARY"

export FORGE_TASK="add a /healthz route"
export FORGE_MODE="plan"
export FORGE_EXTRA_ARGS=""
export FORGE_FAIL_ON_ERROR="true"

bash scripts/run.sh > "$TMP/stdout.log" 2>&1
rc=$?

# ---------------------------------------------------------------------------
# Assertions.
# ---------------------------------------------------------------------------
echo "[1] Exits 0 on a successful forge run"
assert_eq "exit code" "0" "$rc"

echo "[2] Outputs file has the expected fields"
assert_match "success=true"      '^success=true$'                        "$GITHUB_OUTPUT"
assert_match "task-id is set"    '^task-id=task_22ce1f014275$'           "$GITHUB_OUTPUT"
assert_match "files-changed"     '^files-changed=src/server.ts test/server.test.ts$' "$GITHUB_OUTPUT"
assert_match "cost-usd parsed"   '^cost-usd=0.0000$'                     "$GITHUB_OUTPUT"
assert_match "summary heredoc"   '^summary<<__FORGE_EOF__$'              "$GITHUB_OUTPUT"
assert_match "summary content"   'Added /healthz route and a test'       "$GITHUB_OUTPUT"
assert_match "duration positive" '^duration-ms=[1-9][0-9]*$'             "$GITHUB_OUTPUT"

echo "[3] Job summary markdown is well-formed"
assert_match "summary header"    '✅ Forge run completed'                "$GITHUB_STEP_SUMMARY"
assert_match "summary task row"  '\| Task ID \| `task_22ce1f014275` \|' "$GITHUB_STEP_SUMMARY"

echo "[4] Comment payload exists and is well-formed"
comment_path=$(grep '^comment-path=' "$GITHUB_OUTPUT" | sed 's/^comment-path=//')
[ -f "$comment_path" ] && echo "  ✓ comment file exists at $comment_path" || { echo "  ✗ comment file missing"; failures=$((failures+1)); }
assert_match "comment header"    '🤖 Forge — task complete'             "$comment_path"
assert_match "comment summary"   'Added /healthz route and a test'       "$comment_path"

# ---------------------------------------------------------------------------
# Failure path: stub forge with non-zero exit.
# ---------------------------------------------------------------------------
echo "[5] Non-zero forge exit propagates when fail-on-error=true"
cat > "$stub_dir/forge" <<'STUB'
#!/usr/bin/env bash
echo "boom"
exit 7
STUB
chmod +x "$stub_dir/forge"
: > "$GITHUB_OUTPUT"
: > "$GITHUB_STEP_SUMMARY"

set +e
bash scripts/run.sh > "$TMP/stdout.log" 2>&1
rc=$?
set -e
assert_eq "exit code propagated" "7" "$rc"
assert_match "success=false"     '^success=false$'                       "$GITHUB_OUTPUT"

echo "[6] fail-on-error=false returns 0 even when forge fails"
: > "$GITHUB_OUTPUT"
: > "$GITHUB_STEP_SUMMARY"
FORGE_FAIL_ON_ERROR="false" bash scripts/run.sh > "$TMP/stdout.log" 2>&1
rc=$?
assert_eq "exit code suppressed" "0" "$rc"
assert_match "success=false"     '^success=false$'                       "$GITHUB_OUTPUT"

if [ "$failures" -eq 0 ]; then
  echo
  echo "All tests passed."
  exit 0
else
  echo
  echo "$failures test(s) failed."
  exit 1
fi
