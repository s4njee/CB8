# CB8 Requirements

This document enumerates every feature CB8 v1 must (P0), should (P1), or may (P2) ship with to be a viable Kavita alternative for a self-hosted comic/manga/ebook library. Each requirement has acceptance criteria phrased so the work is testable. Implementation detail lives in `design.md`; sequenced work units live in `tasks.md`.

## Scope

CB8 is a single-binary, single-node, self-hosted server that:

- Watches one or more on-disk roots containing CBZ / CBR / CB7 / PDF / EPUB files.
- Maintains a relational graph of Library → Series → Volume → Chapter.
- Serves a web reader (image and EPUB), an OPDS feed, and a versioned REST API.
- Tracks per-user reading progress, sessions, collections, and reading lists.
- Authenticates multiple users with per-library ACLs and age gating.

CB8 is not a SaaS, does not sync to a cloud service, does not convert formats, and does not ship native mobile apps.

## Non-goals (v1)

- Distributed / clustered deployment. Single node only.
- Real-time multiplayer reading.
- Native iOS / Android apps. Rely on OPDS clients + responsive web.
- Format conversion (e.g. CBZ → EPUB).
- Anti-piracy / DRM enforcement.
- Hosted SaaS or per-tenant isolation beyond multi-user.

## Personas

- **Owner.** Runs the server, owns the disk, manages users, full admin.
- **Family member.** Reads on phone / tablet / browser, may have age-gated libraries.
- **Power user.** Uses OPDS in Mihon / KOReader / Panels, expects API keys, smart filters, bookmarks.
- **Read-only guest.** Time-bounded share link or limited account.

---

## P0 — must-have for v1

### P0-1: Library scanner

CB8 must recursively scan one or more configured library roots and produce a normalized graph in the database.

**Acceptance criteria**

- Configurable list of `LibraryRoot { path, kind: comic|manga|ebook, name }`.
- Detects CBZ, CBR, CB7, PDF, EPUB by extension and magic bytes; ignores other files.
- Parses ComicInfo.xml (CBZ/CBR/CB7), OPF (EPUB), and PDF metadata where present.
- Falls back to filename heuristics for series / volume / chapter when metadata absent. Heuristics must reuse the natural-sort logic already in `restructure_cbz.go`.
- Detects file additions, deletions, moves, and content changes (size + mtime + hash on first read) on rescan.
- A full rescan of 50,000 chapters completes in under 30 minutes on commodity SSD.
- An incremental rescan touching 100 changed files completes in under 30 seconds.
- Scan errors on a single file never abort the scan; errors are recorded against the file path for the UI to surface.

### P0-2: Domain model

CB8 must persist the library graph in Postgres with referential integrity.

**Acceptance criteria**

- Tables: `library`, `series`, `volume`, `chapter`, `file`, `user`, `library_user_acl`, `read_progress`, `session`, `collection`, `reading_list`, `tag`, `genre`, `person` (writer / artist / etc.), and joins.
- A chapter belongs to exactly one volume; a volume to exactly one series; a series to exactly one library.
- Soft-delete on series / volume / chapter so progress and collections survive a temporary file disappearance.
- Migrations are versioned, forward-only, and runnable offline (`goose up`).
- Schema supports >1M chapters without index regression on the access patterns enumerated in `design.md`.

### P0-3: Web reader — image (CBZ/CBR/CB7/PDF)

CB8 must serve a browser-based image reader over HTTPS.

**Acceptance criteria**

- Page navigation: next, previous, jump-to-page, last-read resumption.
- Layouts: single page, double page (with cover-on-its-own toggle), continuous vertical (webtoon).
- Reading direction: LTR, RTL, switchable per series and per session.
- Fit modes: fit-width, fit-height, fit-screen, original.
- Pages are streamed with prefetch of the next N pages (default 3); time-to-first-page under 500 ms on LAN.
- Keyboard, touch, and mouse-wheel navigation; mobile-responsive at viewport widths from 360 px upward.
- Sends a progress event on each page change (debounced).
- Works on the latest two versions of Chrome, Firefox, Safari, Edge.

### P0-4: Web reader — EPUB

CB8 must serve a browser-based EPUB reader.

**Acceptance criteria**

- Chapter / spine navigation with TOC.
- User-controllable font family, font size, line height, margins, theme (light / dark / sepia).
- Position is reported as a CFI; resumption returns the user within ±1 paragraph of last position.
- Search inside the current EPUB.
- Footnote pop-overs.
- Works on the same browsers as P0-3.

