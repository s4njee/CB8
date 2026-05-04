# CB8 Design

This document is the implementation plan for the requirements in `requirements.md`. It fixes the tech stack, names the moving parts, and pins down the contracts between them. `tasks.md` sequences the work.

## 1. Architecture overview

```
                ┌────────────────────────────────────────┐
                │              cb8 (single binary)        │
                │                                        │
   browser ───► │  HTTP edge ──► API ──► services ──► DB │
                │                  │       │         (Postgres 16)
   OPDS  ─────► │  HTTP edge ──► OPDS ─────┘         │
   client       │                  │                 │
                │            River queue (in-DB)     │
                │                  │                 │
                │            workers (in-process)    │
                │                  │                 │
                │  filesystem ◄────┘  (libvips, archive readers)
                └────────────────────────────────────────┘

   Library roots ──► fsnotify watcher ──► scan jobs
   Derivative cache (covers, page WebPs) on local disk
```

Single Go process. Postgres is the only stateful dependency. Workers run in-process and consume jobs from River, which stores its queue in the same Postgres database. Static assets and SvelteKit-built UI are embedded in the binary.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language (server) | Go 1.23 | Existing CB8 code is Go; fast static binary; great `archive/zip`, `image/*`, `net/http`. |
| HTTP router | `chi` | Tiny, idiomatic, middleware-friendly. |
| DB | Postgres 16 | FTS, JSONB for smart filters, concurrent writes. |
| Migrations | `goose` | Plain SQL, forward-only, runnable offline. |
| Query layer | `sqlc` | Compile-time-checked SQL, no ORM tax. |
| Jobs | `River` | Postgres-backed queue, no Redis. |
| Image pipeline | `govips` (libvips) | Fast WebP, low RAM. |
| EPUB | `go-epub` for write paths, custom reader for spine/toc parsing | Existing libs are CLI-shaped; reader needs streaming. |
| PDF | `pdfium` via `github.com/klippa-app/go-pdfium` | Widely used, supports rasterization for image reader path. |
| CBR / CB7 | shell out to `unrar` / `7zr` (vendored static binaries on Linux x86_64/arm64) | Native Go RAR is incomplete; CB7 has no pure-Go option. |
| Auth | Argon2id (`golang.org/x/crypto/argon2`) + `jwt/v5` + opaque API keys | Matches Kavita 0.8.9 "Named Auth Keys". |
| Search v1 | Postgres FTS, GIN-indexed `tsvector` | Handles ~100k series fine. |
| Search v2 (P2) | Meilisearch | Same `/api/v1/search` contract. |
| Frontend | SvelteKit + TypeScript + Tailwind | Lighter than Next; perf-sensitive prefetch logic cleaner in Svelte. |
| Build / embed | `embed.FS` for `dist/`, single binary | One artefact. |
| Logs | `slog` (stdlib) | Structured JSON. |
| Metrics | `prometheus/client_golang` | `/metrics`. |
| Config | `koanf` (env + file + flag) | Env-first, file fallback. |

## 3. Data model

### 3.1 Core tables

```sql
create table library (
  id            bigserial primary key,
  name          text not null,
  kind          text not null check (kind in ('comic','manga','ebook')),
  root_path     text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table series (
  id              bigserial primary key,
  library_id      bigint not null references library(id) on delete cascade,
  name            text not null,
  sort_name       text not null,         -- natural-sort key
  localized_name  text,
  age_rating      text not null default 'unknown'
                  check (age_rating in ('unknown','g','pg','teen','mature','adults_only')),
  status          text not null default 'unknown'
                  check (status in ('unknown','ongoing','completed','hiatus','cancelled')),
  summary         text,
  cover_file_id   bigint,
  metadata        jsonb not null default '{}'::jsonb,
  search          tsvector,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (library_id, name)
);
create index series_search_gin on series using gin (search);
create index series_library_active on series (library_id) where deleted_at is null;

create table volume (
  id           bigserial primary key,
  series_id    bigint not null references series(id) on delete cascade,
  number       numeric(10,3) not null,    -- supports 1, 1.5, etc.
  name         text,
  cover_file_id bigint,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (series_id, number)
);

create table chapter (
  id           bigserial primary key,
  volume_id    bigint not null references volume(id) on delete cascade,
  number       numeric(10,3) not null,
  name         text,
  page_count   int not null default 0,
  format       text not null check (format in ('cbz','cbr','cb7','pdf','epub')),
  language     text,
  age_rating   text,
  cover_file_id bigint,
  metadata     jsonb not null default '{}'::jsonb,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (volume_id, number)
);

create table file (
  id           bigserial primary key,
  chapter_id   bigint references chapter(id) on delete set null,
  path         text not null unique,
  size_bytes   bigint not null,
  mtime        timestamptz not null,
  content_hash bytea,                     -- blake3 of first 1MiB + size
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index file_hash on file (content_hash) where content_hash is not null;
```

