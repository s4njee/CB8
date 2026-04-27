# CB8

CB8 is a comic and book reader. It runs three ways from the same codebase: as an Electron desktop app, as a Docker container, or as a plain Node.js server. All three host the same embedded HTTP server, so the library is reachable from the desktop window and from any browser on your LAN. Files stay on disk; CB8 builds a SQLite index over them.

> Non-generated AI. I built this for myself because I couldn't find a manga reader I liked. There may be bugs — file an issue or send a PR. I'll fix what I run into.

<img width="1152" height="907" alt="library view" src="https://github.com/user-attachments/assets/b1530423-9744-40ad-a74b-9fb1ea0664d7" />
<img width="1152" height="907" alt="reader view" src="https://github.com/user-attachments/assets/7c66a69b-1859-4364-b4d6-d91992c5eacf" />

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

### Quick start — Docker

```sh
docker pull ghcr.io/s4njee/cb8:latest
# Or use the compose file from the standalone tarball:
docker compose -f docker-compose.yaml up -d
```

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
node standalone.mjs
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

The password remains visible in **Settings → Account** until you change it (at which point CB8 wipes the stored copy). If you lose it before changing it, sign in with the value shown there. If the row has been cleared and you don't remember the password, delete the SQLite database and let CB8 create a fresh admin on next launch — your library data lives in the same DB, so you'll need to re-scan.

The web UI binds to `127.0.0.1:8008` by default. To expose it to the LAN, toggle **Settings → LAN sharing** in the desktop app, or set `CB8_HOST=0.0.0.0` for headless deployments. Then reach it at `http://<your-ip>:8008`.

## Development

```sh
pnpm install
pnpm start              # Electron dev mode
pnpm start:headless     # headless dev (no window)
pnpm build:standalone   # build dist/standalone.mjs
pnpm test               # vitest
pnpm typecheck          # tsc --noEmit
pnpm package            # produce a distributable for the host platform
```

## Project Layout

- `src/main/` — main process: archive loading, scanning, SQLite, embedded Fastify server, IPC. Decoupled from Electron so the standalone bundle can reuse it.
- `src/web/` — vanilla-JS SPA (library + reader views), served by the embedded server, also loaded by the Electron window.
- `src/shared/` — types and small utilities used by both sides.
- `docs/` — user-facing documentation (deployment, reader features) and internal planning notes.
- `packaging/docker/` — Dockerfile and `docker-compose.yaml` for the headless image.
- `packaging/k8s/` — Kubernetes manifests (Deployment + LoadBalancer + hostPath PVs) with a kustomization for per-cluster overrides.
- `packaging/systemd/` — systemd unit for headless mode.

## License

MIT — see [LICENSE](LICENSE).
