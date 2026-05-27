# Slim Node-based image for the CB8 web server.
#
# No Electron, no GPU stack, no display server: the standalone entrypoint
# (src/main/standalone.ts -> dist/standalone.mjs) opens the SQLite library
# and starts a Fastify server listening on $CB8_PORT (default 8008).
#
# Layout in the runtime image:
#   /app/dist/standalone.mjs   esbuild bundle of all first-party code
#   /app/node_modules/         runtime dependencies
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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
RUN pnpm install --frozen-lockfile

COPY . .

# Bundle the standalone entrypoint. Native modules stay external and are
# resolved at runtime against /app/node_modules.
RUN pnpm build:standalone

# --- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim

# sharp + better-sqlite3 native deps. Most are bundled into their .node files
# already; libstdc++/glibc come from the slim base. tini handles signals.
# node-7z shells out to 7z for CBZ/CBR handling. Debian keeps the RAR
# extraction codec in non-free, so enable that component before installing.
RUN sed -i 's/Components: main/Components: main contrib non-free non-free-firmware/g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates tini p7zip-full p7zip-rar unrar \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --home-dir /var/lib/cb8 --uid 10001 cb8

WORKDIR /app

COPY --from=builder /src/dist/             /app/dist/
COPY --from=builder /src/node_modules/     /app/node_modules/
COPY --from=builder /src/src/web/          /app/web/
COPY --from=builder /src/package.json      /app/package.json

# Drop the SPA into a sibling that resolveStaticRoot() will find. The
# bundled lookup order is: ../../src/web (dev), ../web (packaged), then
# process.resourcesPath/web. /app/dist/standalone.mjs -> ../web hits /app/web.

ENV NODE_ENV=production \
    CB8_DATA_DIR=/var/lib/cb8 \
    CB8_PORT=8008 \
    CB8_HOST=0.0.0.0 \
    CB8_SEVENZIP_PATH=/usr/bin/7z \
    UV_THREADPOOL_SIZE=64

USER cb8
EXPOSE 8008

ENTRYPOINT ["/usr/bin/tini", "--", "node", "/app/dist/standalone.mjs"]
