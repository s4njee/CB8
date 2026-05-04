# CB8 Tasks

Milestone-ordered checklist for building CB8. Tasks are sized to **0.5–3 day units** for one engineer. IDs map to requirements in `requirements.md`. Implementation detail per task lives in `design.md`.

Convention:

- `[ ] T-MM.NN — title (Px-N) — ~Xd` where MM is milestone, NN is task ordinal, Px-N is the requirement, Xd is rough estimate.
- A milestone is **done** when every task under it is checked and the listed exit criteria pass.

---

## M1 — Foundation: scaffold + domain model + scanner

**Exit criteria:** Running `cb8 scan` against a fixture library populates Postgres with the correct Library → Series → Volume → Chapter graph; rerunning is a no-op; deleting a file soft-deletes its chapter; River runs scans as a job.

- [ ] **T-01.01** — Repo scaffold: Go module, layout (`cmd/cb8`, `internal/...`), `Makefile`, `golangci-lint` config — ~0.5d
- [ ] **T-01.02** — CI: GitHub Actions for lint, test, build on Linux x86_64 + arm64 — ~0.5d
- [ ] **T-01.03** — Postgres dev container + `make db.up` / `db.reset` — ~0.5d
- [ ] **T-01.04** — Wire `goose` migrations; first migration `0001_init.sql` with `library`, `series`, `volume`, `chapter`, `file` tables (P0-2) — ~1d
- [ ] **T-01.05** — Wire `sqlc`; generate query bindings for the M1 tables — ~0.5d
- [ ] **T-01.06** — Wire `pgxpool`; connection lifecycle owned by a `db` package — ~0.5d
- [ ] **T-01.07** — Wire `River` against the same pool; `cb8 worker` subcommand starts the worker pool — ~1d
- [ ] **T-01.08** — Lift `restructure_cbz.go`'s natural-sort logic into `internal/scan/naming` with unit tests covering 30+ filename patterns (P0-1) — ~1.5d
- [ ] **T-01.09** — `internal/scan/comicinfo`: ComicInfo.xml parser with golden tests (P0-1) — ~1d
- [ ] **T-01.10** — `internal/scan/archive`: CBZ open + central-directory page count (no full read) (P0-1) — ~1d
- [ ] **T-01.11** — `internal/scan/archive`: CBR via vendored `unrar`; CB7 via vendored `7zr`; tests behind `-tags=archives` (P0-1) — ~2d
- [ ] **T-01.12** — `internal/scan/archive`: PDF page count via go-pdfium (P0-1) — ~1d
- [ ] **T-01.13** — `internal/scan/archive`: EPUB OPF + spine parse for page-count and title (P0-1) — ~1d
- [ ] **T-01.14** — `internal/scan/hash`: blake3 of first 1MiB + size; cached in `file.content_hash` (P0-1) — ~0.5d
- [ ] **T-01.15** — Scanner core: walk root, classify files, route to parser, upsert series/volume/chapter/file (P0-1, P0-2) — ~2d
- [ ] **T-01.16** — Idempotent upsert: skip when `(path, size, mtime)` unchanged (P0-1) — ~0.5d
- [ ] **T-01.17** — Soft-delete on missing files + grace window (`progress.compact` daily job) (P0-1) — ~1d
- [ ] **T-01.18** — `scan_error` table + per-file error capture; never abort scan (P0-1) — ~0.5d
- [ ] **T-01.19** — `library.scan` River job; coalesce in-flight scans per library (P0-8) — ~1d
- [ ] **T-01.20** — `cb8 scan --library <name>` CLI — ~0.5d
- [ ] **T-01.21** — Integration test: testcontainers Postgres + fixture library; scan twice asserts no-op on second run — ~1.5d
- [ ] **T-01.22** — Performance smoke: scan a synthetic 50k-chapter library; record duration, set baseline — ~1d

---

## M2 — Covers + admin shell + observability skeleton

**Exit criteria:** A scanned library has cover thumbnails at 256/512/1024 served with `Cache-Control: immutable`. `/metrics`, `/healthz`, `/readyz` work. An admin can see queued/running/failed jobs.

