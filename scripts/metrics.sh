#!/usr/bin/env bash
# Regenerate docs/metrics.json from the current source tree.
# Every number cited in the docs comes from this script so claims are verifiable.
# @author Son Nguyen <hoangson091104@gmail.com>

set -euo pipefail
cd "$(dirname "$0")/.."

loc_total=$(find src -name "*.ts" | xargs wc -l | tail -1 | awk '{print $1}')
loc_tests=$(find test -name "*.test.ts" | xargs wc -l | tail -1 | awk '{print $1}')
test_files=$(find test -name "*.test.ts" | wc -l | tr -d ' ')
test_count=$(npx vitest run --reporter=default 2>&1 | grep -E "Tests " | awk '{print $2}' | head -1)
tools=$(ls src/tools/*.ts | grep -v registry | wc -l | tr -d ' ')
cli_commands=$(ls src/cli/commands/*.ts | wc -l | tr -d ' ')
providers=$(grep -l "implements ModelProvider\|extends OpenAIProvider" src/models/*.ts | wc -l | tr -d ' ')
slash=$(grep -c "^    name:" src/cli/repl-commands.ts)
ci_jobs=$(grep -cE "^  [a-z][a-z-]*:$" .github/workflows/ci.yml)
release_jobs=$(grep -cE "^  [a-z][a-z-]*:$" .github/workflows/release.yml)
agents=$(ls src/agents/*.ts | grep -v base | grep -v registry | wc -l | tr -d ' ')

cat <<EOF
loc_total        $loc_total
loc_tests        $loc_tests
test_files       $test_files
test_count       $test_count
tools            $tools
cli_commands     $cli_commands
providers        $providers
slash            $slash
ci_jobs          $ci_jobs
release_jobs     $release_jobs
agents           $agents
EOF
echo
echo "Edit docs/metrics.json with these values to keep docs in sync."