### 3.2 Users, ACLs, sessions

```sql
create table app_user (
  id              bigserial primary key,
  email           citext not null unique,
  display_name    text not null,
  role            text not null check (role in ('admin','user','guest')),
  password_hash   text not null,          -- argon2id encoded
  max_age_rating  text not null default 'mature',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table library_user_acl (
  library_id  bigint not null references library(id) on delete cascade,
  user_id     bigint not null references app_user(id) on delete cascade,
  primary key (library_id, user_id)
);

create table session (
  id                 bigserial primary key,
  user_id            bigint not null references app_user(id) on delete cascade,
  refresh_token_hash bytea not null unique,
  device_label       text,
  user_agent         text,
  ip                 inet,
  last_seen          timestamptz not null default now(),
  expires_at         timestamptz not null,
  revoked_at         timestamptz
);

create table api_key (
  id           bigserial primary key,
  user_id      bigint not null references app_user(id) on delete cascade,
  name         text not null,
  prefix       text not null,             -- first 8 chars, displayed
  last4        text not null,
  hash         bytea not null unique,     -- sha256 of full key
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);
```

### 3.3 Reading state

```sql
create table read_progress (
  user_id      bigint not null references app_user(id) on delete cascade,
  chapter_id   bigint not null references chapter(id) on delete cascade,
  page_number  int,                       -- image
  cfi          text,                      -- epub
  percent      real not null default 0,
  device_id    text,
  updated_at   timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create table bookmark (
  id          bigserial primary key,
  user_id     bigint not null references app_user(id),
  chapter_id  bigint not null references chapter(id),
  page_number int,
  cfi_start   text,
  cfi_end     text,
  color       text,
  note        text,
  created_at  timestamptz not null default now()
);

create table collection (
  id          bigserial primary key,
  owner_id    bigint not null references app_user(id),
  name        text not null,
  is_smart    boolean not null default false,
  rule_json   jsonb,
  created_at  timestamptz not null default now()
);

create table collection_series (
  collection_id bigint references collection(id) on delete cascade,
  series_id     bigint references series(id) on delete cascade,
  position      int,
  primary key (collection_id, series_id)
);

create table reading_list (
  id          bigserial primary key,
  owner_id    bigint not null references app_user(id),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table reading_list_chapter (
  list_id    bigint references reading_list(id) on delete cascade,
  chapter_id bigint references chapter(id) on delete cascade,
  position   int not null,
  primary key (list_id, chapter_id)
);
```

### 3.4 Tagging

`tag`, `genre`, `person`, plus `series_tag`, `series_genre`, `series_person(role text)` join tables. Identical pattern to most cataloguing schemas; omitted here for brevity.

### 3.5 Search column

`series.search` is maintained by trigger on insert / update from `name`, `localized_name`, `summary`, joined tag and genre names, and author names. Weighted: name `A`, localized `A`, tags / genres `B`, summary `C`, author `D`.

## 4. Scanner pipeline

```
fsnotify (P1-2) ─┐
manual rescan  ─ ┼─► library.scan job ─┬─► walk root
schedule       ─┘                      │
                                       ├─► classify file (ext+magic)
                                       ├─► parse metadata
                                       │     • CBZ/CBR/CB7: ComicInfo.xml
                                       │     • EPUB: OPF + nav
                                       │     • PDF: info dict
                                       ├─► natural-sort filename heuristic
                                       │     (ported from restructure_cbz.go)
                                       ├─► upsert series/volume/chapter/file
                                       ├─► enqueue cover.derive
                                       └─► enqueue metadata.refresh (P1-6)
```