- [ ] **T-02.01** — `govips` wiring + small wrapper for "decode any → WebP at N px" — ~1d
- [ ] **T-02.02** — Lift `fix_cbz_covers.go` cover-selection rules into `internal/scan/cover` with unit tests (P0-7) — ~1d
- [ ] **T-02.03** — `cover.derive` River job; writes `${data_dir}/derivatives/cover/<shard>/<id>-{256|512|1024}.webp` (P0-7, P0-8) — ~1d
- [ ] **T-02.04** — Series cover defaults to first volume; volume to first chapter; manual override columns (P0-7) — ~0.5d
- [ ] **T-02.05** — Cover etag = blake3 of source bytes; skip re-derive when etag matches (P0-7) — ~0.5d
- [ ] **T-02.06** — `derivative.gc` job; nightly eviction of orphans — ~0.5d
- [ ] **T-02.07** — HTTP edge: `chi` router, `slog` middleware with request IDs (NFR-6) — ~0.5d
- [ ] **T-02.08** — `/healthz`, `/readyz`, `/metrics` endpoints (NFR-5, NFR-6) — ~0.5d
- [ ] **T-02.09** — Cover serving endpoint: `GET /covers/<entity>/<id>?w=...` with strong cache headers (P0-7) — ~0.5d
- [ ] **T-02.10** — Minimal admin UI page (server-rendered Go template for now) listing River jobs with retry/cancel buttons (P0-8) — ~1.5d
- [ ] **T-02.11** — Prometheus metrics: `job_duration_seconds`, `job_queue_depth`, `scan_files_total`, `cover_derive_duration_seconds` — ~1d

---

## M3 — Auth, users, ACLs, age gating

**Exit criteria:** Two users can register through admin invite, sign in, and see only the libraries they have ACL on. An `adults_only` series is invisible to a `teen`-capped user including by direct ID fetch (404, not 403).

- [ ] **T-03.01** — Migrations: `app_user`, `library_user_acl`, `session`, `api_key` (P0-6) — ~0.5d
- [ ] **T-03.02** — Argon2id wrapper with per-install pepper from file (NFR-3) — ~0.5d
- [ ] **T-03.03** — `POST /api/v1/auth/login`, `refresh`, `logout` with cookie + Bearer modes (P0-6) — ~1.5d
- [ ] **T-03.04** — JWT access tokens (`jti`, `aud`, `sub`, `roles`, `age_max`); refresh tokens stored hashed (P0-6) — ~1d
- [ ] **T-03.05** — Auth middleware; populates request-scoped user context — ~0.5d
- [ ] **T-03.06** — Library ACL middleware: filter list endpoints, 404 on direct fetch when not authorized (P0-6) — ~1d
- [ ] **T-03.07** — Age-rating filter integrated into the same place as ACL; returns 404 to avoid existence leak (P0-6) — ~0.5d
- [ ] **T-03.08** — Admin invite flow: one-time token email link, invitee sets password (P0-6) — ~1.5d
- [ ] **T-03.09** — Named API keys: create, list, revoke; `cb8_<prefix>_<random32>` format (P0-6) — ~1d
- [ ] **T-03.10** — Sign-out-everywhere: revoke all refresh tokens; access-token denylist (in-memory + Postgres) with TTL = access-token lifetime (P1-7 prep) — ~1d
- [ ] **T-03.11** — First-run wizard: when zero users, redirect `/` to `/setup` to create admin (NFR-5) — ~1d
- [ ] **T-03.12** — Tests: ACL + age-rating matrix; sign-out-everywhere ≤ 60s effect — ~1d

---

## M4 — REST API v1

**Exit criteria:** All P0 endpoints in `design.md §12` are reachable, return RFC 7807 errors, are documented in `/api/v1/openapi.json`, and pass golden contract tests.

- [ ] **T-04.01** — `huma`-style or hand-maintained OpenAPI 3.1 generator decision; pick one — ~0.5d
- [ ] **T-04.02** — Cursor pagination helper with opaque base64 cursors (P0-9) — ~0.5d
- [ ] **T-04.03** — Library list / detail endpoints (P0-9) — ~0.5d
- [ ] **T-04.04** — Series list / detail endpoints with filters (`library_id`, `tag`, `genre`, `age`, `read_state`) (P0-9) — ~1.5d
- [ ] **T-04.05** — Volume + chapter endpoints (P0-9) — ~1d
- [ ] **T-04.06** — `/api/v1/me` and `/api/v1/me/continue-reading` (P0-9, P0-5 prep) — ~0.5d
- [ ] **T-04.07** — Admin endpoints: users, jobs, scan triggers (P0-9) — ~1d
- [ ] **T-04.08** — RFC 7807 problem+json error middleware (P0-9) — ~0.5d
- [ ] **T-04.09** — Per-user rate limiting (60 req/s default; per-key override) (P0-9) — ~1d
- [ ] **T-04.10** — `GET /api/v1/openapi.json` served from generated spec (P0-9) — ~0.5d
- [ ] **T-04.11** — Golden-JSON contract tests for every endpoint — ~1.5d