### P0-5: Reading progress sync

CB8 must persist per-user, per-chapter reading progress and resume across devices.

**Acceptance criteria**

- Progress is stored per `(user_id, chapter_id)` with `page_number` (image) or `cfi` (EPUB), `percent`, `updated_at`, `device_id`.
- A user opening any chapter on any device sees the latest progress within 2 seconds of the last write on another device.
- Progress writes are idempotent and do not regress on out-of-order arrivals (last-writer-by-server-time wins for the same device; per-device latest is kept for conflict resolution).
- Mark series / volume / chapter as read or unread, with bulk operations.
- Continue-reading list is computed server-side, ordered by `updated_at`.

### P0-6: Multi-user with library ACLs and age gating

CB8 must support multiple authenticated users with per-library access and content-rating gates.

**Acceptance criteria**

- Roles: `admin`, `user`, `guest`.
- Each user has an explicit allow-list of libraries; nothing is implicit.
- Each user has a `max_age_rating` (G / PG / Teen / Mature / Adults Only); chapters / series above the user's rating are not enumerated, searchable, or fetchable. A direct ID fetch returns 404, not 403, so existence is not leaked.
- Admins can invite users by email or one-time link; password is set by the invitee.
- Password storage is Argon2id; no SHA / bcrypt.
- Sessions use short-lived JWT access tokens + refresh tokens. Logout revokes the refresh token server-side.
- Named API keys (opaque, prefixed, last-4 visible) for OPDS / external clients; revocable per key.

### P0-7: Cover extraction pipeline

CB8 must derive cover images for every series, volume, and chapter and serve them at multiple sizes.

**Acceptance criteria**

- Cover selection rules port directly from `fix_cbz_covers.go`: prefer `cover.*` at archive root; fall back to first natural-sorted image; ignore macOS metadata files.
- Derivatives generated at 256 px, 512 px, 1024 px (longest edge), WebP.
- Series cover defaults to first volume's cover; manually overridable per series and per volume.
- Cover regeneration is idempotent and triggered by file change, manual override, or admin "rebuild covers" job.
- Covers are served with strong cache headers (`ETag` + `Cache-Control: immutable, max-age=31536000`).

### P0-8: Background job runner

CB8 must run scans, cover extraction, metadata refresh, and other long tasks off the request path.

**Acceptance criteria**

- Jobs survive process restart (queue is durable in Postgres via River).
- Job types in v1: `library.scan`, `library.watch_event`, `cover.derive`, `metadata.refresh`, `progress.compact`.
- Per-job-type concurrency limits configurable.
- Admin UI shows running, queued, failed jobs with retry and cancel.
- Failed jobs retain stack trace and last 100 log lines.
- A wedged or panicking job does not block the queue beyond its concurrency slot.

### P0-9: Versioned REST API

CB8 must expose a stable, versioned HTTP API consumed by the web UI, OPDS adapter, and any future client.

**Acceptance criteria**

- Base path `/api/v1`; breaking changes go under `/api/v2`.
- JSON over HTTPS only; no XML.
- Authentication: Bearer JWT or `X-API-Key` header.
- Pagination: cursor-based, `limit` capped at 200.
- All list endpoints support filtering by library, series, tag, genre, age rating, read state.
- Errors follow RFC 7807 (`application/problem+json`).
- OpenAPI 3.1 spec generated from code and served at `/api/v1/openapi.json`.
- Rate limit: 60 req/s per user by default, configurable per API key.

---

## P1 — high-value, ship soon after v1

### P1-1: OPDS + OPDS-PS feeds

CB8 must serve an OPDS 1.2 catalog and OPDS-PS (page streaming) for image content.

**Acceptance criteria**

- Authenticated via Basic over TLS or API key.
- Catalog tree mirrors the library: root → libraries → series → volumes → chapters.
- Acquisition links serve the original file for ebook formats and OPDS-PS for image formats.
- Verified to work with at least: Mihon, Panels, KyBook 3, Chunky, KOReader, Foliate.
- Reading progress reported back via the OPDS-PS progress endpoint round-trips into the same `read_progress` row as the web reader.

### P1-2: Library watch (fsnotify)

CB8 must react to filesystem changes without a full rescan.

**Acceptance criteria**

