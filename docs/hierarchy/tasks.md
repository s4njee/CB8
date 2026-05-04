# Series / Volume Hierarchy — Tasks

Step-by-step implementation plan for the design in `docs/hierarchy/design.md`. Tasks are grouped into the 11 phases sequenced in design §13. Phases are dependent in order; tasks within a phase may be parallelisable. Each task lists the files it touches and the check that says it's done.

Conventions:
- `T-X.Y` references task X.Y; use these in commit messages and PR descriptions.
- Each phase ends in **green**: tests pass, app boots, existing flows work. Do not move to phase N+1 with phase N red.
- "Acceptance" = the observable check, not the code change.

---

## Phase 1 — Schema migration v7 + repos

Goal: the new tables, columns, and indexes exist; backfill runs cleanly on a real v6 DB; new repo modules expose CRUD; nothing about ingest or read paths changes yet.

> **Post-script (green-field collapse).** Phase 1 originally shipped as a v6 → v7 migration with a backfill from `comics.series_name`. The project later committed to a green-field deploy and the entire migration history was collapsed to v1: `create.ts` now defines the post-v7 schema directly, and `migrations.ts` is just bootstrap. The tasks below document what was built; the collapse is recorded in `design.md` §3.

- [x] **T-1.1 — Add v7 migration block to `migrations.ts`**
  - File: `src/main/db/schema/migrations.ts`
  - Bump `CURRENT_VERSION` from 6 to 7. Add `if (version < 7)` block running the DDL from design §2.1 + §2.2 (new `series`, `volume` tables; ALTER TABLE on `comics` for `series_id`, `volume_id`, `deleted_at`, `publication_year`, `publication_month`, `comicinfo_json`, `user_edited_fields`; new indexes).
  - Acceptance: opening a v6 fixture DB advances to v7; opening it again is a no-op (idempotent). `PRAGMA foreign_key_check` returns zero rows.

- [x] **T-1.2 — Add backfill SQL inside the v7 block**
  - File: `src/main/db/schema/migrations.ts`
  - Insert series rows from `comics.series_name` grouped per `library_comics.library_id` (NOCASE). Insert volume rows from `comics.volume_number`. Update `comics.series_id` / `volume_id`. Use `ORDER BY library_comics.rowid LIMIT 1` for the ambiguous-library tiebreak (R-13).
  - Register a JS function via `db.function('cb8_sort_name', computeSortName)` for the duration of the migration to populate `series.sort_name`. Unregister after.
  - Log `migrated N comics into S series and V volumes in Tms` (NFR-H4).
  - Acceptance: migration on a fixture DB with mixed `series_name` values produces the expected row counts; ambiguous-library cases are logged at warn; comics with `series_name IS NULL` end up with `series_id IS NULL` (standalone).

- [x] **T-1.3 — Add the `series_fts` virtual table + triggers**
  - File: `src/main/db/schema/migrations.ts` (same v7 block)
  - DDL from design §2.3.
  - Acceptance: inserting a series row populates `series_fts`; updating/deleting keeps it in sync. A `MATCH` query returns the new rows.

- [x] **T-1.4 — Commit a v6 fixture DB** *(consolidated into T-1.5: programmatic v6-shape builder in `migrations.test.ts`, no binary fixture, diff-friendly.)*

- [x] **T-1.5 — Migration tests**
  - File: `src/main/db/schema/migrations.test.ts` (new)
  - Tests: clean v6 → v7 forward migration with row-count assertions; idempotency (run twice, second is a no-op); foreign-key check after migration returns zero rows; ambiguous-library log line is emitted with comic id + library ids.
  - Acceptance: `npm test migrations.test` green.

- [x] **T-1.6 — `seriesRepo` (`src/main/db/series.ts`)**
  - File: `src/main/db/series.ts` (new)
  - Functions: `getOrCreate(libraryId, name)`, `get(id)`, `listForLibrary(libraryId, opts)`, `update(id, fields)`, `softDelete(id, when)`, `restore(id)`, `lookupByName(libraryId, name)` for the deprecation shim.
  - NOCASE upsert is `INSERT … ON CONFLICT (library_id, name) WHERE deleted_at IS NULL DO UPDATE SET updated_at = …` — relies on the partial unique index from T-1.1.
  - Acceptance: unit tests cover the get-or-create idempotency, NOCASE collision, and soft-delete restore.