---

## M5 — Image reader

**Exit criteria:** A user opens a CBZ chapter in a browser, navigates pages with keyboard / touch, sees < 500 ms first-page on LAN, and progress is recorded.

- [ ] **T-05.01** — SvelteKit scaffold; Tailwind; build into `internal/web/dist`; `embed.FS` mount (NFR-5) — ~1d
- [ ] **T-05.02** — Auth in SvelteKit: cookie session check + login page — ~1d
- [ ] **T-05.03** — Library / series / volume browse pages (SSR first paint) (P0-3) — ~2d
- [ ] **T-05.04** — `GET /api/v1/chapters/{id}/manifest` server endpoint (P0-3) — ~0.5d
- [ ] **T-05.05** — `GET /api/v1/chapters/{id}/page/{n}?w=&fmt=` server endpoint with libvips re-encode + cache (P0-3) — ~1.5d
- [ ] **T-05.06** — Reader shell route + manifest fetch + first-page render — ~1d
- [ ] **T-05.07** — Layouts: single, double-with-cover-toggle, vertical (P0-3) — ~2d
- [ ] **T-05.08** — Wide-page auto-detect for double layout (P0-3) — ~0.5d
- [ ] **T-05.09** — Prefetch next-N pages with `<link rel=prefetch>` and low priority (P0-3) — ~1d
- [ ] **T-05.10** — Keyboard, touch, mouse-wheel nav; mobile-responsive controls down to 360 px (P0-3) — ~1.5d
- [ ] **T-05.11** — RTL toggle; persisted per-series and per-session (P0-3) — ~0.5d
- [ ] **T-05.12** — Fit modes (width / height / screen / original) (P0-3) — ~0.5d
- [ ] **T-05.13** — Playwright e2e: open chapter, navigate, last-read resumes — ~1d

---

## M6 — EPUB reader

**Exit criteria:** A user opens an EPUB, customizes typography, resumes within ±1 paragraph, and can search inside the book.

- [ ] **T-06.01** — `internal/epub`: spine + TOC parser; struct returned to API and reader (P0-4) — ~1.5d
- [ ] **T-06.02** — `GET /api/v1/chapters/{id}/epub` raw bytes endpoint (cache-controlled) (P0-4) — ~0.5d
- [ ] **T-06.03** — `GET /api/v1/chapters/{id}/epub/manifest` (P0-4) — ~0.5d
- [ ] **T-06.04** — `GET /api/v1/chapters/{id}/epub/search?q=` server-side full-text within EPUB (P0-4) — ~1.5d
- [ ] **T-06.05** — EPUB renderer integrated into SvelteKit reader route (P0-4) — ~2d
- [ ] **T-06.06** — Settings panel: font family, size, line height, margins, theme (light / dark / sepia) (P0-4) — ~1d
- [ ] **T-06.07** — CFI position tracking + write-through to progress endpoint (P0-4) — ~1d
- [ ] **T-06.08** — Snap-to-paragraph fallback when CFI no longer resolves (P0-4) — ~1d
- [ ] **T-06.09** — Footnote pop-overs (P0-4) — ~1d
- [ ] **T-06.10** — Playwright e2e: open EPUB, search, change font, resume — ~1d

---

## M7 — Reading progress sync

**Exit criteria:** Progress written from one device appears on another within 2 seconds; mark read/unread bulk works; continue-reading is server-computed.

- [ ] **T-07.01** — Migration: `read_progress` table (P0-5, P0-2) — ~0.25d
- [ ] **T-07.02** — `PUT /api/v1/progress` endpoint, idempotent, last-writer-by-server-time (P0-5) — ~1d
- [ ] **T-07.03** — Image reader debounced progress send on page change (P0-5) — ~0.5d
- [ ] **T-07.04** — EPUB reader debounced progress send on CFI change (P0-5) — ~0.5d
- [ ] **T-07.05** — `GET /api/v1/me/continue-reading` (P0-5) — ~0.5d
- [ ] **T-07.06** — Bulk mark read / unread for series / volume / chapter (P0-5) — ~1d
- [ ] **T-07.07** — `progress.compact` job: garbage-collect orphan progress rows (P0-5) — ~0.5d
- [ ] **T-07.08** — Test: two-tab sync within 2 s — ~0.5d

