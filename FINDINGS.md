# CB8 ← Kavita: Feature Gaps & Implementation Plans

## Scope

This document compares **Kavita's headline features against what CB8 ships today** and proposes how to close the highest-impact gaps. CB8 is an Electron + Node.js + TypeScript + better-sqlite3 + vanilla-JS SPA already at v1.0.4 with a working library scanner, image/EPUB/PDF reader, multi-user auth, covers, FTS5 search, and external-metadata enrichment (ComicVine / AniList / MangaDex). The plans below are extensions to that codebase, **not a rewrite**.

## Where CB8 already matches or beats Kavita

Worth saying so the gap list isn't read as "everything is missing":

- Image reader (single / spread, RTL, fit modes, prefetch, pinch-zoom, transitions).
- EPUB reader with Google Fonts, theme, font sizing, CFI position tracking.
- Per-user reading progress + continue-reading + bookmarks with notes.
- External metadata enrichment (CB8 has this for free; Kavita gates ComicVine etc. behind Kavita+).
- FTS5 search (~7 ms at 100k rows) and on-the-fly cover resize with 2 GiB LRU.
- bcrypt + better-auth sessions, login + password-reset rate limiting, SSRF-guarded outbound fetches.

## Methodology for the gap list

Ranked by **(Kavita-user expectation) × (unlock per engineering day)**. Tier 1 items are non-negotiable for users coming from Kavita; Tier 2 is parity polish; Tier 3 is lifecycle/admin.

Effort buckets: **S** ≈ 1–3 days, **M** ≈ 1–2 weeks, **L** ≈ 3+ weeks.

---

## Tier 1 — non-negotiable for Kavita parity

### 1. OPDS 1.2 + OPDS-PS feeds — **L**

**What Kavita has.** A read-only OPDS catalog that Mihon, Panels, KyBook, Chunky, KOReader, and Foliate all consume. OPDS-PS (page streaming) is what makes manga clients usable.

**Why it matters.** Single biggest "I'd switch from Kavita" blocker. CB8 has no native mobile app; OPDS is the cheapest way to be on every iOS/Android comic reader.

