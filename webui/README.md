# CB8

CB8 is a self-hosted comic and book reader for the library you already own. Point it at the folders where your `.cbz`, `.cbr`, `.epub`, `.pdf`, and `.mobi` files live and it builds a browsable, searchable index over them — covers, metadata, reading progress, tags, and collections — without ever moving, renaming, or rewriting the originals. Your files stay exactly where they are; CB8 only keeps an index alongside them.

It runs three ways from the same codebase: as an Electron desktop app, as a Docker container, or as a plain Node.js server. All three host the same embedded HTTP server, so the library is reachable from the desktop window and from any browser on your LAN at the same time. The frontend is a React + shadcn/Tailwind single-page app under `src/renderer`, built into `dist/web` and served by that embedded server, so the desktop window and a phone browser get the identical reading experience. Files stay on disk; CB8 builds a SQLite index over them.

The reader is the point: a fast, full-screen page view tuned for long sessions — pinch, pan, and swipe on touch, keyboard shortcuts on desktop, single-page or two-page spreads, and left-to-right or right-to-left paging for manga. EPUBs get a reflowable text reader with themes, adjustable type, and font choices. Because everything is one local-first index over files you control, you can rescan, re-tag, or remove items from the library at any time and your actual files are never touched.

> Non-generated AI. I built this for myself because I couldn't find a manga reader I liked. There may be bugs — file an issue or send a PR. I'll fix what I run into.

<img width="1668" height="1312" alt="Screenshot_20260427_140312" src="https://github.com/user-attachments/assets/66bf41a4-d29f-4211-a596-3c0f12b5397b" />
<img width="2542" height="1180" alt="Screenshot_20260427_140351" src="https://github.com/user-attachments/assets/f62c4768-8e72-4045-a862-d04ed7a8f6be" />


## How it works

CB8 scans the folders you give it and records what it finds in a local index — one row per book, plus generated cover thumbnails. Archives (`.cbz` / `.cbr`) are read in place: when you open a comic, pages are extracted and decoded on demand and cached, so nothing is unpacked to disk ahead of time. EPUBs, PDFs, and MOBIs are parsed for their own structure and rendered by the matching reader. Reading position, bookmarks, favorites, and tags are stored against that index per user, so picking up where you left off works across the desktop app and any browser pointed at the same server.

Everything is organized as a view over the index rather than a layout on disk. Tags, virtual folders, series grouping, and search all rearrange how the library is presented without ever moving the underlying files, and deleting an item only drops its index row. That makes the library safe to experiment with and trivial to rebuild — if anything looks off, a rescan reconstructs it from the files themselves.

## Features

- Reads `.cbz`, `.cbr`, `.epub`, `.pdf`, and `.mobi`.
- Page-by-page reader with pinch / pan / swipe on touch and keyboard navigation on desktop.
- EPUB reader with theme toggle, adjustable font size, and Google Fonts integration.
- Library scanned from folders or individual files. Cover thumbnails are generated and cached.
- Search, tags, virtual folders, and per-collection grouping without moving files on disk.
- Multi-user web access with admin / guest roles and per-user read state.
- Removing items from the library only deletes the database row; the underlying files stay on disk.

Image entries inside archives are sorted with natural filename ordering (`page2.jpg` before `page10.jpg`).

See [docs/READER.md](docs/READER.md) for a tour of the reader UI.

## Installation

CB8 ships in three flavours. Pick whichever fits your setup — the library format and web UI are identical.

| Target | What you get | Best for |
| --- | --- | --- |
| **Desktop** | Native window with embedded server. macOS `.dmg`, Windows installer, Linux `.AppImage`. | Daily reading on a laptop / desktop. |
| **Docker** | `ghcr.io/s4njee/cb8:latest`, headless server. | Home server, NAS, Kubernetes. |
| **Standalone** | Single `standalone.mjs` bundle, runs on plain Node 20+. | VPS or anywhere you don't want a container. |

Prebuilt artifacts for all three are published with each [Release](../../releases). Detailed instructions in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

CBZ and CBR reading uses a native 7-Zip executable through `node-7z`. Docker
images install this automatically. Desktop and standalone runs need `7z` on
`PATH`, or `CB8_SEVENZIP_PATH` pointing at a `7z`, `7zz`, or `7za` executable.

### Quick start — Docker

The standalone server needs Postgres, so the compose file brings up Postgres, the
API, and the background worker together (mirrors `packaging/k8s`):

```sh
cd packaging/docker
cp .env.example .env            # set CB8_DB_PASSWORD + BETTER_AUTH_SECRET
docker compose up -d --build    # or set CB8_IMAGE to pull a prebuilt image
```

Then open `http://<host>:4218/`, sign in as admin, and add your library paths.

### Quick start — Desktop

Download the installer for your platform from [Releases](../../releases). On Linux, mark the AppImage executable and run it:

```sh
chmod +x CB8-*.AppImage
./CB8-*.AppImage
```

### Quick start — Standalone

```sh
tar xzf cb8-standalone.tar.gz
npm install --omit=dev
# Requires a pgvector-enabled Postgres; the schema is created on first connect.
DATABASE_URL=postgres://cb8:<pw>@localhost:5432/cb8 node standalone.mjs
```

## First Run

On first launch CB8 creates a single `admin` account and stores its initial password in the database under `app_meta`. The password is also printed to stdout:

```
============================================================
[CB8] Initial admin account created.
      username: admin
      password: <random 24-char string>
      Sign in and change this password immediately.
============================================================
```

The password remains visible in **Settings → Account** until you change it (at which point CB8 wipes the stored copy). If you lose it before changing it, sign in with the value shown there. If the row has been cleared and you don't remember the password, reset the admin against the catalog database (the desktop app's SQLite file, or the server's Postgres) and let CB8 recreate a fresh admin on next launch — your catalog lives in that same database, so you'll then re-scan the library.

The web UI binds to `127.0.0.1:8008` by default. To expose it to the LAN, toggle **Settings → LAN sharing** in the desktop app, or set `CB8_HOST=0.0.0.0` for headless deployments. Then reach it at `http://<your-ip>:8008`.

## Development

```sh
pnpm install
pnpm start              # Electron dev mode
pnpm start:headless     # headless dev (no window)
pnpm dev:renderer       # Vite dev server for the React renderer
pnpm build:renderer     # build src/renderer into dist/web
pnpm build:standalone   # build dist/standalone.mjs
pnpm test               # vitest
pnpm typecheck          # tsc --noEmit
pnpm package            # produce a distributable for the host platform
```

## Project Layout

- `src/main/` — main process: archive loading, scanning, SQLite, embedded Fastify server, IPC. Decoupled from Electron so the standalone bundle can reuse it.
- `src/renderer/` — React + shadcn/Tailwind frontend. Vite builds this into `dist/web`, which the embedded server serves for Electron, Docker, standalone, and LAN browser clients.
- `src/shared/` — types and small utilities used by both sides.
- `docs/` — user-facing documentation, current architecture/onboarding notes, and archival plans from earlier directions.
- `packaging/docker/` — Dockerfile and `docker-compose.yaml` for the headless image.
- `packaging/k8s/` — Kubernetes manifests (Deployment + LoadBalancer + hostPath PVs) with a kustomization for per-cluster overrides.
- `packaging/systemd/` — systemd unit for headless mode.

## License

MIT — see [LICENSE](LICENSE).
