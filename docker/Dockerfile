# syntax=docker/dockerfile:1.7

# ---- Builder ----------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

# Build deps for native modules (better-sqlite3, sharp).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json vite.server.config.ts ./
COPY src ./src

# Build the Fastify server bundle.
RUN pnpm run build

# Build the SvelteKit frontend (outputs to src/web-next/build).
RUN pnpm web:build

# Prune to production deps for the runtime image.
RUN pnpm install --frozen-lockfile --prod \
 && pnpm store prune

# ---- Runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

# sharp needs libvips at runtime; ca-certificates for outbound HTTPS metadata fetches.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libvips42 ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    CB8_DATA_DIR=/data \
    CB8_PORT=8008 \
    CB8_HOST=0.0.0.0

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# Serve the SvelteKit build; resolveStaticRoot() finds src/web as a fallback.
COPY --from=builder /app/src/web-next/build ./src/web
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /data /ebooks /comics

VOLUME ["/data", "/ebooks", "/comics"]
EXPOSE 8008

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server/main.cjs"]