### 4.1 Idempotency

A file row is keyed by absolute path. On scan:

- If `(path, size, mtime)` matches the last seen tuple, skip.
- If size or mtime differs, recompute content hash and re-parse metadata.
- If a file disappears, soft-delete its chapter and let the soft-delete cascade later under a configurable grace period (default 7 days) by `progress.compact`.

### 4.2 Filename heuristic

Reused directly from `restructure_cbz.go`: a regex-driven natural sort that pulls volume + chapter + sub-chapter numbers out of common patterns ("Vol. 03 Ch. 12", "v03c012", "012.5", "Volume 3 - Chapter 12"). Heuristic always loses to ComicInfo.xml when both are present.

### 4.3 Concurrency

Default scan concurrency is `min(NumCPU, 4)`. Each archive is opened, indexed, and closed; we never hold all entries in memory. Page count is read from the central directory only.

### 4.4 Errors

A single bad file produces a `scan_error` row keyed by `path`, surfaced in the admin UI's "Scan health" panel. The scan never aborts on a per-file error.

## 5. Cover & derivative pipeline

Triggered by `cover.derive` job for `(entity_kind, entity_id)`.

1. Load source bytes:
   - Chapter: open archive, choose cover (`cover.*` at root, else first natural-sorted image; macOS metadata filtered, ports `fix_cbz_covers.go`).
   - Volume: first chapter's cover.
   - Series: first volume's cover.
2. Decode → libvips → encode WebP at 256, 512, 1024 px (longest edge, preserve aspect).
3. Write to `${data_dir}/derivatives/cover/${id_shard}/${id}-{256|512|1024}.webp`.
4. Update `${entity}.cover_file_id` and `cover_etag` (blake3 of source bytes).

Page derivatives for the image reader follow the same pipeline lazily on first request, then cached on disk. A nightly `derivative.gc` job evicts derivatives whose source rows are gone.

## 6. Image reader

### 6.1 Server-side endpoints

```
GET /api/v1/chapter/{id}/page/{n}
    ?w=1024            longest-edge target (server picks closest cached size, else derives)
    &fmt=webp|jpeg     default webp; jpeg fallback for ancient clients
GET /api/v1/chapter/{id}/manifest
    → { pageCount, pages: [{n, w, h, sha}], readingDirection, format }
```

Manifest is small enough to inline into the SSR HTML; the reader uses it to drive prefetch.

### 6.2 Prefetch

Default prefetch window: next 3 pages. Tunable per device class. Prefetch requests are issued at low priority via `fetchpriority="low"` on `<link rel="prefetch">` so they yield to the visible page.

### 6.3 Layouts

- Single page.
- Double page with cover-on-its-own toggle. Pairing rule: even-page-index left, odd right (RTL flips). Wide pages (aspect > 1) auto-detect and break out into single.
- Continuous vertical (webtoon). Pages are stacked, virtualized so DOM holds ≤30 at a time.

## 7. EPUB reader

EPUB rendering happens in the browser. Server only serves the EPUB bytes, the spine manifest, and search results.

```
GET /api/v1/chapter/{id}/epub          serves original .epub (cache-controlled)
GET /api/v1/chapter/{id}/epub/manifest serves parsed spine + TOC + nav points
GET /api/v1/chapter/{id}/epub/search?q=  full-text search inside the book
```

Position is reported as a CFI, kept in `read_progress.cfi`. Resume targets `±1 paragraph` by snapping to the nearest enclosing `<p>` if the exact CFI no longer resolves.

## 8. Auth

### 8.1 Login flow

1. `POST /api/v1/auth/login { email, password }`.
2. Server checks Argon2id; on success, mints:
   - Access token (JWT, 15 min, `aud=cb8`, `sub=user_id`, `roles`, `age_max`).
   - Refresh token (opaque 32 random bytes, base64url, stored hashed in `session`).
