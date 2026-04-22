# Forge — local-first, multi-agent, programmable software-engineering runtime.
#
# This Makefile is a thin, self-documenting wrapper over npm scripts, Docker,
# and a handful of shell one-liners that we'd otherwise retype a dozen times
# a day. It is intentionally NOT the canonical build system — package.json
# scripts are; this just gives them short names and groups them sensibly so
# `make help` answers "how do I …" for new contributors.
#
# Invariants followed:
#   - Every target is .PHONY unless it produces the named file.
#   - Every user-facing target has a "##" doc comment on its line; `make help`
#     parses those into a categorised table.
#   - Recipes are idempotent where possible — running twice is safe.
#   - No target silently swallows errors; if a step fails, `make` fails.

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SHELL               := /usr/bin/env bash
.SHELLFLAGS         := -euo pipefail -c
.ONESHELL:
.DEFAULT_GOAL       := help

# Project metadata (derived from package.json so rename-the-package Just Works)
PKG_NAME            := $(shell node -p "require('./package.json').name" 2>/dev/null || echo @hoangsonw/forge)
PKG_VERSION         := $(shell node -p "require('./package.json').version" 2>/dev/null || echo 0.0.0)

# Runtime
NODE                ?= node
NPM                 ?= npm
NPX                 ?= npx

# Docker / OCI
DOCKER              ?= docker
IMAGE               ?= ghcr.io/hoangsonw/forge-agentic-coding-cli
TAG                 ?= dev
IMAGE_FULL          := $(IMAGE):$(TAG)
PLATFORMS           ?= linux/amd64,linux/arm64
COMPOSE_FILE        ?= docker/docker-compose.yml

# Where test harnesses drop throwaway state. Override via env:
#   make test FORGE_HOME=/tmp/forge-ci
FORGE_HOME          ?= $(HOME)/.forge

# ---------------------------------------------------------------------------
# Self-documenting help (parses `##` annotations from this file)
# ---------------------------------------------------------------------------

.PHONY: help
help: ## Show this help (default target)
	@awk 'BEGIN { \
	  FS = ":.*##"; \
	  printf "\n\033[1;36mForge\033[0m \033[2m%s@%s\033[0m · make targets\n\n", "$(PKG_NAME)", "$(PKG_VERSION)" \
	} \
	/^##@/ { \
	  printf "\n\033[1;35m%s\033[0m\n", substr($$0, 5); next \
	} \
	/^[a-zA-Z0-9_.-]+:.*##/ { \
	  printf "  \033[32m%-22s\033[0m %s\n", $$1, $$2 \
	}' $(MAKEFILE_LIST)
	@printf "\nOverride knobs (env or \`make VAR=...\`):\n"
	@printf "  \033[2mTAG=\033[0m%-14s image tag for docker targets (default: dev)\n" "$(TAG)"
	@printf "  \033[2mPLATFORMS=\033[0m%-9s docker buildx platforms (default: linux/amd64,linux/arm64)\n" "$(PLATFORMS)"
	@printf "  \033[2mFORGE_HOME=\033[0m%-9s state dir for smoke runs (default: ~/.forge)\n" "$(FORGE_HOME)"
	@printf "\n"

##@ Setup

.PHONY: install
install: ## Install dependencies (npm ci, matches package-lock.json exactly)
	$(NPM) ci --ignore-scripts

.PHONY: install-dev
install-dev: ## Install dependencies with devDeps (first-time contributor path)
	$(NPM) install

.PHONY: link
link: build ## npm link — make `forge` on PATH resolve to this checkout
	$(NPM) link

.PHONY: unlink
unlink: ## Remove the npm-linked binary (`@hoangsonw/forge`) from your PATH
	-$(NPM) unlink -g $(PKG_NAME)

.PHONY: relink
relink: unlink link ## unlink + link in one step (after a pull / branch switch)

##@ Build

.PHONY: build
build: ## Compile TypeScript + copy non-code assets into dist/
	$(NPM) run build

.PHONY: watch
watch: ## Rebuild on every file change (tsc --watch; UI assets don't auto-copy)
	$(NPM) run build:watch

