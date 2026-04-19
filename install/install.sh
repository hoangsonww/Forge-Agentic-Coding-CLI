#!/usr/bin/env bash
set -euo pipefail

# Forge installer.
#
#   curl -fsSL https://get.forge.dev | bash      # end users (from registry)
#   ./install/install.sh                         # inside a clone: dev-link
#   FORGE_MODE=global ./install/install.sh       # force registry path
#
# End result (either path): `forge` on your PATH.

FORGE_PKG="${FORGE_PKG:-@forge/cli}"
FORGE_VERSION="${FORGE_VERSION:-latest}"
FORGE_MODE="${FORGE_MODE:-auto}"

say()  { printf '\033[1;36m[forge]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[forge]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[forge]\033[0m %s\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing: $1. Install it first, then re-run."
}

need node
need npm

NODE_VERSION="$(node -v)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  fail "Forge needs Node 20+. You have ${NODE_VERSION}."
fi

# Detect dev-mode: are we running from inside the forge repo?
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
IN_REPO=0
if [ -f "${REPO_ROOT}/package.json" ] && grep -q '"name": "@forge/cli"' "${REPO_ROOT}/package.json"; then
  IN_REPO=1
fi

if [ "${FORGE_MODE}" = "auto" ] && [ "${IN_REPO}" -eq 1 ]; then
  FORGE_MODE="dev"
elif [ "${FORGE_MODE}" = "auto" ]; then
  FORGE_MODE="global"
fi

case "${FORGE_MODE}" in
  dev)
    say "Detected checkout at ${REPO_ROOT} — installing via \`npm link\`."
    cd "${REPO_ROOT}"
    exec "${REPO_ROOT}/scripts/link.sh"
    ;;
  global)
    say "Installing ${FORGE_PKG}@${FORGE_VERSION} via npm -g ..."
    npm install -g "${FORGE_PKG}@${FORGE_VERSION}"
    ;;
  *)
    fail "Unknown FORGE_MODE='${FORGE_MODE}'. Use 'auto', 'dev', or 'global'."
    ;;
esac

GLOBAL_BIN="$(npm prefix -g)/bin"
case ":${PATH}:" in
  *":${GLOBAL_BIN}:"*) ;;
  *) warn "\`${GLOBAL_BIN}\` is not on your PATH. Add: export PATH=\"${GLOBAL_BIN}:\$PATH\"" ;;
esac

say "Done. Try:"
echo "    forge init"
echo "    forge run \"your first task\""
echo "    forge ui"