**Implementation outline.**
- New module `src/main/webServer/routes/opds.ts` rendering Atom XML. Reuse existing comic queries; OPDS is a different presentation, not a new data model.
- Routes:
  - `GET /opds/v1.2` — root nav feed
  - `GET /opds/v1.2/libraries` → `/library/:id` → series/folder list
  - `GET /opds/v1.2/series/:name` (or `:id` after #4 lands) → chapter acquisition entries
  - `GET /opds/v1.2/comic/:id/file` — original file download
  - `GET /opds/v1.2-ps/comic/:id/page/:n` — OPDS-PS page acquisition (re-uses `/api/comics/:id/pages/:n`)
  - `GET /opds/v1.2-ps/comic/:id/progression` — GET/PUT progress (writes the same `progress` row as the web reader)
- Auth: HTTP Basic over TLS or `?api_key=` (depends on #6 below). Honour the same role checks already in `auth.ts`.
- Pagination: standard OPDS `next` / `prev` links, page size 50.
- Manual verification matrix: install Mihon, Panels, KOReader, Foliate against a fixture library before shipping.
- Add `feed-validator` check in CI against the OPDS 1.2 schema.

**Files to touch.** New `routes/opds.ts`, small wiring change in `src/main/webServer/index.ts`, `src/main/webServer/auth.ts` for API-key middleware.

**Risks.** Each client has quirks (Mihon expects specific link `rel` values; Panels wants `image/jpeg` thumbnails). Budget time for a manual test pass per client.

---

### 2. Library → Series → Volume → Chapter hierarchy — **L**

**What Kavita has.** A real relational graph. Series have many volumes, volumes have many chapters, chapter numbers can be fractional (12.5).

**What CB8 has.** A flat `comics` table with optional `series_name`, `volume_number`, `chapter_number` columns; series is computed from filename at query time.

**Why it matters.** Reading lists, smart filters, OPDS catalogs, "next chapter" navigation, and series-level metadata (status, summary, cover override) all want first-class series and volume rows. Without them every consumer reinvents grouping by string equality.

**Implementation outline.**
- Migration: new `series` and `volume` tables; add `series_id`, `volume_id` columns to `comics`; backfill from existing `series_name` / `volume_number` parsing. Keep the legacy columns during a transition period — they're cheap.
- Queries: replace `getAllSeries()` / `getSeriesComics()` (`src/main/webServer/routes/progress.ts:117-135`) with joins, not GROUP BY on the name column.
- Volume numbers `numeric` so 1.5 etc. work; natural-sort key column for series.
- Series-level fields: `status` (ongoing/completed/hiatus), `summary`, `cover_comic_id` override, `localized_name`.
- Re-point external-metadata writes (`metadataScraper.ts`) to write series-level fields where appropriate.
- Soft-delete (`deleted_at`) so progress + bookmarks survive a temporary file disappearance.
- Frontend: `src/web/views/library` and series/folder views need updating to navigate the new hierarchy.

**Risks.** Largest schema change in this list. Do it before #1 (OPDS) ships so the catalog doesn't expose a soon-to-change shape. Migration must be reversible-by-restore; test with a real user DB.

---

### 3. ComicInfo.xml parsing on ingest — **S/M**

**What Kavita has.** Reads `ComicInfo.xml` from CBZ/CBR/CB7 archives and extracts series, volume, chapter, summary, genre, tags, writer/artist, age rating, language.

**What CB8 has.** Filename heuristics only (`seriesParser.ts`).

**Why it matters.** A correctly-tagged library "just works" without manual editing — series detection, age gating, tagging all populate for free. This is the single biggest reduction in user friction at first import.

**Implementation outline.**
- New `src/main/comicInfoParser.ts` — open archive, look for `ComicInfo.xml` at root, parse with `fast-xml-parser` (already a small dep).
- Wire into `ingestService.ts` after format detection: ComicInfo wins over filename parse; merge into the same fields.
- Map fields:
  - `Series` / `Volume` / `Number` → series/volume/chapter (depends on #2).
  - `AgeRating` → `comic.age_rating` (G/PG/Teen/Mature/X18+); needed by #4.
  - `Genre`, `Tags`, `Writer`, `Penciller`, `Inker` → tag table.
  - `Summary`, `LanguageISO`, `Web` → comic columns.
- Re-ingest path: an admin "rescan metadata" button that re-reads ComicInfo without re-extracting covers.

**Files to touch.** New parser, `ingestService.ts`, `src/main/db/comics.ts` for new columns, admin UI button.

**Risks.** ComicInfo is loosely speced — different scanlation groups use different conventions. Keep filename parsing as the fallback, never let one bad XML kill the scan.

---

### 4. Filesystem watcher with debounce — **S/M**

**What Kavita has.** Live detection of added/removed/renamed files; no manual rescan needed.

**What CB8 has.** Manual scan only. Documented as Tier 1 backlog already.

**Why it matters.** Users `rsync` or torrent into the library and expect it to show up.

**Implementation outline.**
- Use `chokidar` (already common in Electron apps) one watcher per library root.
- Coalesce events in a 2-second window per directory subtree to absorb bulk copies; one `rsync` of 1,000 files should produce a handful of jobs, not 1,000.
- Reuse `ingestService.ts` worker pool, just feed it targeted paths.
- Recover from inotify queue overflow (chokidar emits a `raw` event with `IN_Q_OVERFLOW` on Linux) → trigger a targeted rescan of the affected subtree.
- Settings: per-library "watch enabled" toggle, default on; off for network-mount roots that can flap.

**Files to touch.** New `src/main/libraryWatcher.ts`, hook into `index.ts` startup, settings field in library row.

**Risks.** Network filesystems (NFS, SMB) often don't deliver inotify events. Document the limitation and offer a polling fallback flag.

---

### 5. Per-library ACLs + age-rating gating — **M**

**What Kavita has.** Each user has an explicit allow-list of libraries and a maximum age rating. Content above their gate is invisible — not just hidden but un-fetchable; direct ID access returns 404, not 403, so existence isn't leaked.

**What CB8 has.** Admin / guest / regular-user roles, all-or-nothing access, no age gating.

**Why it matters.** Self-hosted servers are shared with family. Without per-library ACLs and age gating, the owner can't share at all if any library is adult-targeted.

**Implementation outline.**
- Schema: `library_user_acl(library_id, user_id, primary key (library_id, user_id))`; `users.max_age_rating` enum column.
- Middleware: a single `enforceLibraryAndAge(req, comic|library)` helper used by every route that returns library content (the comics, libraries, folders, progress, search routes).
- Critical: the helper must return **404** when ACL or age check fails on a direct ID fetch, not 403. Cite this in code comments.
- Search (`src/main/db/comics.ts` FTS query) gets ACL + age filters in the SQL `WHERE`, not in post-filter — otherwise rank/limit are wrong.
- Admin UI: per-user library checkboxes + age dropdown on the existing user list.
- Migration default: existing users get `max_age_rating = 'mature'` and access to all current libraries (no surprise lock-out).

**Files to touch.** Migration, `src/main/webServer/auth.ts` (new middleware), every list route under `routes/`, `src/web/admin.js`.

**Risks.** Easy to miss a route. Add an integration test per route that asserts a `teen`-capped user gets 404 (not 403) on an `adults_only` series.

---

### 6. API keys — **S**

**What Kavita has.** Named, revocable API keys (opaque, prefixed, last-4 visible in UI). Required for OPDS clients that don't do interactive Basic auth well.

**What CB8 has.** Sessions only.

**Why it matters.** OPDS (#1) needs them. So does any future scripting.

**Implementation outline.**
- Schema: `api_keys(id, user_id, name, prefix, last4, hash, created_at, revoked_at, last_used_at)`.
- Format `cb8_<8-char-prefix>_<32-byte-base64url-random>`. Hash with SHA-256 (no need for argon2 — these are 192 bits of entropy already).
- Middleware: accept `Authorization: Bearer cb8_...` or `?api_key=cb8_...` query param; resolve to user; honour the same ACL/age checks as session auth.
- UI: small "API keys" panel in user settings — create (full key shown once), list (prefix + last4), revoke.
- Surface `last_used_at` so users can spot stale keys.

**Files to touch.** New migration, `src/main/db/apiKeys.ts`, `src/main/webServer/auth.ts`, `src/web/views/account/apiKeys.js`.

**Risks.** None significant. Keep `last_used_at` writes async/throttled so they don't hammer SQLite.

---

## Tier 2 — parity polish

### 7. EPUB enhancements: TOC panel, in-book search, footnote pop-overs, highlights — **M**

**What Kavita has.** A real EPUB reader with table of contents, search inside the book, footnote popups, and persistent highlights.

**What CB8 has.** epub.js reader with theme, fonts, CFI position. Bookmarks page-level only.

**Implementation outline.**
- TOC panel: epub.js exposes `book.navigation.toc`; render in a side drawer.
- In-book search: `book.search(query)` returns CFIs; render a result list with click-to-navigate.
- Footnote popups: intercept clicks on `epub:type="noteref"` anchors, render the target in a floating card. epub.js `rendition.hooks.content` is the integration point.
- Highlights: schema `highlights(id, user_id, comic_id, cfi_start, cfi_end, color, note, created_at)`; `rendition.annotations.highlight()` is the render API.
- API: `/api/comics/:id/highlights` CRUD; included in the existing progress sync.
- UI: small palette (4 colors), optional note, list view per book and global.

**Files to touch.** `src/web/views/reader/epubReader.js`, new highlights table + routes, new TOC/search drawer in the reader chrome.

**Risks.** epub.js search is slow on big books; debounce and show progress. Highlights anchored to CFI can drift when the user changes font size — accept the small drift; Kavita has the same issue.

---

### 8. Smart filters + saved + customisable dashboard — **M**

**What Kavita has.** Compose boolean filter expressions over library / age / genre / tag / author / read-state / format / language; save them; pin them as cards on a dashboard you can rearrange.

**What CB8 has.** Smart filters in localStorage, no save/share, no dashboard composition.

**Implementation outline.**
- Schema: `saved_filters(id, user_id, name, expr_json, is_shared, created_at)`; `dashboard_layout(user_id, device_class, layout_json)`.
- Filter expression: a small JSON AST `{ op: 'and'|'or'|'not', children: [...] }` with leaf nodes `{ field, op, value }`. Cap depth at 16.
- Compiler: `filter → SQL WHERE` in `src/main/db/filterCompiler.ts`. Parameterised, never string-interpolated.
- Sharing: `/share/filter/<base64-expr>` URL; the recipient's view still applies their own ACL + age gate.
- Dashboard: cards = `{type, title, source}` where `source` is `continue-reading`, `recently-added`, `saved-filter:<id>`. Drag-to-reorder, separate desktop/mobile layouts.

**Files to touch.** New migration, `filterCompiler.ts`, `routes/filters.ts`, `src/web/views/dashboard.js`.

**Risks.** Filter compiler is the security-sensitive piece. Whitelist fields and operators; never let user JSON drive raw SQL.

---

### 9. Reading lists (ordered, distinct from collections/folders) — **S**

**What Kavita has.** Ordered chapter lists (e.g. "Marvel Civil War reading order") that span series.

**What CB8 has.** Virtual folders (set semantics, not ordered) and per-tag grouping.

**Implementation outline.**
- Schema: `reading_lists(id, owner_id, name, is_public, created_at)`, `reading_list_items(list_id, comic_id, position, primary key (list_id, comic_id))`.
- Reuse the virtual-folder UI patterns — most of the chrome is the same; the only behavioural difference is order matters.
- Reorder via drag-handle; persist positions in batches.
- Reader's "next chapter" looks at the active reading-list context if the user opened from one, falling back to series order.

**Files to touch.** New migration + DB module, routes, a small reader-chrome change.

---

### 10. Statistics dashboard — **S/M**

**What Kavita has.** Pages read per day/week/month/year, time spent reading (idle gaps collapsed), top series/genres/authors.

**What CB8 has.** `reading_history` table is logged; no UI.

**Implementation outline.**
- Materialised aggregates: a nightly job (after #11 below, or just `setInterval` for now) writes `daily_reading_stats(user_id, day, pages_read, seconds_read)`.
- Time-spent derivation: walk `reading_history` per user per day, collapse gaps > 10 minutes (configurable).
- API: `/api/me/stats?range=week|month|year`.
- UI: small stats page using Chart.js or similar; reuse the existing chrome.

**Files to touch.** New aggregator, new route, new view. Schema migration for the aggregate table.

**Risks.** Idle-gap derivation can over- or under-count depending on debounce on the reader's progress pings. Tune the gap threshold against real history before publishing the numbers.

---

## Tier 3 — lifecycle / admin

### 11. Background job runner — **M**

**What Kavita has.** Hangfire-backed jobs (scan, cover, metadata refresh) with admin UI for queued/running/failed and retry/cancel.

**What CB8 has.** Inline workers via semaphore in `ingestService.ts`. Fine for current scale; will bite when stats aggregation, scheduled backups, and metadata refresh land.

**Implementation outline.**
- Lightweight in-process queue persisted to SQLite — no Redis. Schema: `jobs(id, type, args_json, state, attempts, last_error, run_after, created_at)`.
- Worker pool per job type with configurable concurrency.
- Job types in v1: `library.scan`, `library.watch_event`, `cover.derive`, `metadata.refresh`, `stats.aggregate`, `backup.create`.
- Survives restart: worker re-claims `running` rows older than a heartbeat threshold.
- Admin UI panel listing jobs with retry/cancel.
- Wrapper API so existing inline calls migrate one at a time.

**Files to touch.** New `src/main/jobs/` package, admin route + UI page, gradual adoption from `ingestService.ts`, watcher (#4), metadata scraper.

**Risks.** Don't over-engineer. The schema above plus a single worker file is enough; do not introduce a generic distributed queue.

---

### 12. Send-to-device (Kindle email, generic SMTP, webhook) — **S/M**

**What Kavita has.** Send chapter or series to a Kindle email or a webhook, format-aware (CBZ wraps for image formats).

**Implementation outline.**
- Per-user device list: `user_devices(id, user_id, kind: kindle|smtp|webhook, target, verified_at)`.
- Verification: send a one-time code to the target, user pastes it back.
- Worker: enqueues a job (depends on #11) that fetches the file, wraps if needed, and dispatches via the existing nodemailer setup or HTTP.
- UI: "Send to..." button on chapter/series; status surfaced from the job row.

**Risks.** Kindle email has size limits and format quirks; document supported formats per device kind.

---

### 13. Backups & restore — **S**

**What Kavita has.** Scheduled backups of the SQLite DB + config.

**What CB8 has.** Nothing built-in (the SQLite file is the source of truth; users back it up themselves).

**Implementation outline.**
- `cb8 backup create` — copies the DB with `sqlite3_backup_init` (consistent online copy), bundles `meta.json` + app config into a tar.gz with timestamp.
- `cb8 backup restore <file>` — offline restore on a fresh data dir; covers re-derive on first scan.
- Schedule: cron-style config; rotation `keep_last_N`.
- Admin UI button for one-shot.

**Risks.** None significant — `better-sqlite3`'s online backup API is well-trodden.

---

### 14. User invite flow — **S**

**What Kavita has.** Admin invites by email; invitee sets their own password from a link.

**What CB8 has.** Admin creates users directly with a password they must communicate out-of-band.

**Implementation outline.**
- Schema: `invites(token_hash, email, role, max_age_rating, libraries_json, created_by, expires_at, accepted_at)`.
- Admin posts an invite → server emails a link `/accept-invite/<token>`.
- Acceptance page: invitee enters display name + password, server creates the user with the pre-baked role / ACL / age cap.
- TTL default 72h, single-use.

---

### 15. Series relationships (sequel/prequel/spin-off) — **S**

**What Kavita has.** Typed directed edges between series; auto-populated from external metadata; manually editable.

**Implementation outline.**
- Schema: `series_relationships(from_series_id, to_series_id, kind, primary key (from_series_id, to_series_id, kind))`. Depends on #2 (real series IDs).
- AniList already returns relations in the existing scraper response — wire those in `metadataScraper.ts`.
- Series detail page surfaces edges with one-click navigation.

---

## Out of scope here (mention only)

These are real Kavita features but lower-leverage for v1 parity; capture them as backlog rather than planning them now:

- **Public time-boxed share links** — depends on #1 + #5.
- **Webhooks (outgoing)** — `series.added`, `chapter.added`, `scan.failed` with HMAC. Depends on #11.
- **CB7 / AVIF / RAW image formats** — small library-of-users; mostly Linux dependency on `7zr`.
- **Calibre / Komga import** — only matters when migrating from those tools.
- **Want-to-read list** — trivial after #9.
- **Themes beyond light/dark** — pure frontend.

---

## Suggested execution order

If you took these on in this order, each milestone unlocks the next:

1. **#3 ComicInfo.xml** — cheap, makes everything downstream smarter immediately.
2. **#4 Filesystem watcher** — small and standalone, big perceived-quality win.
3. **#2 Series/Volume/Chapter hierarchy** — foundational; do before OPDS so the catalog is right the first time.
4. **#5 ACLs + age gating** — required before #1 ships, otherwise OPDS leaks adult content.
5. **#6 API keys** — last prerequisite for #1.
6. **#1 OPDS / OPDS-PS** — the headline feature.
7. Then #11 (jobs) → #10 (stats) → #7 (EPUB enhancements) → #8 (smart filters / dashboard) → #9 (reading lists) → #12 (send-to-device) → #13 (backups) → #14 (invites) → #15 (relationships).

Total Tier 1 is roughly 2–3 months of one engineer at a steady pace; Tier 2 another 1–2; Tier 3 another 1–2. Deliberately ignore "we could do it all in parallel" — most of these touch the same routes file.
