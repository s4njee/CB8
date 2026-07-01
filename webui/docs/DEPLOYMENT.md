# Deployment Guide

CB8 can run as a desktop app, a headless Electron process, or a standalone Node
server. The desktop/headless Electron modes use an embedded SQLite database; the
**standalone server (Docker / VPS / k8s) requires Postgres** — it reads
`DATABASE_URL` and refuses to start without it. All modes serve the same React
bundle built to `dist/web`.

## Build Targets

```sh
pnpm build:renderer      # build the React SPA into dist/web
pnpm build:standalone    # build dist/standalone.mjs
pnpm package             # build an Electron desktop package for this OS
```

Run `pnpm run typecheck` and `pnpm test` before packaging a release.

## Desktop

Desktop mode starts the embedded server and opens an Electron window pointed at
`http://127.0.0.1:<port>`.

```sh
pnpm start
pnpm package
```

The packaged app serves the built `dist/web` assets.

## Headless

Headless mode still uses Electron's runtime, but opens no window:

```sh
CB8_HEADLESS=1 pnpm start
```

Useful environment variables:

- `CB8_DATA_DIR` — location for `library.db`, uploads, and image cache.
- `CB8_HOST` — bind address. Use `127.0.0.1` for local-only or `0.0.0.0` for LAN.
- `CB8_PORT` — HTTP port.

## Standalone Node

The standalone bundle skips Electron and runs `src/main/standalone.ts` (the API)
through a plain Node entry. `src/main/worker.ts` is the companion background
worker — same build, drains the pg-boss queues (library scans, ebook search
backfill, auto-rescan).

```sh
pnpm build:renderer
pnpm build:standalone
DATABASE_URL=postgres://cb8:<pw>@localhost:5432/cb8 node dist/standalone.mjs
DATABASE_URL=postgres://cb8:<pw>@localhost:5432/cb8 node dist/worker.mjs   # separate process
```

The schema is created automatically on first connection — point `DATABASE_URL`
at an empty database and the app initializes it. Use a `pgvector`-enabled
Postgres (e.g. `pgvector/pgvector:pg18`); the ebook semantic search index needs
the `vector` extension.

Standalone deployments need Node 20+, Postgres 16+ with pgvector, and a usable
7-Zip executable on `PATH`, or `CB8_SEVENZIP_PATH` pointing at `7z`, `7zz`, or
`7za`. `CB8_DATA_DIR` holds only the regenerable image cache and uploaded
archives — the catalog, covers, users, and search vectors all live in Postgres.

## Docker

Docker packaging lives under `packaging/docker/` and mirrors the k8s topology
(`packaging/k8s/`): a Postgres container plus the CB8 API and background worker.

```sh
cd packaging/docker
cp .env.example .env          # set CB8_DB_PASSWORD + BETTER_AUTH_SECRET at minimum
docker compose build          # or set CB8_IMAGE to pull a prebuilt image
docker compose up -d
```

This starts three services — `cb8-postgres` (pgvector/pgvector:pg18), `cb8` (API,
published on `CB8_PUBLISH_PORT`, default 4218 → container 8008), and `cb8-worker`.
**Durable data lives in the `cb8-postgres-data` volume** (catalog, covers, users,
search vectors, job queue); `CB8_DATA_DIR` is just cache + uploads. For a LAN-only
home deployment, publish the port only on the trusted network.

After the stack is healthy, sign in as admin and add the library paths
(`/comics`, `/ebooks`) from the web UI to trigger the first scan.

## First Admin Account

On first boot, CB8 creates an `admin` user and prints the generated password to
stdout. The same password is visible in Settings until it is changed.

If you lose the initial password after it has been cleared, reset the admin
through the desktop menu if available, or recreate the database and rescan the
library.