- File added / removed / renamed within a library root produces a `library.watch_event` job within 5 seconds.
- Debounced so a bulk `rsync` of 1,000 files produces at most a handful of coalesced jobs, not 1,000.
- Watcher recovers from the kernel inotify queue overflow with an automatic targeted rescan of the affected subtree.

### P1-3: Bookmarks and annotations

Users can bookmark pages (image) and highlight passages (EPUB).

**Acceptance criteria**

- Bookmarks: per `(user, chapter, page|cfi)`, optional note up to 4 KB.
- EPUB highlights: anchor as CFI range; color choice from a small fixed palette; optional note.
- List, search, export bookmarks per series and globally.

### P1-4: Search

Full-text search across series, volumes, chapters, tags, genres, authors.

**Acceptance criteria**

- Postgres FTS with a `tsvector` column maintained by trigger.
- Supports prefix queries, phrase queries, and tag / genre / age-rating filters.
- Results ranked; query under 200 ms p95 on a library of 100,000 chapters.
- Honors per-user library ACL and age rating before returning.

### P1-5: Collections and reading lists

Users can group series into collections and chapters into ordered reading lists.

**Acceptance criteria**

- Collections (set semantics) and reading lists (ordered).
- Public-to-server-or-private toggle per list.
- Smart-collection rules (subset of smart-filter syntax from P1-12) supported.

### P1-6: External metadata sources

CB8 must enrich series with metadata from at least one external source.

**Acceptance criteria**

- v1 sources: ComicVine, AniList, MyAnimeList. API keys configured by admin.
- Match suggestions ranked by title + year; manual override always available.
- Pulls: synopsis, genres, tags, age rating, cover (optional), author / artist credits, publication status, related series.
- All external network calls go through a configurable rate-limit and cache; a failed fetch never blocks a UI response.
- This feature is not gated behind any paid tier.

### P1-7: Sessions and devices

CB8 must let users see and revoke active sessions.

**Acceptance criteria**

- A session row per refresh token: `device_label`, `user_agent`, `ip`, `last_seen`, `created_at`.
- "Sign out everywhere" revokes all refresh tokens and invalidates active access tokens within 60 seconds (server-side denylist with TTL = access-token lifetime).
- Named API keys are listed alongside sessions, distinct icon.

### P1-8: Send-to-device

A user can send a chapter or series to a configured device endpoint.

**Acceptance criteria**

- Targets: email-to-Kindle, generic SMTP, generic webhook.
- Per-user device list with verification.
- Format-aware: ebook formats sent as-is; image formats may be wrapped to CBZ.
- Delivery status surfaced in the UI; retried by the job runner on transient failure.

### P1-9: Statistics

Per-user and library-wide reading statistics.

**Acceptance criteria**

- Pages read per day / week / month / year.
- Time spent reading (derived from progress events with idle gap > 10 min collapsed).
- Top series, top genres, top authors.
- Server-wide stats visible to admins only.

### P1-10: Backups and export

Admin can produce a portable backup and restore from it.

**Acceptance criteria**

- `cb8 backup create` produces a single archive containing: SQL dump, app config, derivative cache manifest (not the bytes), API key salt.
- `cb8 backup restore` brings a fresh install to the same logical state on a fresh disk; covers re-derive on first scan.
- Backups can be scheduled via cron-style config; rotation policy `keep_last_N`.

### P1-11: Series relationships

Series can declare prequel / sequel / side-story / spin-off / character-crossover / alternative-version edges.

**Acceptance criteria**

- Edges are typed and directional where appropriate.
- Auto-populated from external metadata where the source provides it; manually editable.
- Series detail page surfaces the edges with one-click navigation.

### P1-12: Smart filters and customizable dashboard

Users can save reusable filter expressions and arrange them on a dashboard.

**Acceptance criteria**

- Filter expression covers fields: library, age rating, genre, tag, author, read state, last-updated, format, language.
- Boolean composition: AND / OR / NOT, parentheses, no arbitrary depth limit under 16.
- Persisted per user; sharable via copyable URL on opt-in.
- Dashboard supports add / remove / reorder of filter cards; layout persisted per user per device class (desktop / mobile).

---

## P2 — nice-to-have

### P2-1: Meilisearch swap-in

Drop-in replacement for Postgres FTS when libraries exceed ~500k chapters or fuzzy / typo-tolerant search is requested.

**Acceptance criteria**

