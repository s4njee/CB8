# Performance notes

Findings from a latency-focused performance pass (2026-07-03) across the Flutter
app, the CB8 server, and the web renderer. "Applied" items are in the tree;
"Deferred" items are ranked follow-ups with the reasoning captured so they don't
have to be rediscovered.

## Flutter app — applied

- **Debounced reader progress writes** (`lib/features/reader/progress_saver.dart`,
  wired into the comic/PDF/unified readers; 800ms trailing, `flush()` on dispose).
  Previously every page turn / Readium locator event fired a DB UPDATE +
  `reading_history` INSERT (or an HTTP PUT on remote) and, via Drift's change
  stream, refetched all seven catalog providers while the reader was open.
- **Throttled `libraryChangesProvider`** (providers.dart; leading+trailing, 400ms).
  Drift emits one event per statement, so bulk imports refetched the catalog N×.
- **`LibraryQuery` value equality** (library_source.dart). The
  `browseComicsProvider` family keyed on identity, so every visit to a
  tag/collection/series grid created a fresh provider (refetch per rebuild) and
  permanently cached a duplicate result list.
- **Cover byte cache window** (`localCoverProvider`: keepAlive + 30s onCancel
  timer). autoDispose dropped cover bytes the instant a card scrolled off; new
  Uint8List identity also defeated the image cache, so scroll-back re-hit SQLite
  and re-decoded. Thumbnails are ~30KB 240×360 JPEGs, so the window is cheap.
- **Adjacent-page precache in the comic reader** (`_precacheAround`, ±1 page,
  ±2–3 in two-page mode; PDF renders go through the existing render gate).
- **Startup**: SharedPreferences + app-support-dir platform calls now run
  concurrently before `runApp` instead of serially.

## Flutter app — deferred (ranked)

1. Per-table change granularity: even throttled, a progress write refetches
   tags/libraries/series, which it can't change. `TableUpdateQuery.onTable(...)`
   per provider group; needs a wider `LibrarySource` seam (remote has no stream).
2. Browse-grid pagination: `LibraryQuery.limit` defaults to 60 with no load-more;
   large libraries silently truncate.
3. `reading_history` batching: one row per reading session instead of two
   statements per (debounced) save. Behavior change for analytics granularity.
4. Make `browseComicsProvider` autoDispose with a keepAlive window — distinct
   queries currently stay cached forever. Interacts with pull-to-refresh paths.
5. FTS5 for local search (currently `LIKE '%…%'` over title/series/author).
6. Isolate the unified reader's progress bar behind a ValueNotifier so locator
   events stop rebuilding the whole screen (platform view tolerates it; minor).

## Server — applied

- **N+1 kill on `/api/series/:name/comics`**: `overlayUserStateMany()` batches
  user progress + favorites into 2 queries total (was 2×N). The other list
  endpoints already overlaid via SQL joins — verified, not changed.
- **Stopped fetching cover BYTEA blobs in list queries** (`COMIC_NO_BLOB_COLUMNS`):
  shared/per-user reading lists, series comics, and `getAllFolders` (which was
  also GROUPing BY the bytea just to compute a boolean; now selects
  `hasCoverThumbnail`).
- **`getComicLite()`** on hot paths: `/pages/:i` (every page turn), `/file`,
  `/manifest`, and `requireComicLite` for progress/bookmark/favorite/history
  routes — one no-blob query, no tags query. `getComic` kept where tags/blob are
  actually used.
- **COUNT query join trim**: `queryComicsForUser`'s count no longer joins
  user_progress/user_favorites unless the WHERE references them.
- **Indexes** (idempotent, in `createPg.ts`): partial `comics(last_read DESC)`,
  `comics(series_name)` + `lower(series_name)`, `user_progress(user_id,
  last_read DESC)`, `comic_tags(tag_id)`.
- **SPA asset caching**: content-hashed `/assets/*` now `public, max-age=31536000,
  immutable` (was `no-cache` → revalidated MBs of JS per load); `index.html`
  stays `no-cache`.

## Server — deferred (ranked)

1. Per-request session lookup: better-auth `getSession` hits the DB on every API
   request before route work. Enable cookieCache or a short-TTL token→user
   cache. Likely the largest remaining constant cost.
2. JSON compression: none anywhere. API responses bypass Fastify via
   `reply.hijack()`, so it needs zlib in `sendJson` (with a size threshold) or
   route migration. Big win for `/api/comics` on large libraries.
3. Immutable thumbnails: `?v=` derives from `dateAdded`, but cover updates don't
   touch it — switch to the already-computed `thumbnail_version` (blob hash),
   then serve `immutable`.
4. pg_trgm GIN indexes for the `ILIKE '%…%'` paths (folder hierarchy, library
   search) as a best-effort statement in `openPg.ts` (extension may not exist).
5. Thumbnail route uses `getComic` (needs blob, not tags) — dedicated fetch
   would drop one query per grid cell.
6. Pool sizing env-configurable (`max: 10` hard-coded) + `statement_timeout`.
7. Archive handle LRU capacity 5 thrashes with >5 concurrent readers.

## Web renderer — applied

- **Code splitting**: readers were already lazy; the eager weight was admin code
  and unsplit vendor. `AdminModal`/`SettingsPage`/`UsersPage` are now
  React.lazy (modal mounts on first open, stays mounted for close animation);
  `manualChunks` splits `vendor-react` and `vendor-query` (cache-stable across
  app deploys — deliberately no catch-all so epub.js/pdf.js stay in their lazy
  chunks). Idle-time prefetch warms the reader chunks after first paint.
  Main chunk: **603 kB → 330 kB min (180 → 95 kB gzip)**; the >500 kB build
  warning is gone.
- **Grid re-render granularity**: ComicCard subscribes to two boolean zustand
  selectors instead of the whole selection array (a toggle re-renders 1 card,
  not N), is wrapped in React.memo, and thumbnails decode async; LibraryGrid
  memoizes `orderedIds`/context-menu callback; AllPage/LibraryPage/TagPage
  memoize the infinite-query flatten so the memo chain holds.

## Web renderer — deferred (ranked)

1. Grid windowing for large libraries (`content-visibility: auto` +
   `contain-intrinsic-size` as the no-dep option; virtualization as the real fix).
2. Raise default React Query `staleTime` (30s → 2–5 min); mutations already
   invalidate explicitly. Tradeoff: staler multi-device progress overlays.
3. Per-field uiStore selectors (Navbar/FilterStrips destructure the whole store).
4. Reader open paints nothing until `['comic', id]` refetches (staleTime 0 for
   resume correctness) — could paint from cache with background refetch, but
   risks a resume-position jump; needs design.
5. Prefetch `pdf.worker.mjs` alongside the PdfReader chunk.

## Verification (combined tree)

- Flutter: `flutter analyze lib` clean; 44/44 tests pass.
- webui: `tsc --noEmit` clean; 377 tests pass (22 pre-existing skips);
  production build succeeds with no chunk-size warning. Server pg-backed suites
  verified against a live disposable Postgres by the server pass (one
  pre-existing parallel-TRUNCATE flake in `pgTestDb.ts`, present on clean
  baseline, unrelated).
