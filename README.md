# CB8

CB8 is a desktop comic and book reader. It is an Electron app that hosts an embedded HTTP server, so the same library is reachable from the desktop window and from any browser on your LAN. Files stay on disk; CB8 builds a SQLite index over them.

> Non-generated AI. I built this for myself because I couldn't find a manga reader I liked. There may be bugs — file an issue or send a PR. I'll fix what I run into.

<img width="1152" height="907" alt="library view" src="https://github.com/user-attachments/assets/b1530423-9744-40ad-a74b-9fb1ea0664d7" />
<img width="1152" height="907" alt="reader view" src="https://github.com/user-attachments/assets/7c66a69b-1859-4364-b4d6-d91992c5eacf" />

## Features

- Reads `.cbz`, `.cbr`, `.epub`, `.pdf`, and `.mobi`.
- Page-by-page reader with pinch / pan / swipe on touch and keyboard navigation on desktop.
- Library scanned from folders or individual files. Cover thumbnails are generated and cached.
- Search, tags, virtual folders, and per-collection grouping without moving files on disk.
- Multi-user web access with admin / guest roles and per-user read state.
- Removing items from the library only deletes the database row; the underlying files stay on disk.

Image entries inside archives are sorted with natural filename ordering (`page2.jpg` before `page10.jpg`).

## Installation

Prebuilt installers: see [Releases](../../releases).

Or build from source — see [Development](#development).

## First Run

On the first launch CB8 creates a single admin account and prints its password to stdout (and to the Electron main-process console):

```
============================================================
[CB8] Initial admin account created.
      username: admin
      password: <random 24-char string>
      Sign in and change this password immediately.
============================================================
```

The password is generated from `crypto.randomBytes(18)` and is shown only on this first boot. It is **not** persisted in plaintext anywhere — sign in once and change it from the user menu. If you miss it, the easiest recovery is to delete the SQLite database and let CB8 create a fresh admin on the next launch (your library data lives in the same DB, so this also wipes the index — re-scan to rebuild).

The web UI binds to `0.0.0.0:8008` by default, so other devices on your LAN can reach it at `http://<your-ip>:8008`.

## Development

```sh
pnpm install
pnpm start          # run in dev
pnpm test           # vitest
pnpm typecheck      # tsc --noEmit
pnpm package        # produce a distributable
```

## Headless / Server Mode

CB8 can run without a window — useful for hosting your library on a home server and accessing it from any browser on the LAN.

```sh
pnpm start:headless                       # from a source checkout
/opt/CB8/cb8 --headless --no-sandbox      # from the installed .deb / .rpm
CB8_HEADLESS=1 /opt/CB8/cb8               # env-var alternative
```

`--no-sandbox` is needed on most Linux servers because Electron's setuid sandbox helper isn't a good fit for service users. CB8 also disables hardware acceleration automatically when started headless.

### As a systemd user service

A ready-to-use unit lives at [packaging/systemd/cb8.service](packaging/systemd/cb8.service). To enable it:

```sh
mkdir -p ~/.config/systemd/user
cp packaging/systemd/cb8.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now cb8
journalctl --user -u cb8 -e   # the first-boot admin password is printed here
```

To run as a system service instead, drop the unit at `/etc/systemd/system/cb8.service`, set `User=` and `Group=` to the account that should own the library, and use `systemctl` without `--user`.

### In Kubernetes

A Dockerfile and manifests live under [packaging/](packaging/):

```sh
docker build -f packaging/docker/Dockerfile -t ghcr.io/<you>/cb8:latest .
docker push ghcr.io/<you>/cb8:latest

cd packaging/k8s
# Edit kustomization.yaml: image tag + hostPath locations.
kubectl apply -k .
kubectl -n cb8 logs deploy/cb8 | grep -A2 'Initial admin'
```

The Service is of type `LoadBalancer` on port `8008`. Storage is `hostPath` PVs (suitable for single-node / homelab clusters); on multi-node clusters add a `nodeSelector` so the pod lands where the directories actually exist. Because SQLite is the source of truth, the Deployment is pinned to `replicas: 1` with a `Recreate` strategy.

## Project Layout

- `src/main/` — Electron main process, archive loading, scanning, SQLite, embedded HTTP server, IPC.
- `src/web/` — vanilla-JS SPA (library + reader views), served by the embedded server, also loaded by the Electron window.
- `src/shared/` — types and small utilities used by both sides.
- `docs/` — internal planning notes, refactor logs, feature lists. Not load-bearing for users.
- `packaging/systemd/` — systemd unit for headless mode.
- `packaging/docker/` — Dockerfile for the headless image.
- `packaging/k8s/` — Kubernetes manifests (Deployment + LoadBalancer + hostPath PVs) with a kustomization for per-cluster overrides.

The root `CMakeLists.txt` is a leftover from an earlier Qt/C++ prototype and is unused.

## License

MIT — see [LICENSE](LICENSE).