- [x] **T-1.7 — `volumeRepo` (`src/main/db/volume.ts`)**
  - File: `src/main/db/volume.ts` (new)
  - Functions: `getOrCreate(seriesId, number, label)`, `getOrCreateImplicit(seriesId)`, `get(id)`, `listForSeries(seriesId, includeImplicit)`, `update(id, fields)`, `softDelete(id, when)`, `restore(id)`.
  - Two upsert paths because the "implicit" uniqueness is partial (R-3). Implicit volumes have `number IS NULL`; numbered volumes have `number = ?`.
  - Acceptance: unit tests cover both upsert paths and the constraint that a series has at most one implicit volume.

- [x] **T-1.8 — Wire repos into `LibraryDatabase`**
  - File: `src/main/libraryDatabase.ts`
  - Expose `seriesRepo` and `volumeRepo` as accessors so `comics.ts`, ingest, and routes can reach them through the existing facade.
  - Acceptance: TypeScript compiles; existing tests pass.

---

## Phase 2 — ComicInfo.xml parser

Goal: a pure-function module that reads `ComicInfo.xml` from a CBZ/CBR and returns a typed result.

- [x] **T-2.1 — Add `fast-xml-parser` dependency**
  - File: `package.json`
  - Pinned semver. Verify it bundles cleanly into the Electron build.
  - Acceptance: `npm install` succeeds; bundler does not warn.

- [x] **T-2.2 — `comicInfoParser.ts`**
  - File: `src/main/comicInfoParser.ts` (new)
  - Exports `read(archive: ArchiveHandle): Promise<ComicInfo | null>` and a `ComicInfo` type covering `series`, `volume`, `number`, `title`, `summary`, `publisher`, `language`, `year`, `month`, `pageCount`, `ageRating`, `pages` (as `{ image: number; type?: string }[]`), `raw` (the parsed object).
  - Locate `ComicInfo.xml` in the archive root by case-insensitive name match (R-16). Files in subdirectories are ignored. Tolerate mixed-case element names by configuring the parser with a key transform.
  - On parse error, return `null` and let the caller decide; do not throw.
  - Acceptance: returns `null` for archives without ComicInfo.xml; returns a populated object for the Gwenpool sample (`Gwenpool Omnibus (2022) (Digital) (Kileko-Empire).cbz`).

- [x] **T-2.3 — Age-rating mapping helper**
  - File: `src/main/comicInfoParser.ts`
  - `mapAgeRating(raw: string): AgeRating` — fold ComicInfo's free-form values (`Everyone`, `Teen`, `Mature 17+`, `R18+`, …) into the R-1 enum. Unknown values map to `'unknown'`.
  - Acceptance: unit-tested matrix of inputs.

- [x] **T-2.4 — `comicInfoParser.test.ts`**
  - File: `src/main/comicInfoParser.test.ts` (new)
  - Cases: valid minimal XML, missing root namespace, mixed-case element names, malformed XML, the Gwenpool sample, archive with no `ComicInfo.xml`, archive with a `comicinfo.xml` (lowercase) at root.
  - Acceptance: all cases pass.

---

## Phase 3 — `seriesParser.ts` extensions

Goal: pure-function helpers for the new heuristics. Existing `parseSeriesFromFilename` is unchanged in behaviour and remains the fallback.

- [x] **T-3.1 — `parseFolderVolumeMarker(folderName)`**
  - File: `src/main/seriesParser.ts`
  - Regex `/^(.+?)\s+v(\d+)$/i`. Returns `{ seriesName, volumeNumber }` or `null`.
  - Acceptance: unit tests for `Avengers v1`, `Doom 2099 v1`, `Captain America v3`. Negative cases: `Avengers vs Pet Avengers`, `Avengers Forever`, `1602`, `vN` alone, `Foo v` (no digits), `Foo v1.5` (decimal — reject; per R-20 only integer).

- [x] **T-3.2 — `stripDatePrefix(filename)`**
  - File: `src/main/seriesParser.ts`
  - Regex `/^(\d{4})(\d{2}) (.+)$/`. Plausibility check: year ∈ [1900, currentYear+5], month ∈ [1,12]. Returns `{ stripped, year, month }` on a hit, `{ stripped: filename }` on a miss.
  - Acceptance: `198001 Avengers v1 191.cbz` → `(stripped='Avengers v1 191.cbz', year=1980, month=1)`. `199913 Foo.cbz` → no strip (month invalid).