3. Refresh: `POST /api/v1/auth/refresh` with refresh token cookie.
4. Logout: `POST /api/v1/auth/logout` revokes the row.

### 8.2 API keys

- Generated as `cb8_${prefix}_${random32}`. Only the user sees the full string once at creation time.
- `prefix` and `last4` shown in the UI; full key never stored.
- Hash is `sha256(full_key)`; lookups are constant-time-compare.

### 8.3 Access-token revocation

Sign-out-everywhere needs sub-minute effect on access tokens. Implementation: a small in-memory + Postgres-backed denylist of `(user_id, jti)` with TTL = access-token lifetime; cleared on expiry.

## 9. Background jobs (River)

Job types in v1:

| Job | Args | Concurrency | Idempotency |
|---|---|---|---|
| `library.scan` | `{library_id}` | 1 per library | Coalesced by library_id; an in-flight scan absorbs new requests. |
| `library.watch_event` | `{library_id, path, op}` | 4 per library | Path is the key; debounced 2 s. |
| `cover.derive` | `{entity_kind, entity_id}` | NumCPU | Skip if `cover_etag` matches source hash. |
| `metadata.refresh` | `{series_id, source}` | 2 globally | Skip if last refresh < 24 h unless forced. |
| `progress.compact` | `{}` | 1 globally, daily | Idempotent. |
| `derivative.gc` | `{}` | 1 globally, daily | Idempotent. |
| `backup.create` | `{}` | 1 globally | Time-stamped artefact. |

River is wired to the same `*pgxpool.Pool` as the rest of the app. Workers register on boot.

## 10. OPDS adapter (P1-1)

Read-only mapping of the same domain model.

```
/opds/v1.2                                          root catalog
/opds/v1.2/libraries                                navigation feed
/opds/v1.2/library/{id}                             series list (paginated)
/opds/v1.2/series/{id}                              volumes/chapters
/opds/v1.2/chapter/{id}                             acquisition entry
/opds/v1.2/chapter/{id}/file                        download original
/opds/v1.2-ps/chapter/{id}/page/{n}                 OPDS-PS page acquisition
/opds/v1.2-ps/chapter/{id}/progression              GET/PUT progress
```

Authentication via Basic over TLS or `?api_key=`. Same ACL + age-rating filter as REST.

## 11. Search

### 11.1 Postgres FTS

`series.search tsvector` populated by trigger from name, localized name, tags, genres, authors, summary. Weights `A/B/C/D`. Query:

```sql
select id, ts_rank_cd(search, q) as rank
from series, plainto_tsquery('simple', $1) q
where search @@ q
  and library_id = any($2)
  and age_rating <= $3
order by rank desc
limit 50;
```

GIN index on `search`. Tag / genre / author filters are additional WHERE clauses. Chapter-level search (rare) shares the same shape with a separate `chapter.search` column.

### 11.2 Meilisearch swap (P2)

Same `/api/v1/search` contract. A `search.reindex` job streams series rows in batches. The chosen backend is a config flag.

## 12. REST API shape

```
GET   /api/v1/libraries
GET   /api/v1/libraries/{id}/series        ?cursor=&limit=&filter=
GET   /api/v1/series/{id}
GET   /api/v1/series/{id}/volumes
GET   /api/v1/volumes/{id}/chapters
GET   /api/v1/chapters/{id}
GET   /api/v1/chapters/{id}/manifest
GET   /api/v1/chapters/{id}/page/{n}
GET   /api/v1/chapters/{id}/epub
PUT   /api/v1/progress                     { chapter_id, page_number|cfi, percent }
GET   /api/v1/me/continue-reading
POST  /api/v1/auth/login
POST  /api/v1/auth/refresh
POST  /api/v1/auth/logout
GET   /api/v1/me
POST  /api/v1/api-keys
DELETE /api/v1/api-keys/{id}
GET   /api/v1/admin/users
POST  /api/v1/admin/users/invite
GET   /api/v1/admin/jobs
POST  /api/v1/admin/jobs/{id}/retry
GET   /api/v1/search                       ?q=&library_id=&filters=
GET   /api/v1/openapi.json
```

