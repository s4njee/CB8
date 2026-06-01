# PLAN7: CB8 Sync Server

Goal: run a self-hosted sync server on the freya/netcup k8s clusters that keeps library state, per-user reading progress, and — when needed — comic archive bytes consistent across multiple CB8 desktops. Desktop stays local-first for files it already has and falls back to server streaming for files it does not.

Baseline docs:
- `README.md`
- `AGENTS.md`
- `PLAN3.md` — WebSocket progress sync (superseded by this plan)
- `PLAN5.md` — multi-user web UI spec (complementary; sync server is its backend)
- `PLAN6.md` — webServer refactor (done first so routes can be added cleanly)
- `.kiro/specs/comic-book-reader/`

Related infra references:
- `~/Documents/projects/csearch-updater-root/k8s/` — layout to mirror for k8s manifests
- `~/Documents/projects/csearch-updater-root/argo/applications/` — argo Application template
- `registry.s8njee.com` — image registry
- Bitnami SealedSecrets — secret management pattern

## Architecture

- `cb8-sync` — Rust service (axum + sqlx). Rust to match the csearch scraper toolchain and because archive streaming wants zero-copy `Range` handling.
- Postgres via the Bitnami chart — canonical sync state. Schema is a superset of the desktop SQLite schema.
- S3-compatible object storage for archive bytes. Default: Cloudflare R2 (already in stack). Fallback option: MinIO on-cluster.
- Redis for short-lived sync tokens, presigned URL cache, and WebSocket fanout.
- Auth reuses CB8's existing username/password scheme. Login issues a JWT. Admin role carries over unchanged.
- Argo Application at `argo/applications/cb8-sync.yaml`. Manifests under `k8s/freya-cb8-sync/` (dev) and `k8s/netcup-cb8-sync/` (prod). Images pushed to `registry.s8njee.com/cb8-sync`.

Desktop is a pure client. It holds a local SQLite cache and a file library; the server is the source of truth for everything that crosses machine boundaries.

## Identity model

The load-bearing change: a comic is identified by **content hash (SHA-256 of the full archive file)**, not by path.

- Server: `comics.content_hash` is the primary key. `file_path` does not exist server-side.
- Desktop: `comics.file_path` remains machine-local and never leaves the device. A new `comics.content_hash` column is computed on scan and is the only identifier used in sync payloads.
- All cross-table foreign keys that currently point at `comics.id` migrate to `content_hash BYTEA(32)` on the server. This is simpler than maintaining an int-id ↔ hash mapping across devices.

## Data model changes

### Server (Postgres)

New or changed tables:

- `comics` — PK `content_hash BYTEA(32)`, plus all metadata columns that currently live in desktop `comics` except `file_path`, `id`, and thumbnail BLOB. Thumbnails live on object storage with the archive.
- `comic_blobs(content_hash PK, storage_key, size, mime, uploaded_at, uploader_user_id)` — pointer to the archive in object storage.
- `devices(id PK, user_id FK, name, last_seen, created_at)` — used for conflict attribution and a future "devices" UI.
- `sync_cursor(user_id, device_id, last_seq)` — composite PK. Tracks how far each device has pulled.
- `change_log(seq BIGSERIAL PK, user_id, entity, entity_id, op, payload JSONB, ts)` — append-only. `seq` is the monotonic sync cursor. Covers mutations and tombstones.

Migrated tables (keys change from `comic_id INT` to `content_hash BYTEA(32)`):

- `user_progress`, `user_favorites`, `bookmarks`, `reading_history`
- `libraries`, `library_comics`, `library_folders`
- `folders`, `folder_comics`
- `tags`, `comic_tags`

`users` and `dismissed_paths` do not sync. `app_meta` does not sync (it is machine-local).

### Desktop (SQLite)

- Add `comics.content_hash BLOB` (nullable until first hash pass completes).
- Add `sync_cursor(server_url TEXT PK, last_seq INTEGER, last_pulled_at INTEGER)`.
- Add `sync_queue(id PK, entity, entity_id, op, payload, client_seq, enqueued_at)` — buffers outbound mutations when offline. `(device_id, client_seq)` is the server-side idempotency key.
- Keep `file_path`. It is now strictly machine-local and is stripped from every outbound payload.

## Sync protocol

Pull-based with an optional WebSocket push-to-wake:

- `POST /api/v1/auth/login` → `{jwt, device_id}`. Registers the device on first call per machine.
- `GET /api/v1/sync/pull?since=<seq>&limit=<n>` → ordered `change_log` entries `seq > since` for the calling user. Response includes `next_seq` and `has_more`.
- `POST /api/v1/sync/push` → batch of client mutations `{entity, entity_id, op, payload, client_ts, client_seq}`. Server assigns `seq` per accepted item and returns `{accepted: [...], rejected: [...], new_cursor}`. Idempotent on `(device_id, client_seq)`.
- `WS /api/v1/sync/subscribe` → server emits `{user_id, new_seq}` pings. Client responds by calling `/pull`. WS is an optimization, not a correctness requirement — polling at a low cadence works equivalently.

### Conflict resolution

- `user_progress`: last-writer-wins on `max(last_read)`. Server wall-clock is the tiebreaker when `last_read` is equal.
- `user_favorites`, `bookmarks`, `tags`, `comic_tags`, `library_comics`, `folder_comics`, `library_folders`: additive sets with explicit tombstones. Merge is union minus tombstones.
- `libraries`, `folders` rename/create: last-writer-wins on `ts`.
- `reading_history`: append-only, no conflicts possible.

## File handling

- `POST /api/v1/comics/:hash/upload` → multipart. Server writes bytes to object storage at `sha256/<hex>.<ext>`, inserts `comic_blobs`, appends a `change_log` entry.
- `GET /api/v1/comics/:hash/archive` → `Range`-capable. R2 path issues a short-lived presigned URL; MinIO path streams through the service.
- `GET /api/v1/comics/:hash/page/:n` → server extracts a single page from the archive. Used by the web UI (PLAN5) and by desktop when streaming a comic it does not have locally.
- `GET /api/v1/comics/:hash/thumbnail` → cached on first request.

Desktop read path:
1. Look up `content_hash` → `file_path` locally. If the file exists and hashes match → open locally.
2. Otherwise call `/page/:n` (or `/archive` for bulk-decode readers). UI shows a cloud indicator for remote-only comics and a progress badge during streaming.

## Phase 1: Content hashing on desktop

Problem: no cross-machine comic identity exists today. Sync cannot begin without one.

Changes:
- Add `content_hash BLOB` to the desktop `comics` schema with a migration that sets existing rows to `NULL`.
- On scan (`library:scan`, `library:scan-books`, `library:add-files`), compute SHA-256 of the full file on a worker thread. Persist on the row.
- Backfill job that runs in the background after startup and fills `NULL` hashes for existing rows.
- Expose `contentHash` (hex) on `ComicRecord` for queries. Do not expose it in the web API yet (PLAN5 is independent).
- No server involvement this phase.

Acceptance checks:
- A fresh scan of a 1,000-comic library populates `content_hash` for every row without blocking the UI.
- Restart after interrupting backfill resumes and completes.
- `pnpm run typecheck` passes.
- `pnpm test` passes, including a new hashing test against a small fixture archive.

## Phase 2: Server skeleton

Problem: no sync service exists.

Changes:
- New repo or top-level directory for `cb8-sync` (axum, sqlx, tokio). Decide placement alongside or inside the CB8 repo during implementation.
- Postgres schema migration `0001_init.sql`: `users`, `devices`, `comics`, `comic_blobs`, `change_log`, `sync_cursor`, and one target table from the sync set (pick `user_progress`) to prove the pipeline end-to-end.
- `/api/v1/auth/login`, `/api/v1/auth/me`, device registration.
- Health and readiness endpoints.
- Dockerfile, CI build to `registry.s8njee.com/cb8-sync:<sha>`.
- `k8s/freya-cb8-sync/` with Deployment, Service, Postgres StatefulSet (Bitnami chart), SealedSecret for DB credentials and JWT signing key.
- `argo/applications/cb8-sync.yaml` pointing at freya.

Acceptance checks:
- Argo syncs the Application green.
- `curl` login flow returns a JWT; `me` echoes the user.
- Device registration persists across restarts (`devices.last_seen` updates).
- `cargo test` and `cargo clippy -- -D warnings` pass.

## Phase 3: Metadata push/pull

Problem: desktop machines still do not share any state.

Changes:
- Implement `/api/v1/sync/push` and `/api/v1/sync/pull` for `user_progress`, `user_favorites`, `bookmarks`, `tags`, `comic_tags`, `reading_history`.
- Desktop sync loop in `src/main/`: a periodic `pull`, a debounced `push` after local mutations, a `sync_queue` drain on reconnect. Plumb through IPC so the renderer sees sync state (`syncing`, `idle`, `offline`, `error`).
- WebSocket `/api/v1/sync/subscribe` for push-to-wake.
- Conflict resolution as specified above. Server rejects malformed or unauthorized entries and returns reason codes.
- Desktop writes never block the UI; they go to `sync_queue` immediately.