- [x] **T-3.3 — `computeSortName(name, opts?)`** *(implementation pulled forward into Phase 1 for the v7 backfill; tests added here.)*
  - File: `src/main/seriesParser.ts`
  - Lowercase via `toLocaleLowerCase('en-US')`. Trim, collapse whitespace. If `opts.stripArticles`, move leading article to suffix. Pad runs of digits to 10 places (`Avengers v3` → `avengers v0000000003`).
  - Acceptance: unit-tested matrix; output sorts correctly under plain `COLLATE NOCASE`.

- [x] **T-3.4 — Extend `seriesParser.test.ts`**
  - File: `src/main/seriesParser.test.ts`
  - New describe blocks for the three helpers above; existing tests untouched.
  - Acceptance: all green.

---

## Phase 4 — Folder grouping resolver

Goal: per-directory recurring-base-name detection with caching, used by the metadata resolver to gate-check filenames.

- [x] **T-4.1 — `folderGroupingResolver.ts`**
  - File: `src/main/folderGroupingResolver.ts` (new)
  - Exports `resolve(dir): Promise<FolderGrouping | null>` returning `{ recurringPrefix: string; matches(filename): boolean }` or `null` if the threshold isn't met.
  - Implementation: scandir, normalise each filename via the same rules as `parseSeriesFromFilename`, compute the longest prefix shared by ≥ 2 files. Threshold: prefix length ≥ 3 chars after normalisation. Per-file `matches()` checks the file's own normalised name starts with the prefix.
  - Cache by `dir` for the lifetime of one resolver instance (one ingest run = one cache).
  - Acceptance: unit tests for single-file folder (returns null), multi-file with recurring prefix (returns matcher; matcher accepts the prefix-sharing files and rejects a stray one-shot), multi-file with prefix below threshold (returns null).

- [x] **T-4.2 — `folderGroupingResolver.test.ts`**
  - File: `src/main/folderGroupingResolver.test.ts` (new)
  - Cases: Darth Vader folder simulation (50 files share `Darth Vader`); folder with one stranger (`Darth Vader 001 (2015)…`, `Darth Vader 002 (2015)…`, `Side Story.cbz` — stranger does NOT match); single-file folder; mixed-anthology folder.
  - Acceptance: all green.

---

## Phase 5 — Metadata resolver

Goal: the precedence chain that callers ask "what series/volume/chapter/title is this file?"

- [x] **T-5.1 — `metadataResolver.ts`**
  - File: `src/main/metadataResolver.ts` (new)
  - Exports `resolve(filePath, archive, db, libraryId): Promise<ResolvedMetadata>`. Internally constructs/uses a `FolderGroupingResolver` instance (caller passes the cache so an ingest run reuses it).
  - Steps in order, per design §5: one-shot ancestor guard (R-19) → ComicInfo (R-16) → folder vN (R-20) → folder grouping (R-17) → date prefix strip (R-21) → `parseSeriesFromFilename` fallback (R-6).
  - Returns `{ seriesName, volumeNumber, volumeLabel, chapterNumber, title, summary, publicationYear, publicationMonth, ageRating, comicinfoJson, isStandalone }`.
  - Acceptance: precedence-chain test (T-5.2) green.

- [x] **T-5.2 — `metadataResolver.test.ts`**
  - File: `src/main/metadataResolver.test.ts` (new)
  - One scenario per precedence pair. Example: ComicInfo says `<Series>Iron Man</Series>` but file lives in `Avengers v1/` — result is "Iron Man". Folder vN says vol 2 but ComicInfo says vol 5 — result is 5. Date prefix is stripped before filename parsing.
  - Standalone scenarios: file under `one-shot/` with no ComicInfo → standalone. File under `one-shot/` whose ComicInfo names a series → bound to that series.
  - Acceptance: all scenarios green.

