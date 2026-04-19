# Forge core image: CLI + daemon. Models live on mounted volumes.
# Multi-stage build keeps the final image small.

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts || npm install --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

FROM node:20-bookworm-slim
WORKDIR /opt/forge
ENV NODE_ENV=production \
    FORGE_HOME=/data/.forge

# Runtime deps that tools use (git, ripgrep, python for plugins, tini for PID 1).
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      git ca-certificates curl ripgrep tini && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json bin ./
COPY bin/forge.js /usr/local/bin/forge
RUN chmod +x /usr/local/bin/forge

VOLUME ["/data", "/workspace"]
WORKDIR /workspace

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["forge", "--help"]