---

## M8 — File watcher + search

**Exit criteria:** Adding a file to a library root creates a chapter within 5 s without a full rescan. Searching for a series by tag returns ranked results in < 200 ms p95.

- [ ] **T-08.01** — `fsnotify` watcher per library root (P1-2) — ~1d
- [ ] **T-08.02** — Debouncer: coalesce events across 2 s window per directory subtree (P1-2) — ~1d
- [ ] **T-08.03** — `library.watch_event` job; reuses scanner core targeted at one path (P1-2) — ~1d
- [ ] **T-08.04** — Inotify overflow recovery: targeted rescan of affected subtree (P1-2) — ~0.5d
- [ ] **T-08.05** — `series.search tsvector` column + insert/update trigger (P1-4) — ~1d
- [ ] **T-08.06** — Tag / genre / person tables and join tables; populated from ComicInfo + heuristics (P1-4) — ~1.5d
- [ ] **T-08.07** — `GET /api/v1/search` endpoint with rank, ACL, age-rating, filters (P1-4) — ~1d
- [ ] **T-08.08** — Search UI: omnibox, suggestions, results page — ~1.5d
- [ ] **T-08.09** — Performance test: search over 100k-series synthetic library (P1-4) — ~0.5d

---

## M9 — OPDS + OPDS-PS

**Exit criteria:** Mihon, Panels, KOReader, and Foliate authenticate, browse, and read. Progress reported via OPDS-PS round-trips into the same `read_progress` row.

- [ ] **T-09.01** — `internal/opds` Atom catalog renderer (P1-1) — ~1.5d
- [ ] **T-09.02** — Catalog routes: root, libraries, series, volumes, chapters (P1-1) — ~1.5d
- [ ] **T-09.03** — Acquisition links: original file + OPDS-PS for image formats (P1-1) — ~1d
- [ ] **T-09.04** — OPDS-PS page acquisition route (P1-1) — ~1d
- [ ] **T-09.05** — OPDS-PS progression GET/PUT route writing into `read_progress` (P1-1) — ~1d
- [ ] **T-09.06** — Basic auth + `?api_key=` support on the OPDS routes (P1-1) — ~0.5d
- [ ] **T-09.07** — Manual verification matrix: Mihon, Panels, KyBook 3, Chunky, KOReader, Foliate (P1-1) — ~1d

---

## M10 — Smart filters + customizable dashboard

**Exit criteria:** A user composes a filter ("manga AND tag:isekai AND read=false"), pins it as a card on the dashboard, and the layout persists.

- [ ] **T-10.01** — Filter expression grammar + parser (P1-12) — ~2d
- [ ] **T-10.02** — Filter → SQL compiler (Postgres) (P1-12) — ~2d
- [ ] **T-10.03** — `smart_filter` table; saved per user (P1-12) — ~0.5d
- [ ] **T-10.04** — Filter sharable via copyable URL (opt-in) (P1-12) — ~0.5d
- [ ] **T-10.05** — Dashboard route: cards (continue-reading, recently-added, by-filter); add / remove / reorder (P1-12) — ~2d
- [ ] **T-10.06** — Layout persisted per user per device class (desktop / mobile) (P1-12) — ~0.5d

---

## M11 — External metadata sources

**Exit criteria:** A series with no ComicInfo can be enriched with one click from ComicVine / AniList / MAL, including synopsis, genres, tags, age rating, optional cover, and credits. Failures never block the UI.

- [ ] **T-11.01** — `internal/metadata`: shared client with rate-limit + on-disk cache + circuit breaker (P1-6) — ~2d
- [ ] **T-11.02** — ComicVine adapter (P1-6) — ~2d
- [ ] **T-11.03** — AniList adapter (P1-6) — ~1.5d
- [ ] **T-11.04** — MyAnimeList adapter (P1-6) — ~1.5d
- [ ] **T-11.05** — Match suggestion ranking by title + year (P1-6) — ~1d
- [ ] **T-11.06** — `metadata.refresh` job (skip if last refresh < 24h unless forced) (P0-8, P1-6) — ~0.5d
- [ ] **T-11.07** — Manual override UI: paste source URL to force-match; revert button (P1-6) — ~1.5d
- [ ] **T-11.08** — Series-relationships ingestion from external sources (P1-11) — ~1d

---

## M12 — Sessions, bookmarks, collections, lists

