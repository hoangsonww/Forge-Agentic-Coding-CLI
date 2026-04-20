# syntax=docker/dockerfile:1.7
# =============================================================================
# Forge — production Dockerfile (CLI + UI + daemon).
#
# Build:
#   docker build -f docker/Dockerfile -t forge/core:dev .
#
# Run the CLI:
#   docker run --rm -it \
#     -v forge-home:/data \
#     -v "$PWD:/workspace" \
#     forge/core:dev
#
# Run the UI:
#   docker run --rm -p 7823:7823 \
#     -v forge-home:/data \
#     forge/core:dev forge ui start --bind 0.0.0.0
#
# Podman:
#   podman build -f docker/Dockerfile -t forge/core:dev .
#   podman run --rm -it -v forge-home:/data forge/core:dev
# =============================================================================

# ---------- Stage 1: build ---------------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
# Build-only deps. Keep this cache-friendly: deps first, source second.
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts || npm install --ignore-scripts

COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
# `npm run build` runs tsc AND copies src/ui/public → dist/ui/public. Skipping
# the script would ship a UI image with no static assets.
RUN npm run build

# Prune dev dependencies so the runtime stage only copies what it needs.
RUN --mount=type=cache,target=/root/.npm \
    npm prune --omit=dev

# ---------- Stage 2: runtime -------------------------------------------------
FROM node:20-bookworm-slim AS runtime

# Args so downstream tooling can bake version/commit into the image.
ARG FORGE_VERSION=dev
ARG FORGE_COMMIT=unknown
ARG BUILD_DATE

LABEL org.opencontainers.image.title="Forge" \
      org.opencontainers.image.description="Local-first agentic coding CLI + dashboard" \
      org.opencontainers.image.version="${FORGE_VERSION}" \
      org.opencontainers.image.revision="${FORGE_COMMIT}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="https://github.com/forge/forge" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    FORGE_HOME=/data/.forge \
    FORGE_UI_BIND=0.0.0.0 \
    FORGE_UI_PORT=7823

# Runtime dependencies: git (code tooling), ripgrep (code search), ca-certs
# (outbound TLS), tini (PID 1 reaping), curl (healthcheck + installers).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
         git ca-certificates curl ripgrep tini \
    && rm -rf /var/lib/apt/lists/*

# Non-root user owns everything. A fixed UID (10001) makes volume mounts
# predictable across hosts.
RUN groupadd --system --gid 10001 forge \
    && useradd  --system --uid 10001 --gid forge --home /home/forge --create-home --shell /usr/sbin/nologin forge \
    && mkdir -p /opt/forge /data /workspace \
    && chown -R forge:forge /opt/forge /data /workspace

WORKDIR /opt/forge

# Copy built artefacts + pruned runtime deps.
COPY --chown=forge:forge --from=builder /app/dist        ./dist
COPY --chown=forge:forge --from=builder /app/node_modules ./node_modules
COPY --chown=forge:forge package.json ./
COPY --chown=forge:forge bin ./bin

# Shim on PATH so `forge` is runnable without knowing the install path.
RUN ln -sf /opt/forge/bin/forge.js /usr/local/bin/forge \
    && chmod +x /opt/forge/bin/forge.js

# Persistent state + user workspace volumes.
VOLUME ["/data", "/workspace"]
WORKDIR /workspace

# Health: `forge doctor` exits non-zero when no provider is reachable AND
# config is broken. Allows orchestrators to detect a wedged container.
HEALTHCHECK --interval=60s --timeout=10s --start-period=15s --retries=3 \
    CMD forge doctor --no-banner > /dev/null 2>&1 || exit 1

EXPOSE 7823

USER forge
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["forge", "--help"]
