# Deployment

CB8 ships three deployment targets that all share the same SQLite library format. You can move a library between them by copying the data directory.

## 1. Desktop (Electron)

Native window with an embedded HTTP server. The window and any browser on your LAN talk to the same server.

**Artifacts** (from [Releases](../../../releases)):

- macOS — `CB8-<version>-arm64.dmg` / `CB8-<version>-x64.dmg`. Not code-signed; on first open right-click → Open, or run `xattr -cr /Applications/CB8.app`.
- Windows — Squirrel installer (`.exe`).
- Linux — `CB8-<version>.AppImage`. `chmod +x` and run.

**LAN sharing.** By default the server binds to `127.0.0.1`. To expose the library to other devices, open **Settings → LAN sharing** and toggle it on. CB8 will rebind to `0.0.0.0` and show the LAN URL.

**Headless mode.** The Electron binary can run without a window:

```sh
/opt/CB8/cb8 --headless --no-sandbox
CB8_HEADLESS=1 /opt/CB8/cb8
```

`--no-sandbox` is needed on most Linux servers because Electron's setuid sandbox helper isn't a good fit for service users. CB8 disables hardware acceleration automatically when started headless.

For most server use cases the Docker or Standalone targets are a better fit than headless Electron.

## 2. Docker

The published image is `ghcr.io/s4njee/cb8:latest` (also tagged with each release). It runs the same server bundle as the standalone target.

```sh
docker pull ghcr.io/s4njee/cb8:latest
docker run -d --name cb8 \
  -p 8008:8008 \
  -v /srv/cb8/data:/var/lib/cb8 \
  -v /mnt/comics:/comics \
  -v /mnt/ebooks:/ebooks \
  ghcr.io/s4njee/cb8:latest
```

**Compose.** A reference `docker-compose.yaml` is bundled in the standalone tarball and at [`packaging/docker/docker-compose.yaml`](../packaging/docker/docker-compose.yaml). Override paths via env or a `.env` file:

```
CB8_DATA_PATH=/srv/cb8/data
CB8_COMICS_PATH=/mnt/raid6/comics
CB8_EBOOKS_PATH=/mnt/raid6/ebooks
CB8_PUBLISH_PORT=4218
```

**Environment variables.**

| Var | Default | Purpose |
| --- | --- | --- |
| `CB8_DATA_DIR` | `/var/lib/cb8` | Where SQLite + thumbnail cache live. |
| `CB8_HOST` | `0.0.0.0` | Bind address. |
| `CB8_PORT` | `8008` | Listen port. |
| `BETTER_AUTH_SECRET` | (generated) | Set explicitly if you want stable session signing across restarts. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | — | Comma-separated extra origins to trust (e.g. when fronted by a reverse proxy with a custom hostname). |

**First-run password.** Run `docker logs cb8 | grep -A3 'Initial admin'` (or read it from **Settings → Account** once signed in).

## 3. Standalone (Node.js)

A single-file ESM bundle for plain Node 20+. No Docker, no Electron.

```sh
tar xzf cb8-standalone.tar.gz
npm install --omit=dev   # pulls native modules (better-sqlite3, @napi-rs/canvas, etc.)
node standalone.mjs
```

The same `CB8_*` and `BETTER_AUTH_*` env vars apply. Use this target for VPS deployments, systemd units, or when you want CB8 inside an existing process tree.

### As a systemd user service

A reference unit lives at [`packaging/systemd/cb8.service`](../packaging/systemd/cb8.service). It targets the Electron headless mode but can be adapted to standalone by changing `ExecStart` to `ExecStart=/usr/bin/node /opt/cb8/standalone.mjs` and adjusting paths.

```sh
mkdir -p ~/.config/systemd/user
cp packaging/systemd/cb8.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now cb8
journalctl --user -u cb8 -e   # the first-boot admin password is printed here
```

For a system service, drop the unit at `/etc/systemd/system/cb8.service`, set `User=` and `Group=` to the account that should own the library, and use `systemctl` without `--user`.

## 4. Kubernetes

Manifests under [`packaging/k8s/`](../packaging/k8s/) deploy the Docker image with hostPath PVs:

```sh
cd packaging/k8s
# Edit kustomization.yaml: image tag + hostPath locations.
kubectl apply -k .
kubectl -n cb8 logs deploy/cb8 | grep -A2 'Initial admin'
```

Service type is `LoadBalancer` on port `8008`. Storage uses `hostPath` PVs (suitable for single-node / homelab clusters); on multi-node clusters add a `nodeSelector` so the pod lands where the directories actually exist. Because SQLite is the source of truth, the Deployment is pinned to `replicas: 1` with a `Recreate` strategy.

## Reverse proxies

CB8 sets cookies on the host it sees in the request and trusts `X-Forwarded-*` headers. If you front it with nginx / Caddy / Traefik on a different hostname, set `BETTER_AUTH_TRUSTED_ORIGINS=https://your.host` so login cookies aren't rejected as cross-site.

## Backups

Everything that matters is in `CB8_DATA_DIR`:

- `library.sqlite` — index, users, read state, settings.
- `thumbs/` — generated cover thumbnails (regeneratable; safe to skip).

Stop the process or use the SQLite online backup API before copying `library.sqlite`. The library files themselves are never modified by CB8 and can be backed up independently.