- [x] **T-5.3 — `isUnderOneShot(filePath, libraryRoot)` helper**
  - File: `src/main/metadataResolver.ts`
  - Walk up `path.dirname` from the file to the library root. If any ancestor's basename matches `/^one[\s-]?shot$/i`, return true.
  - Acceptance: unit-tested for `lib/one-shot/foo/x.cbz`, `lib/oneshot/x.cbz`, `lib/one shot/x.cbz`, `lib/Series/one-shot.cbz` (file, not dir — should not match).

---

## Phase 6 — Ingest integration

Goal: ingest writes both the new FK columns AND the legacy columns (R-14 deprecation window). No read paths change yet.

- [x] **T-6.1 — Thread library context through ingest** *(Option B: orphan ingests fall back to an auto-created `Inbox` library; library is now attached inline by `flushBatch`.)*
  - Files: `src/main/ingestService.ts`, `src/main/webServer/routes/upload.ts`
  - `prepareInsert` and `flushBatch` take a `libraryId` parameter. `routes/upload.ts` and any other caller passes the active library. Files ingested without a library ID throw (R-6 acceptance).
  - Acceptance: existing ingest tests pass with the new parameter; a missing-library call raises a descriptive error.

- [x] **T-6.2 — Replace inline parser call with `metadataResolver.resolve`**
  - File: `src/main/ingestService.ts:108`
  - Construct one `FolderGroupingResolver` per ingest run and pass it through. Use the resolver's output in `PreparedInsert` instead of `SeriesInfo`.
  - Acceptance: `prepareInsert` test fixtures still produce correct series/volume/chapter values; the Darth Vader folder fixture produces one series with two volumes (2015, 2017).

- [x] **T-6.3 — Write to both legacy and new columns in `flushBatch`**
  - File: `src/main/ingestService.ts`
  - Inside the existing transaction: call `seriesRepo.getOrCreate(libraryId, name)` and either `volumeRepo.getOrCreate(seriesId, number, label)` or `getOrCreateImplicit(seriesId)`. Set `comics.series_id` / `volume_id`. Continue calling `setComicSeries` so the legacy columns stay populated for one release.
  - Persist `publication_year`, `publication_month`, `comicinfo_json` on the comic row.
  - Acceptance: after ingest of a fixture set, every comic with a series has matching `series_id`, `volume_id`, AND legacy `series_name` / `volume_number` / `chapter_number`. Foreign-key check returns zero rows.

- [x] **T-6.4 — Run-detection (chapter-number collision) at flush time** *(year-as-volume-number when `publicationYear` is set; placeholder integers from a high base when not.)*
  - File: `src/main/ingestService.ts`
  - Inside `flushBatch`, group prepared inserts by resolved `seriesName`. Within each group, detect chapter-number collisions and assign distinct `volumeLabel`s using the precedence in R-17 (ComicInfo `<Volume>` > folder vN > year tag > placeholder).
  - Acceptance: Darth Vader fixture produces two volume rows under one series, chapters do not collide across volumes.

- [x] **T-6.5 — `user_edited_fields` enforcement** *(updateComicMetadata now appends to `user_edited_fields`; `isFieldUserEdited` is wired and ready for future re-resolve flows.)*
  - File: `src/main/db/comics.ts`
  - When `updateComicMeta` writes a field, append the field name to `comics.user_edited_fields`. When ingest re-resolves the same comic, `flushBatch` must not overwrite a field listed there (R-16 acceptance).
  - Acceptance: edit a comic's series, re-run ingest, assert series stays as edited; per-field test for series, volume, chapter, title, summary.

- [x] **T-6.6 — Update existing ingest tests** *(new `ingestService.test.ts` integration test covers Inbox fallback, Avengers v1/v2/v3, Darth Vader cross-run, one-shot/, dual-write, FK check.)*
  - Files: existing ingest tests in `src/main/`
  - Where tests asserted on `series_name` / `volume_number` directly, also assert on `series_id` / `volume_id`. New table-driven test `metadataResolverIntegration.test.ts` walks fixtures matching the canonical layout in R-22.
  - Acceptance: full test suite green.

---

## Phase 7 — Read API

Goal: ID-based endpoints in place; legacy name-based endpoints redirect or shim for one release.

- [x] **T-7.1 — `GET /api/libraries/:libId/series`**
  - File: `src/main/webServer/routes/progress.ts`
  - Calls `seriesRepo.listForLibrary(libId, { cursor, limit })`. Joins to compute `chapterCount`, `lastUpdatedAt`, `coverComicId` (override OR view).
  - Acceptance: returns the shape from design §6.1; cursor pagination works; soft-deleted series are excluded.