**Exit criteria:** A user can list and revoke active sessions, bookmark image pages and EPUB passages, and group series into collections / chapters into ordered reading lists.

- [ ] **T-12.01** — Sessions UI: list, "sign out", "sign out everywhere"; named API keys listed alongside (P1-7) — ~1d
- [ ] **T-12.02** — `bookmark` table + endpoints (P1-3) — ~0.5d
- [ ] **T-12.03** — Image bookmark UI (P1-3) — ~1d
- [ ] **T-12.04** — EPUB highlight UI (CFI range, color palette, note) (P1-3) — ~1.5d
- [ ] **T-12.05** — Bookmarks list / search / export (P1-3) — ~1d
- [ ] **T-12.06** — Collections + reading lists schema reused from M1 backbone; CRUD endpoints (P1-5) — ~1d
- [ ] **T-12.07** — Collection / reading-list UI (P1-5) — ~1.5d
- [ ] **T-12.08** — Smart collections: subset of P1-12 grammar reused (P1-5) — ~1d

---

## M13 — Lifecycle: send-to-device, statistics, backups, series rels

**Exit criteria:** Send-to-Kindle works end-to-end. Stats dashboard shows reading by day/week/month. `cb8 backup create` and `cb8 backup restore` round-trip a working install.

- [ ] **T-13.01** — Send-to-device targets: SMTP-to-Kindle, generic SMTP, generic webhook (P1-8) — ~2d
- [ ] **T-13.02** — Per-user device list + verification flow (P1-8) — ~1d
- [ ] **T-13.03** — Format-aware delivery (CBZ wrap for image formats) (P1-8) — ~1d
- [ ] **T-13.04** — Stats: pages read aggregations (per day/week/month/year) (P1-9) — ~1.5d
- [ ] **T-13.05** — Time-spent-reading derived from progress events with idle-gap collapse (P1-9) — ~1d
- [ ] **T-13.06** — Top series / genres / authors panels (P1-9) — ~0.5d
- [ ] **T-13.07** — `cb8 backup create`: SQL dump + config + derivative manifest archive (P1-10) — ~1.5d
- [ ] **T-13.08** — `cb8 backup restore` (P1-10) — ~1.5d
- [ ] **T-13.09** — Scheduled backups via cron-style config; rotation policy (P1-10) — ~0.5d
- [ ] **T-13.10** — Series-relationships UI (typed edges; sequel/prequel/etc.) (P1-11) — ~1d

---

## M14 — Polish, accessibility, theming, packaging

**Exit criteria:** WCAG 2.1 AA passes on key flows. Docker image is published. First-run wizard documented.

- [ ] **T-14.01** — Keyboard navigability + visible focus rings audit; fix gaps (NFR-7) — ~1.5d
- [ ] **T-14.02** — Color-contrast checked themes (light / dark / sepia + high-contrast) (NFR-7) — ~1d
- [ ] **T-14.03** — Reader "low motion" mode (NFR-7) — ~0.5d
- [ ] **T-14.04** — Docker image: multi-stage build, vendored unrar / 7zr, rootless-friendly (NFR-5) — ~1d
- [ ] **T-14.05** — `docs/getting-started.md`, `docs/config.md`, `docs/opds.md` — ~1d
- [ ] **T-14.06** — Release pipeline: tag → build linux x86_64/arm64 + macOS arm64 binaries → publish image — ~1d

---

## M15 — P2 work (post-v1)

Loose backlog; pull into a future milestone when scheduled.

- [ ] **T-15.01** — Meilisearch swap-in behind `search.backend = meilisearch` (P2-1) — ~3d
- [ ] **T-15.02** — Outgoing webhooks with HMAC (P2-2) — ~2d
- [ ] **T-15.03** — User-selectable themes + system mode + at least one high-contrast (P2-3) — ~1d
- [ ] **T-15.04** — Kavita SQLite importer (idempotent dry-run + path remap + progress preserve) (P2-4) — ~3d
- [ ] **T-15.05** — Public time-boxed share links (P2-5) — ~2d
- [ ] **T-15.06** — ComicVine deep-link + paste-URL force-match (P2-6) — ~0.5d

---

## Working norms

- Every task lands behind tests or with an explicit "manual verify" note.
- Migrations are forward-only; never edit a merged migration — add a new one.
- River jobs must be idempotent and survive restart; assert this in tests.
- Reader and OPDS performance budgets (NFR-1) are checked on every release.
- A milestone is not "done" until its exit criteria are demonstrably met against a real fixture library.