OpenAPI 3.1 generated from struct tags using `huma` or hand-maintained YAML — pick one in tasks. Cursor pagination uses opaque base64 cursor encoding `(sort_field, last_id)`.

## 13. Frontend (SvelteKit)

- SSR for the first paint of the library and series pages so search engines and OPDS fallbacks have stable URLs; client navigation thereafter.
- Reader is purely client-side once the manifest is delivered.
- State: per-route `+page.server.ts` handles auth-gated data; client uses `svelte/store` for ephemeral reader state.
- Tailwind for styling; one shared theme tokens file; dark / light / sepia.
- Build output is dropped into `internal/web/dist/` and embedded into the Go binary via `embed.FS`.

## 14. Configuration

Single `cb8.yaml` plus env overrides (`CB8_*`). Example:

```yaml
listen: ":8080"
public_url: "https://cb8.example.com"
data_dir: "/var/lib/cb8"
postgres_url: "postgres://cb8:cb8@db/cb8?sslmode=disable"
libraries:
  - name: Comics
    kind: comic
    root: /srv/comics
  - name: Manga
    kind: manga
    root: /srv/manga
auth:
  argon2_pepper_file: /etc/cb8/pepper
  access_token_ttl: 15m
  refresh_token_ttl: 720h
search:
  backend: pg_fts          # or "meilisearch"
metadata:
  comicvine_api_key_file: /etc/cb8/comicvine
  anilist_enabled: true
jobs:
  scan_concurrency: 4
```

## 15. Deployment

- Docker image `ghcr.io/sanjee/cb8:vX.Y.Z` with vendored `unrar` and `7zr`.
- Rootless-friendly: data dir mounted with explicit UID, no privileged caps.
- Postgres expected as a separate container or external instance; CB8 runs migrations on startup if `--migrate-on-start` is set.
- First-run: visiting `/` with no users redirects to a setup wizard that creates the admin.

## 16. Testing strategy

- Unit tests on parsers (filename heuristic, ComicInfo, OPF, PDF info), cover-selection logic, age-rating filter, CFI snapper.
- Integration tests: a `testcontainers`-spun Postgres + a fixture library directory; scan → query asserts the graph; cover derive asserts on-disk artefacts.
- API contract tests: golden JSON per endpoint.
- Reader e2e: Playwright against a built binary, fixture library, headless Chromium and Firefox.
- Load: a `k6` script for the reader path (manifest + 30 prefetched pages × N concurrent users).

## 17. Observability

- `slog` JSON logs with request ID, user ID (if authenticated), library / series / chapter ID where relevant.
- Prometheus metrics: `http_request_duration_seconds`, `job_duration_seconds{type}`, `job_queue_depth{type}`, `scan_files_total{result}`, `cover_derive_duration_seconds`.
- `/healthz` and `/readyz`. Readiness flips false during startup migrations.

## 18. Migration from existing scripts

`fix_cbz_covers.go` and `restructure_cbz.go` become packages under `internal/scan/`:

- `internal/scan/cover` — cover selection rules.
- `internal/scan/naming` — natural-sort + filename heuristic.
- `internal/scan/restructure` — opt-in CLI subcommand `cb8 restructure` that wraps the old script for users who want the same pre-ingest cleanup.

The packages keep their unit tests; the existing CLI behavior is preserved behind `cb8 restructure` so existing users are not stranded.

## 19. Risks and open questions

- **CBR / CB7 reliance on shell-out.** We accept this; a future P2 swap to a pure-Go CB7 is welcome but not required.
- **EPUB CFI drift across format upgrades.** Snap-to-paragraph mitigates; we will not invest in a perfect mapper.
- **PDF rasterization cost.** PDF is the slowest path. We will surface page-render time in metrics and add a "low quality" mode if it bites.
- **External metadata rate limits.** ComicVine in particular is touchy; the rate-limited cache layer must be in place before we ship P1-6.
- **Single Postgres dependency for jobs + queries + FTS.** Acceptable trade-off vs. adding Redis or Elastic; revisit at >500k chapters.