- Same `/api/v1/search` contract; backend chosen by config.
- Re-index job runs idempotently in the background.

### P2-2: Webhooks

Outgoing webhooks on configurable events.

**Acceptance criteria**

- Events: `series.added`, `chapter.added`, `user.created`, `scan.failed`, `backup.failed`.
- HMAC-SHA256 signature header.
- Retries with exponential backoff; per-endpoint disable-after-N-failures.

### P2-3: Theme system

User-selectable themes including a dark / light / system mode and at least one high-contrast theme.

### P2-4: Import from Kavita

One-shot importer that reads a Kavita SQLite backup and translates users, libraries, series mappings, reading progress, collections, and reading lists.

**Acceptance criteria**

- Idempotent dry-run mode prints the planned writes.
- File paths are remapped via a configurable `from → to` table.
- Reading progress preserves last-read positions (image and EPUB) where the chapter is matched by hash.

### P2-5: Public share links

Time-boxed, optionally password-protected share link to a chapter or series.

**Acceptance criteria**

- Configurable TTL up to admin-set maximum.
- Links revocable; revocation is immediate.
- Shared content respects original age rating and library ACL of the link creator.

### P2-6: ComicVine deep-link

In addition to P1-6, surface a "view on ComicVine" link when the series has a ComicVine match, and let admins paste a ComicVine URL to force-match.

---

## Non-functional requirements

### NFR-1: Performance budgets

- API p95 latency under 150 ms on cached library state, under 500 ms on cold cache, under load of 50 concurrent users.
- Reader time-to-first-page under 500 ms on LAN, under 1.5 s over public internet on a 10 Mbit/s downlink.
- Cover thumbnail at 256 px served in under 50 ms p95 from cache.

### NFR-2: Resource footprint

- Idle RAM under 300 MB on a library of 50k chapters.
- A scan must never OOM on 1 GB of available RAM regardless of archive size; large archives are streamed.

### NFR-3: Security

- HTTPS only in production; HTTP redirected.
- Secure cookie flags on all auth cookies.
- All passwords Argon2id with per-install pepper from a file outside the DB.
- CSRF protection on cookie-authed routes.
- All user-supplied paths are resolved and confined to library roots; symlinks outside the root are rejected on scan.
- Dependencies scanned in CI; failing build on known-high CVE.

### NFR-4: Compatibility

- Linux x86_64 and arm64 official binaries.
- macOS arm64 dev build; Windows is best-effort.
- Postgres 16 minimum.

### NFR-5: Deployment

- Single binary plus single config file plus Postgres URL is sufficient to start.
- First-run wizard creates the admin user; no env-var-only admin creation in v1.
- Official Docker image; rootless-friendly.

### NFR-6: Observability

- Structured JSON logs by default, configurable to text.
- Prometheus `/metrics` endpoint exposing scan duration, queue depth per job type, request latency histograms.
- A request ID propagates from the edge through job submissions for cross-correlation.

### NFR-7: Accessibility

- WCAG 2.1 AA targeted on the web UI: keyboard navigability, focus rings, ARIA roles, color-contrast checked themes.
- The image reader has a reader-only "low motion" mode that disables animated transitions.

---

## Glossary

- **Library** — a configured root directory plus its kind (comic / manga / ebook).
- **Series** — a logical work (e.g. "One Piece"); has many volumes.
- **Volume** — a publishing unit within a series; has many chapters.
- **Chapter** — a single readable file, usually one CBZ / EPUB / PDF.
- **Derivative** — a generated artefact (cover thumbnail, page WebP) cached on disk.
- **OPDS** — Open Publication Distribution System, a catalog feed format.
- **OPDS-PS** — OPDS Page Streaming, the per-page acquisition extension used by manga/comic clients.
- **CFI** — Canonical Fragment Identifier, the EPUB position addressing scheme.

---

## Sources

The Kavita-side comparison was drawn from:

- Kavita wiki — https://wiki.kavitareader.com/
- Kavita 0.8.7 release notes — https://github.com/Kareadita/Kavita/releases/tag/v0.8.7
- Kavita 0.8.8 / 0.8.9 / 0.9.0 release notes — https://github.com/Kareadita/Kavita/releases
- OPDS 1.2 spec — https://specs.opds.io/opds-1.2
- OPDS-PS spec — https://specs.opds.io/opds-1.2#page-streaming-extension
- ComicInfo schema — https://anansi-project.github.io/docs/comicinfo/intro
