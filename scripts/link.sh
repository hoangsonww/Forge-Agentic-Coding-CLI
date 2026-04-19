#!/usr/bin/env bash
# Forge — dev link helper.
#
# Puts the `forge` command on your PATH by linking this checkout into the
# active Node's global bin. Run once after cloning:
#
#   ./scripts/link.sh
#
# After this, `forge --version` works from anywhere. Rebuild with
# `npm run build` (or `npm run build:watch`) to pick up source changes —
# the shim at bin/forge.js loads dist/ live, so no re-link needed.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

say()  { printf '\033[1;36m[forge]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[forge]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[forge]\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "Node is not installed. Install Node 20+ first (nvm: https://github.com/nvm-sh/nvm)."
command -v npm  >/dev/null 2>&1 || fail "npm is not installed. It ships with Node."

NODE_VERSION="$(node -v)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  fail "Forge needs Node 20+. You have ${NODE_VERSION}. Upgrade (e.g. \`nvm install 20\`) and re-run."
fi

say "Node ${NODE_VERSION} OK."

if [ ! -f "${ROOT}/dist/cli/index.js" ] || [ "${ROOT}/src/cli/index.ts" -nt "${ROOT}/dist/cli/index.js" ]; then
  say "Building dist/ ..."
  npm run --silent build
else
  say "dist/ is fresh — skipping build."
fi

say "Linking @forge/cli into $(npm prefix -g)/bin ..."
npm link --silent

GLOBAL_BIN="$(npm prefix -g)/bin"
FORGE_BIN="${GLOBAL_BIN}/forge"

if [ ! -e "${FORGE_BIN}" ]; then
  fail "npm link finished but \`${FORGE_BIN}\` was not created. Check \`npm config get prefix\` and permissions."
fi

case ":${PATH}:" in
  *":${GLOBAL_BIN}:"*)
    ;;
  *)
    warn "\`${GLOBAL_BIN}\` is not on your PATH. Add this line to ~/.zshrc (or ~/.bashrc) and reopen your shell:"
    warn "  export PATH=\"${GLOBAL_BIN}:\$PATH\""
    ;;
esac

RESOLVED="$(command -v forge || true)"
if [ -z "${RESOLVED}" ]; then
  warn "Linked, but \`forge\` is not resolving on PATH yet. Try opening a new shell."
  exit 0
fi

VERSION_OUT="$(forge --version 2>/dev/null || true)"
say "Linked: ${RESOLVED}"
[ -n "${VERSION_OUT}" ] && say "forge --version → ${VERSION_OUT}"

cat <<EOF

  Next:
    forge init                         # create ~/.forge and ./.forge
    forge run "add a /health endpoint" # first task
    forge ui                           # launch the dashboard
    forge doctor                       # health check

  Unlink later with:  npm run unlink
EOF
