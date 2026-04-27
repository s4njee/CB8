# Slim Node-based image for the CB8 web server.
#
# No Electron, no GPU stack, no display server: the standalone entrypoint
# (src/main/standalone.ts → dist/standalone.mjs) opens the SQLite library
# and starts a Fastify server listening on $CB8_PORT (default 8008).
#
# Layout in the runtime image:
#   /app/dist/standalone.mjs   esbuild bundle of all first-party code
#   /app/node_modules/         only production deps (better-sqlite3, sharp, …)
#   /app/web/                  static SPA assets (served by @fastify/static)
# Library data (SQLite + image cache + uploads) lives at $CB8_DATA_DIR
# (default /var/lib/cb8), which the k8s manifest mounts from a PVC.

# --- builder ----------------------------------------------------------------
FROM node:22-bookworm AS builder

WORKDIR /src

RUN corepack enable && corepack prepare pnpm@latest --activate

# Native build deps for better-sqlite3, sharp, @napi-rs/canvas.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 build-essential pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml .npmrc* ./
RUN pnpm install --frozen-lockfile

COPY . .

# Bundle the standalone entrypoint. Native modules stay external and are
# resolved at runtime against /app/node_modules.
RUN pnpm build:standalone

# Re-resolve a production-only node_modules tree for the runtime image so we
# don't ship dev deps (electron, vite, vitest, …).
RUN pnpm prune --prod --config.confirmModulesPurge=false || pnpm install --prod --frozen-lockfile

# --- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim

# sharp + better-sqlite3 native deps. Most are bundled into their .node files
# already; libstdc++/glibc come from the slim base. tini for proper signal
# handling.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --home-dir /var/lib/cb8 --uid 10001 cb8

WORKDIR /app

COPY --from=builder /src/dist/             /app/dist/
COPY --from=builder /src/node_modules/     /app/node_modules/
COPY --from=builder /src/src/web/          /app/web/
COPY --from=builder /src/package.json      /app/package.json

# Drop the SPA into a sibling that resolveStaticRoot() will find. The
# bundled lookup order is: ../../src/web (dev), ../web (packaged), then
# process.resourcesPath/web. /app/dist/standalone.mjs → ../web hits /app/web.

ENV NODE_ENV=production \
    CB8_DATA_DIR=/var/lib/cb8 \
    CB8_PORT=8008 \
    CB8_HOST=0.0.0.0

USER cb8
EXPOSE 8008

ENTRYPOINT ["/usr/bin/tini", "--", "node", "/app/dist/standalone.mjs"]