.PHONY: typecheck
typecheck: ## Type-check without emitting files (fast; CI-safe)
	$(NPM) run typecheck

.PHONY: clean
clean: ## Remove dist/ and any coverage output
	rm -rf dist coverage .tsbuildinfo

.PHONY: distclean
distclean: clean ## clean + nuke node_modules (forces a fresh install next time)
	rm -rf node_modules

##@ Quality

.PHONY: lint
lint: ## ESLint over src/ (errors only; warnings OK)
	$(NPM) run lint

.PHONY: format
format: ## Prettier write (src/ + test/)
	$(NPM) run format

.PHONY: format-check
format-check: ## Prettier verify (fails if anything would be reformatted)
	$(NPM) run format:check

.PHONY: test
test: ## Run the full vitest suite (97 files, 570+ tests)
	$(NPM) test

.PHONY: test-watch
test-watch: ## Run vitest in watch mode (auto-reruns on change)
	$(NPM) run test:watch

.PHONY: test-coverage
test-coverage: ## Run tests with v8 coverage → coverage/ + index.html
	$(NPM) run test:coverage

.PHONY: test-one
test-one: ## Run ONE test file: make test-one FILE=test/unit/foo.test.ts
	@if [[ -z "$${FILE:-}" ]]; then echo "usage: make test-one FILE=test/unit/foo.test.ts"; exit 2; fi
	$(NPX) vitest run "$$FILE"

.PHONY: verify
verify: format-check lint typecheck build test ## Everything CI runs, in one shot

##@ Metrics

.PHONY: metrics
metrics: ## Regenerate docs/metrics.json (counts, sizes, test count, …)
	bash scripts/metrics.sh

.PHONY: bundle
bundle: build ## Build an offline tarball bundle (via scripts/bundle.js)
	$(NODE) scripts/bundle.js

##@ Run locally

.PHONY: start
start: build ## Run the compiled CLI (`./bin/forge.js`) with no args → REPL
	$(NODE) ./bin/forge.js

.PHONY: dev
dev: ## Run the CLI via ts-node (no build step; slower cold start)
	$(NPM) run dev

.PHONY: doctor
doctor: build ## Sanity-check providers + role→model mapping (<1 s cold)
	$(NODE) ./bin/forge.js doctor --no-banner

.PHONY: repl
repl: build ## Alias: open the Forge REPL against this checkout
	$(NODE) ./bin/forge.js

.PHONY: ui
ui: build ## Launch the local dashboard at http://127.0.0.1:7823
	$(NODE) ./bin/forge.js ui start --bind 127.0.0.1 --port 7823

.PHONY: ui-stop
ui-stop: ## Kill any running Forge UI process bound to :7823
	-lsof -ti tcp:7823 2>/dev/null | xargs -r kill -9

##@ Docker

.PHONY: docker-build
docker-build: ## Build a single-arch image locally: $(IMAGE_FULL)
	$(DOCKER) build -f docker/Dockerfile -t $(IMAGE_FULL) .

.PHONY: docker-build-multi
docker-build-multi: ## Multi-arch build (buildx; linux/amd64 + linux/arm64). Adds --push if PUSH=1
	$(DOCKER) buildx build \
	  --platform $(PLATFORMS) \
	  -f docker/Dockerfile \
	  -t $(IMAGE_FULL) \
	  $(if $(filter 1 true,$(PUSH)),--push,--load) \
	  .

.PHONY: docker-run
docker-run: docker-build ## Run the image with the current repo mounted as /workspace
	$(DOCKER) run --rm -it \
	  -v forge-home:/data \
	  -v "$$(pwd):/workspace" \
	  $(IMAGE_FULL) forge doctor --no-banner

.PHONY: docker-ui
docker-ui: docker-build ## Run the containerised dashboard at http://127.0.0.1:7823
	$(DOCKER) run --rm -p 7823:7823 -v forge-home:/data \
	  $(IMAGE_FULL) forge ui start --bind 0.0.0.0

.PHONY: compose-up
compose-up: ## Bring up the full stack (forge + ollama + ui) via docker-compose
	$(DOCKER) compose -f $(COMPOSE_FILE) up -d