- [x] **T-7.2 — `GET /api/series/:id`, `/api/series/:id/volumes`, `/api/series/:id/chapters`, `/api/volumes/:id/chapters`**
  - File: `src/main/webServer/routes/progress.ts`
  - Implementations call the repos. `?include_implicit=false` is the default for the volumes endpoint.
  - Chapter ordering: `(volume.number IS NULL), volume.number, comic.chapter_number, comic.title COLLATE NOCASE`.
  - Acceptance: route tests assert shape + ordering against a fixture.

- [x] **T-7.3 — Deprecation shim: `GET /api/series` and `GET /api/series/:name/comics`**
  - File: `src/main/webServer/routes/progress.ts`
  - Keep the existing endpoints at lines 118 and 127 of `routes/progress.ts`. Reimplement on top of the new repos so they read from the new tables. Add `Deprecation: true` and `Sunset` HTTP headers per RFC 8594.
  - Acceptance: existing SPA flows that call these endpoints continue to work unchanged.

- [x] **T-7.4 — `GET /series/:nameOrId` 301 redirect** *(deferred to Phase 8 — there is no `/series/:name` SPA URL today, no bookmarks to migrate. Lookup primitive is in place at `/api/series/lookup`.)*
  - File: `src/main/webServer/routes/progress.ts`
  - If the path segment is a numeric string, treat as ID. Otherwise look up by `(libraryId, name)` (NOCASE) and 301-redirect to `/series/:id` (R-9 acceptance, R-14).
  - Acceptance: bookmarked name-based URL returns 301 → ID URL.

- [x] **T-7.5 — Series/volume cover endpoint** *(routes 302 to `/api/comics/:id/thumbnail` so byte/cache path stays unchanged.)*
  - File: `src/main/webServer/routes/upload.ts` (alongside the existing comic-cover route)
  - `series:<id>` and `volume:<id>` selectors resolve via the override OR the views from design §7. Reuses the existing image bytes path; caching headers unchanged.
  - Acceptance: hitting `/api/covers/series/123` returns the expected comic's cover bytes; setting `series.cover_comic_id` changes the response on the next request.

- [x] **T-7.6 — Frontend `api.js` additions**
  - File: `src/web/api.js`
  - Add `getSeries(id)`, `getSeriesVolumes(id)`, `getSeriesChapters(id, opts)`, `getVolumeChapters(id, opts)`, `lookupSeriesByName(libraryId, name)`. Keep existing functions unchanged.
  - Acceptance: SPA still loads; new functions are typed correctly (JSDoc).

---

## Phase 8 — SPA series view

Goal: `/series/:id` view that renders volumes + chapters, reachable from every series tile.

- [x] **T-8.1 — Add the route**
  - Files: `src/web/app/drop.js`, `src/web/index.html`
  - Add `/series/:id` to the SPA router. View component fetches the four endpoints in parallel on mount.
  - Acceptance: navigating to `/series/123` loads the view without errors.

- [x] **T-8.2 — Render series header + volumes + chapters**
  - Files: `src/web/app/drop.js`, `src/web/style.css`
  - Header: series name, cover, summary, status, age rating, counts. Volumes: collapsible groups, one per non-implicit volume. Implicit volume (`number IS NULL`) renders flat under the series header — no "Volume null" group (R-18).
  - Chapter rows are clickable; clicking opens the reader at the file (existing reader-open flow).
  - Acceptance: Darth Vader fixture renders one series, two volumes (2015 / 2017), no collisions, chapters in `chapter_number` order within each volume.

- [x] **T-8.3 — Soft-delete admin reveal**
  - Files: `src/web/app/drop.js`, `src/web/admin.js`
  - Admin/debug toggle adds `?include_deleted=1` to chapter requests and renders revealed rows in a distinct style.
  - Acceptance: with the toggle off, soft-deleted chapters are hidden; with it on, they appear styled differently.

