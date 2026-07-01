# Deploying CB8 to the homelab host (freya / 192.168.1.248)

This is the operational runbook for the single production deployment: the `cb8`
Docker container on **`sanjee@192.168.1.248`** (hostname `freya`), exposed on
**host port 4218** (→ container `8008`).

For the general, multi-target deployment story (generic Docker, standalone
Node, k8s) see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). This file is
specifically the "push my local changes to 248" procedure.

## How the deployment is wired

The host runs a **prebuilt `cb8:latest` image** via a standalone compose file —
it does *not* build from a checked-out repo on the host, so the image must be
built (or rebuilt) and tagged `cb8:latest`, then the container recreated.

| Thing | Location on 248 |
| --- | --- |
| Compose file + `.env` (port, secrets, mount paths) | `~/cb8-compose/` |
| Source/build scratch dir (ephemeral, recreated each deploy) | `~/cb8-build/` |
| Postgres data — catalog, covers, users/sessions, search vectors, job queue (**the durable state**) | `cb8-postgres-data` Docker volume |
| Image cache + uploaded archives (regenerable) | `/srv/cb8/data` → container `/var/lib/cb8` |
| Comics library (read-only source) | `/mnt/raid6/comics` → `/comics` |
| Ebooks library (read-only source) | `/mnt/raid6/ebooks` → `/ebooks` |

The compose stack is three services — `cb8-postgres`, `cb8` (API), and
`cb8-worker` — mirroring the k8s topology. `~/cb8-compose/.env` holds
`CB8_PUBLISH_PORT=4218`, `CB8_DB_PASSWORD` (the Postgres password, baked into
`DATABASE_URL`), and, crucially, `BETTER_AUTH_SECRET`. **Recreating via this
compose file keeps the secret and DB password stable**, so existing logins and
the Postgres volume survive a redeploy. Do not `docker run` the image by hand —
you'd lose the secret and log everyone out.

The image build runs entirely inside the Dockerfile (`pnpm install` →
`pnpm build:standalone`, which via the `prebuild:standalone` hook also runs
`build:renderer` to produce `dist/web`). Native modules (better-sqlite3, sharp,
@napi-rs/canvas) are compiled in the builder stage, so the build takes several
minutes.

## Deploy procedure

Run these from a clone of this repo on your workstation. The deploy ships your
**current working tree** (not just committed code), so commit first if you want
the deploy to match `main`.

### 1. Package the source

Exclude build artifacts and local junk; `.dockerignore` re-excludes them inside
the build context, but keeping them out of the tarball makes the copy ~600 KB.

```sh
tar --exclude=node_modules --exclude=.git --exclude=dist --exclude=.vite \
    --exclude=out --exclude=scratch --exclude=coverage --exclude='*.log' \
    --exclude='*.tar.gz' -czf /tmp/cb8-src.tar.gz .
```

### 2. Ship it to the host

```sh
ssh sanjee@192.168.1.248 'rm -rf ~/cb8-build && mkdir -p ~/cb8-build'
scp /tmp/cb8-src.tar.gz sanjee@192.168.1.248:~/cb8-build/cb8-src.tar.gz
ssh sanjee@192.168.1.248 'cd ~/cb8-build && tar xzf cb8-src.tar.gz && rm cb8-src.tar.gz'
```

### 3. Build the image on the host

```sh
ssh sanjee@192.168.1.248 \
  'cd ~/cb8-build && docker build -f packaging/docker/Dockerfile -t cb8:latest .'
```

The compose file pins `image: ${CB8_IMAGE:-cb8:latest}`, so tagging the fresh
build `cb8:latest` is what makes the next step pick it up.

### 4. Recreate the container (preserves data + auth secret)

```sh
ssh sanjee@192.168.1.248 \
  'cd ~/cb8-compose && docker compose up -d --force-recreate'
```

`--force-recreate` guarantees the containers restart onto the new image even
though the tag name is unchanged. The Postgres volume (`cb8-postgres-data`), the
cache dir (`/srv/cb8/data`), and the `.env` (port, `CB8_DB_PASSWORD`,
`BETTER_AUTH_SECRET`) are untouched. The `cb8-worker` service is recreated onto
the new image alongside the API.

### 5. Verify

```sh
ssh sanjee@192.168.1.248 'docker ps --filter name=cb8 --format "{{.Status}} {{.Ports}}"'
ssh sanjee@192.168.1.248 'curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4218/'
```

Expect `Up ... (healthy)` mapping `0.0.0.0:4218->8008/tcp` and HTTP `200`.
From the LAN the app is at `http://192.168.1.248:4218/` (and
`http://freya.local:4218/`).

## Rollback

Docker keeps the previous image layers until pruned. If a deploy goes bad and
you tagged the old image, retag and recreate. As a habit, before step 3 you can
snapshot the current image:

```sh
ssh sanjee@192.168.1.248 'docker tag cb8:latest cb8:prev'
# ...if the new build is bad:
ssh sanjee@192.168.1.248 'docker tag cb8:prev cb8:latest && cd ~/cb8-compose && docker compose up -d --force-recreate'
```

The durable data lives in Postgres and is never modified by an image redeploy,
so a rollback is image-only. Back up the catalog with `pg_dump` before any change
you consider risky:

```sh
ssh sanjee@192.168.1.248 \
  'docker exec cb8-postgres pg_dump -U cb8 -d cb8' > cb8-$(date +%F).sql
```

Restore into a fresh stack with `docker exec -i cb8-postgres psql -U cb8 -d cb8`.
The on-disk library files under `/mnt/raid6` are the original source and are
never written to, so the catalog can also be rebuilt from scratch by re-adding
the library paths and rescanning.

## Notes / gotchas

- **First-run admin password** is only printed on a fresh data dir. This host is
  already provisioned, so a redeploy will not reprint it. Recover via
  **Settings → Account** while signed in.
- The compose file's `build:` block has `context: ../..`, which only resolves
  when the compose file sits at `<repo>/packaging/docker/`. On the host it lives
  at `~/cb8-compose/`, so `docker compose build` there will **not** work — always
  build with the explicit `docker build` in step 3.
- `BETTER_AUTH_TRUSTED_ORIGINS` in `.env` must list every hostname/port the app
  is reached by (e.g. `http://192.168.1.248:4218`, `http://freya.local:4218`) or
  logins from those origins are rejected as cross-site.