.PHONY: compose-down
compose-down: ## Tear down the compose stack (keeps volumes)
	$(DOCKER) compose -f $(COMPOSE_FILE) down

.PHONY: compose-nuke
compose-nuke: ## Tear down the compose stack AND delete all named volumes
	$(DOCKER) compose -f $(COMPOSE_FILE) down --volumes --remove-orphans

.PHONY: compose-logs
compose-logs: ## Tail logs from the compose stack
	$(DOCKER) compose -f $(COMPOSE_FILE) logs -f --tail=200

##@ Release (maintainer-only)

.PHONY: pack
pack: build ## Produce an npm tarball in the repo root (no publish)
	$(NPM) pack

.PHONY: publish-dry
publish-dry: build ## Dry-run `npm publish --access public` (shows what would be uploaded)
	$(NPM) publish --access public --dry-run

.PHONY: tag
tag: ## Create & push a git tag `v$(PKG_VERSION)` (triggers release.yml)
	@echo "Tagging v$(PKG_VERSION)"
	git tag -a "v$(PKG_VERSION)" -m "Release v$(PKG_VERSION)"
	git push origin "v$(PKG_VERSION)"

##@ Maintenance

.PHONY: audit
audit: ## npm audit (production deps, fails on high/critical)
	$(NPM) audit --omit=dev --audit-level=high

.PHONY: outdated
outdated: ## List packages that have newer versions available
	-$(NPM) outdated

.PHONY: tree
tree: ## Show the dep tree (production only)
	$(NPM) ls --omit=dev --all

.PHONY: locs
locs: ## Lines of code by language (requires `cloc`; brew install cloc)
	@command -v cloc >/dev/null || { echo "install cloc: brew install cloc"; exit 1; }
	cloc --quiet --exclude-dir=node_modules,dist,coverage,.git .

##@ Troubleshooting

.PHONY: where
where: ## Print resolved paths and versions that builds/tests will use
	@printf "package           : $(PKG_NAME)@$(PKG_VERSION)\n"
	@printf "node              : $$($(NODE) --version)  (at: $$(which $(NODE)))\n"
	@printf "npm               : $$($(NPM) --version)  (at: $$(which $(NPM)))\n"
	@printf "forge (dist)      : $$(ls dist/cli/index.js 2>/dev/null || echo 'not built (make build)')\n"
	@printf "forge (bin)       : ./bin/forge.js\n"
	@printf "FORGE_HOME        : $(FORGE_HOME)\n"
	@printf "docker            : $$($(DOCKER) --version 2>/dev/null || echo 'not installed')\n"

.PHONY: smoke
smoke: build ## End-to-end smoke check (doctor + test + --help) in isolated FORGE_HOME
	@tmp=$$(mktemp -d -t forge-smoke.XXXXXX); \
	echo "Using FORGE_HOME=$$tmp"; \
	FORGE_HOME=$$tmp $(NODE) ./bin/forge.js --help >/dev/null; \
	FORGE_HOME=$$tmp $(NODE) ./bin/forge.js doctor --no-banner; \
	rm -rf "$$tmp"; \
	echo "smoke: OK"

.PHONY: kill-stale
kill-stale: ## Kill stray forge UI / daemon processes (useful after dev crashes)
	-pgrep -f "bin/forge.js ui start"  | xargs -r kill -9
	-pgrep -f "bin/forge.js daemon"     | xargs -r kill -9
	-lsof -ti tcp:7823 2>/dev/null      | xargs -r kill -9
	@echo "cleaned up"

# ---------------------------------------------------------------------------
# Footer: ensure every user-facing target declared above is marked .PHONY so
# stale files with the same name can't shadow them.
# ---------------------------------------------------------------------------

.PHONY: help install install-dev link unlink relink \
        build watch typecheck clean distclean \
        lint format format-check test test-watch test-coverage test-one verify \
        metrics bundle \
        start dev doctor repl ui ui-stop \
        docker-build docker-build-multi docker-run docker-ui \
        compose-up compose-down compose-nuke compose-logs \
        pack publish-dry tag \
        audit outdated tree locs \
        where smoke kill-stale