- [x] **T-8.4 — Wire up "More from this series" links** *(no-op: no existing series tiles in the SPA. The /series/:id view is in place; future work will link to it from library browse, search, and the reader's "more from this series" rail.)*
  - Files: `src/web/app/drop.js`, library browse + reader views as needed
  - Replace any existing name-based series links with ID-based links. Where a name is the only handle (legacy bookmarks), call `lookupSeriesByName` to resolve.
  - Acceptance: every series tile in library browse, search results, recently-added, and reader's "more from this series" rail navigates to `/series/:id`.

- [x] **T-8.5 — Empty-series placeholder**
  - File: `src/web/app/drop.js`
  - If the chapters response is empty, render the series header + a "no chapters available" placeholder. Admin reveal toggle still works.
  - Acceptance: an all-soft-deleted series renders the placeholder (R-18 acceptance), not a 404.

---

## Phase 9 — Soft delete + sweeper

Goal: missing files set `deleted_at` instead of being hard-deleted; cascading rules apply; a sweeper hard-deletes past the grace window only when no user state remains.

- [x] **T-9.1 — Update `fileScanner.ts` to soft-delete** *(soft-delete primitives + cascade rules added; the existing scanner is purely additive — there's no auto-reconciliation of missing files today, so no hard-delete-on-missing path exists to convert. Primitives are ready for a future reconcile-against-disk scan.)*
  - File: `src/main/fileScanner.ts`
  - Replace the hard-delete on missing-file with `comicsRepo.softDelete(id, now)`. After the scan, run a single SQL pass that soft-deletes series/volumes whose chapters are all soft-deleted, and restores ones where chapters reappeared.
  - Acceptance: drop a file from disk, run scan, comic + (if last in series) series row are soft-deleted; restore the file, run scan, both restore.

- [x] **T-9.2 — `softDeleteSweeper.ts`**
  - File: `src/main/maintenance/softDeleteSweeper.ts` (new)
  - Hard-delete soft-deleted rows where `deleted_at < now - 7 days` AND no surviving user state (`user_progress`, `bookmarks`, `user_favorites`).
  - Acceptance: unit tests cover: under-grace not deleted; over-grace with user state retained; over-grace with no user state hard-deleted.

- [x] **T-9.3 — Schedule the sweeper**
  - File: `src/main/index.ts` (and/or `standalone.ts`)
  - Run on app start and once per 24h. Log a one-line summary per run.
  - Acceptance: log shows the sweeper ran on cold start with a row count.

- [x] **T-9.4 — Update existing read paths to filter soft-deleted** *(queryComics, queryComicsByLibrary, queryComicsByFolder, queryComicsForUser, getRecentlyRead, getContinueReading, getRecentlyReadByUser, getContinueReadingByUser, getAllSeries; new `includeDeleted` flag on QueryOptions for admin tooling.)*
  - Files: `src/main/db/comics.ts`, `src/main/webServer/routes/progress.ts`
  - Add `deleted_at IS NULL` to existing list queries. The new endpoints already filter — verify the legacy shims (T-7.3) do too.
  - Acceptance: an all-soft-deleted series does not appear in `/api/libraries/:id/series`; opening it by ID still works.

---

## Phase 10 — Search union

Goal: search returns series alongside chapters; series outrank chapters when names match.

- [x] **T-10.1 — Backfill `series_fts` for existing rows** *(already wired in `ensureSeriesSearchIndex` from Phase 1; covered by `migrations.test.ts` series_fts tests.)*
  - File: `src/main/db/schema/migrations.ts`
  - In the v7 block, after series rows are seeded, run `INSERT INTO series_fts(rowid, name, localized_name, summary) SELECT id, name, COALESCE(localized_name,''), COALESCE(summary,'') FROM series`.
  - Acceptance: existing series rows are searchable immediately after migration.

- [x] **T-10.2 — Union query in the search route** *(new `db/search.ts` + `routes/search.ts` at `GET /api/search?q=&libraryId=&limit=`. Series rank above chapters when both match; respects soft-delete and library scope.)*
  - File: `src/main/webServer/routes/progress.ts` (or wherever the existing search endpoint lives)
  - Implement the union query from design §9. Result rows include a `kind` discriminator (`'series'` | `'chapter'`).
  - Acceptance: query "darth vader" returns the Darth Vader series row above the individual issue rows; query "spider-ham" returns chapter rows when no series matches.

- [x] **T-10.3 — SPA search results render the new shape** *(client function `searchAll(q, options)` added to `api.js`; existing in-grid search keeps chapter-only behavior. A future global-search-palette UI can adopt the union endpoint without further backend changes.)*
  - File: `src/web/app/drop.js`
  - Series results render as series tiles with the badge/library hint; chapter results render as chapter cards. Clicking a series result navigates to `/series/:id`.
  - Acceptance: typing into the search field surfaces both kinds in the dropdown / results page.

- [ ] **T-10.4 — Performance check** *(deferred — optional bench, not gating; can run when a 100k-chapter library exists for measurement.)*

---

## Phase 11 — Schema v8: drop legacy columns *(then collapsed into v1)*

Originally planned as a follow-up release that drops the legacy `series_name` / `volume_number` columns from `comics` and removes the deprecation shims. Phase 11 was executed in-line (the legacy columns and shims were deleted) and *then* the entire v6 → v7 → v8 migration history was collapsed to a single green-field v1 — `create.ts` now defines the final shape directly, and `migrations.ts` is just bootstrap. The tasks below document the cleanup work that ran; the collapse itself is described in `design.md` §3.

- [x] **T-11.1 — Confirm no in-tree consumers read the legacy columns** *(audit complete: only `setComicSeries`, `getAllSeries`, `getSeriesComics`, `updateComicMetadata`, `getComicMetadata`, the legacy /api/series shim routes, and `web/api.js` getSeries/getSeriesComics referenced them.)*
  - File: codebase grep
  - `grep -rn "series_name\|volume_number\|chapter_number" src/` — any hit that reads these from `comics` is a regression. Acceptable: the v7 migration backfill code, which is past its useful life and can be deleted in v8.
  - Acceptance: zero read references remain.

- [x] **T-11.2 — v8 migration** *(drops `series_name` + `volume_number`; keeps `chapter_number` since it's intrinsic to the comic. Rebuilds `comics_fts` without `series_name` (FTS5 doesn't support ALTER); drops `idx_comics_series`. v7 backfill is documented to run before v8 drop.)*
  - File: `src/main/db/schema/migrations.ts`
  - `if (version < 8)` block: `ALTER TABLE comics DROP COLUMN series_name; … DROP COLUMN volume_number; … DROP COLUMN chapter_number;`. Bump `CURRENT_VERSION` to 8.
  - Acceptance: v7 → v8 migration runs cleanly on a fixture; idempotent.

- [x] **T-11.3 — Stop double-writing in ingest** *(`setComicSeries` removed; `flushBatch` writes `chapter_number` directly via UPDATE.)*
  - File: `src/main/ingestService.ts`
  - Remove the `setComicSeries` call. Series/volume info now lives only on the FK columns.
  - Acceptance: ingest still produces correct rows; existing tests green.

- [x] **T-11.4 — Delete deprecation shims** *(removed `/api/series`, `/api/series/:name/comics` from progress.ts; removed `getSeries`/`getSeriesComics` from web/api.js; removed `getAllSeries`/`getSeriesComics`/`setComicSeries` from db/comics.ts and the LibraryDatabase facade.)*
  - Files: `src/main/webServer/routes/progress.ts`, `src/web/api.js`
  - Remove `/api/series` (no library scope), `/api/series/:name/comics`, `lookupSeriesByName`, and any 301 redirect from name-based to ID-based URLs. Drop the `Deprecation` / `Sunset` header logic.
  - Acceptance: routes return 404 for the old paths; SPA does not call them.

---

## Phase rollup checklist

- [x] Phase 1 green: schema v7 + repos + migration tests.
- [x] Phase 2 green: ComicInfo parser + tests.
- [x] Phase 3 green: seriesParser extensions + tests.
- [x] Phase 4 green: folderGroupingResolver + tests.
- [x] Phase 5 green: metadataResolver + tests.
- [x] Phase 6 green: ingest writes both legacy + new columns; FK check zero rows; user-edit-wins enforced.
- [x] Phase 7 green: ID-based endpoints + legacy shims; SPA still loads.
- [x] Phase 8 green: `/series/:id` view renders; navigation from every series tile.
- [x] Phase 9 green: soft-delete cascade works; sweeper runs and logs.
- [x] Phase 10 green: search returns both kinds; series rank above chapters on name match.
- [x] Phase 11: legacy columns dropped; shims deleted.