Acceptance checks:
- Two desktops signed in as the same user converge on progress within 2s of a page change when WS is connected, and within one pull interval when it is not.
- Kill WS mid-read — progress still converges on the next `/pull`.
- Offline mutation → reconnect → server accepts once. Replaying the same `(device_id, client_seq)` is a no-op.
- Favorites and bookmarks created independently on two devices both survive merge.
- `pnpm run typecheck` and `pnpm test` pass on desktop; `cargo test` passes on the server.

## Phase 4: Blob storage and remote reading

Problem: machines without a given `.cbz` cannot open it even if they know it exists.

Changes:
- Provision R2 bucket via Cloudflare; store credentials as a SealedSecret. Fallback MinIO manifest kept under `k8s/freya-cb8-sync/minio.optional.yaml` for users who want on-cluster storage.
- `POST /api/v1/comics/:hash/upload` with multipart streaming into R2. Dedup on `content_hash`.
- `GET /api/v1/comics/:hash/archive` — presigned URL for R2, streaming proxy for MinIO. `Range` header passed through.
- `GET /api/v1/comics/:hash/page/:n` — single-page extract. Cache decoded page bytes in Redis with a short TTL.
- Desktop: on add-to-library, enqueue a background upload if the server does not yet have the hash (`HEAD /api/v1/comics/:hash`).
- Desktop reader resolver switches to remote fetch when the local file is missing or hash-mismatched.
- Web UI (PLAN5) points its page fetch at the same endpoints.

Acceptance checks:
- Adding a comic on desktop A, then opening it on desktop B (which does not have the file) streams pages with working `Range` scrubbing.
- `/archive` returns `206 Partial Content` for valid `Range` requests.
- Duplicate upload of the same `content_hash` is a server no-op and returns the existing blob record.
- Storage costs visible in the existing Grafana dashboards after Phase 6.

## Phase 5: Libraries, folders, and tag-set sync

Problem: per-user library/folder organization is the remaining non-synced state.

Changes:
- Add `libraries`, `library_comics`, `library_folders`, `folders`, `folder_comics` to the change_log schema and the push/pull set.
- Implement tombstones (`op: "delete"`) and merge as union minus tombstones.
- Handle library/folder rename as last-writer-wins on `ts`.
- UI: surface conflict indicators only when a rename collision occurs; all other merges are silent.

Acceptance checks:
- Creating the same library name on two offline desktops, then reconnecting, results in one library with both memberships merged.
- Deleting a library on desktop A propagates to desktop B on next pull; undo-within-window is not required in this phase.
- Tag additions and removals converge correctly in mixed online/offline scenarios.

## Phase 6: Netcup promotion and observability

Problem: freya is dev; production needs its own argo app and the same logging/metrics story as csearch.

Changes:
- `k8s/netcup-cb8-sync/` mirroring the freya manifests, pointed at netcup Postgres.
- Promote `argo/applications/cb8-sync.yaml` or split into `cb8-sync-freya.yaml` and `cb8-sync-netcup.yaml` following the csearch convention.
- Wire Fluent Bit to capture structured logs; add a Grafana dashboard for sync throughput, push/pull latency, WebSocket connection counts, and R2 egress.
- Runbook addition: backup cadence for `change_log` and object storage.

Acceptance checks:
- Zero-downtime rollout on netcup verified via two consecutive argo syncs while a desktop is actively syncing.
- Grafana dashboard shows non-zero traffic after a real-world day of use.
- Log queries in the existing Fluent Bit pipeline surface per-user sync errors.

## Open questions (resolve before or during implementation; not blockers for Phase 1)

- R2 vs. MinIO for primary blob storage. R2 is cheaper and already in the stack; MinIO keeps everything on-cluster. Default is R2 unless a privacy reason surfaces.
- Whether to encrypt archives at rest with a per-user key. Adds real complexity; defer unless required.
- Whether to expose the sync server as an OPDS root (reuses PLAN5 OPDS work) so third-party readers can consume a user's library directly.
- Whether to ship a "web-only" mode where desktop is skipped entirely and the server's web UI is the only client. Likely yes, but not required for Phase 3 correctness.
