# Series / Volume Hierarchy — Summary

A user-story summary of the v7 + v8 hierarchy work. Companion to `requirements.md` (the *what*), `design.md` (the *how*), and `tasks.md` (the *when*); read this first if you want the elevator pitch.

The starting point: CB8's library was a flat `comics` table where "series" was a free-form string column. After this work the model is **Library → Series → Volume → Chapter (comic file)** with the schema, ingest pipeline, HTTP API, and SPA all consistent on the new shape.

---

## What ships, by user story

### 1. "I want my comics organised into series, not a wall of files."

**Story.** As a reader with thousands of CBZ files, I want them grouped into series and volumes so I can find related issues without grep'ing the title field.

**What shipped.** New `series` and `volume` tables (R-1, R-2). Every comic carries `series_id` and `volume_id` foreign keys (R-4). The hierarchy is library-scoped — same series name in two libraries is two distinct rows (R-1, deliberate match with Kavita).

**Where in the code.** `src/main/db/schema/{create,migrations}.ts` for the schema (v7 migration block); `src/main/db/series.ts` and `src/main/db/volume.ts` for the repo modules.

---

### 2. "Multi-volume series should auto-merge from `Avengers v1/`, `Avengers v2/` folders."

**Story.** As a comic curator with `Avengers v1/`, `Avengers v2/`, `Avengers v3/` folders side by side, I want CB8 to recognise this as one series with three volumes, not three unrelated series.

**What shipped.** R-20: any folder name matching the strict regex `^(.+?) v(\d+)$` is parsed as `(series, volume)`. Sibling folders with the same NOCASE-normalised stripped name auto-merge. The library currently has 1,069 such folders; they all collapse correctly. Critically, the regex is strict enough that `Avengers vs Pet Avengers` does *not* match.

**Where in the code.** `parseFolderVolumeMarker` in `src/main/seriesParser.ts`; consumed by the precedence chain in `src/main/metadataResolver.ts`.

---

### 3. "Different runs of a same-named series should be distinct volumes."

**Story.** As a Marvel fan with both the 2015 and 2017 Darth Vader series in one folder (each shipping issues 001-025), I want them to coexist as one series with two volumes — *not* one series where issue 001 silently overwrites issue 001.

**What shipped.** R-17 run detection: when chapter numbers collide within a folder-grouped series, ingest splits files into distinct volumes. The volume number defaults to the publication year (so `Darth Vader (2015)` → `volume.number = 2015`, `Darth Vader (2017)` → `volume.number = 2017`). The user can re-order volumes manually if in-universe time runs counter to publication year (which it does for Darth Vader).

**Where in the code.** `applyRunDetection` in `src/main/ingestService.ts` (called inside `flushBatch`).

---

### 4. "ComicInfo.xml should win when it's present."

**Story.** As someone who curates metadata in ComicTagger / Mylar / Komga, I want CB8 to honour the `ComicInfo.xml` embedded at the root of my CBZ files instead of guessing from filenames.

**What shipped.** R-16: `ComicInfo.xml` is read on every ingest (case-insensitive, root-only). When present, fields take precedence over filename heuristics: `<Series>`, `<Volume>`, `<Number>`, `<Title>`, `<Summary>`, `<Publisher>`, `<LanguageISO>`, `<Year>`, `<Month>`, `<PageCount>`, `<AgeRating>`. The `<Pages>` block (with `Type="FrontCover"`) drives default cover selection.

**Where in the code.** `src/main/comicInfoParser.ts` parses with `fast-xml-parser` (lenient: tolerates mixed-case elements, missing namespace, malformed XML — falls back to filename rules instead of throwing).

---

### 5. "My Marvel archive uses `YYYYMM ` filename prefixes — handle them."

**Story.** As an archive collector with files like `198001 Avengers v1 191.cbz`, I want CB8 to recognise the `198001` as January 1980 publication date *and* to strip it before chapter parsing, so the file ingests as "Avengers v1, chapter 191, published Jan 1980" — not "series 198001 Avengers".

**What shipped.** R-21: the `^\d{6} ` filename prefix is recognised as a publication date with a plausibility check (year ∈ [1900, currentYear+5], month ∈ [1, 12]) so non-date numeric prefixes like `199913 Foo.cbz` (month=13) aren't mis-stripped. The prefix feeds `comics.publication_year` / `publication_month` and is removed before downstream parsing.

**Where in the code.** `stripDatePrefix` in `src/main/seriesParser.ts`.

---

### 6. "I want a `one-shot/` folder that doesn't try to group things."

**Story.** As a curator who triages standalone books into a `one-shot/` directory, I want every comic under that directory to ingest as a standalone — even when sibling names share a prefix.

**What shipped.** R-19: a library-root directory whose normalised name is `one-shot` / `oneshot` / `one shot` (case-insensitive) is a reserved standalone container. R-17 folder-grouping is suppressed inside it. The user's `consolidate-marvel-backup.py` ops script puts ~4,480 single-comic folders here.

**Where in the code.** `isUnderOneShot` in `src/main/metadataResolver.ts`; `metadataResolver` short-circuits to standalone before reaching folder grouping.

---

### 7. "I want a series page that shows all chapters grouped by volume."

**Story.** As a reader, I want clicking a series to take me to a page that lists every chapter, grouped by volume (collapsible), with covers and a click-to-read affordance.

**What shipped.** R-18: a new `/series/:id` SPA route. Header carries cover, summary, status, age rating, counts. Numbered volumes render as collapsible `<details>` groups; the implicit volume (R-3) renders flat under the header (no "Volume null" group). Clicking a chapter row opens the reader. Soft-deleted chapters render greyed-out behind an admin reveal toggle. Empty series (everything soft-deleted) renders a placeholder, not a 404.

**Where in the code.** `src/web/views/series.js`; styled in `src/web/style.css` under "Series detail view (R-18)". Backed by the four endpoints in `src/main/webServer/routes/series.ts`.

---

### 8. "A stray one-shot in a series folder shouldn't get sucked in."

**Story.** As a curator with `Darth Vader/Darth Vader 001.cbr`, `Darth Vader/Darth Vader 002.cbr`, and one stray `Darth Vader/Side Story.cbz`, I want the first two grouped under "Darth Vader" and the stray ingested as a standalone — *not* renamed and forced into the series.

**What shipped.** R-17: folder grouping uses a per-file prefix gate. The directory's "recurring base name" is computed once (longest prefix shared by ≥ N/2 files, ≥ 3 chars after a word-boundary trim). A file is only bound to the folder series if its own normalised filename starts with that prefix. Strangers fall out and ingest under their own filename rules.

**Where in the code.** `src/main/folderGroupingResolver.ts` (descending-threshold algorithm with word-boundary-aware trim).

---

### 9. "Standalone books should still work."

**Story.** As a casual reader with loose CBZ files that don't belong to any series, I want them ingested as standalone books — not wrapped in a fake one-issue series.

**What shipped.** R-7: a `comics` row may have `series_id IS NULL` and `volume_id IS NULL`. Standalone books appear in library browse as today; the series view is skipped (clicking opens the reader directly). The user can promote a standalone to a series via the existing edit flow without losing reading progress.

---

### 10. "Don't lose my reading progress when a file goes missing."

**Story.** As a user who's three-quarters through a comic, when the file temporarily disappears (NFS hiccup, external drive unmount), I don't want my progress, bookmarks, or favorite status nuked.

**What shipped.** R-8 soft-delete model. `comics`, `series`, `volume` all carry `deleted_at`. A scheduled sweeper hard-deletes only when (a) past a 7-day grace window AND (b) the comic has no surviving user state (`user_progress`, `bookmarks`, `user_favorites`). Comics with attached state are retained indefinitely. Sweeper runs at app boot and every 24 h.

**Where in the code.** `src/main/maintenance/softDeleteSweeper.ts`; scheduled in `src/main/index.ts` via `startSweeperSchedule`. Soft-delete primitives (`softDeleteByPath`, `restoreByPath`, `cascadeSeriesVolumeDeletion`) live in `db/comics.ts`. Read paths (`queryComics`, `queryComicsByLibrary`, `getRecentlyRead`, `getContinueReading`, …) filter `deleted_at IS NULL` by default.

**Caveat.** CB8 doesn't auto-reconcile against disk yet, so the soft-delete primitives are dormant until a future "rescan and reconcile" feature wires them in. The sweeper still runs and is harmless.

---

### 11. "Search should find both the series and the issues."

**Story.** As a user typing "darth" into the search box, I want the *Darth Vader* series row to appear above the individual issue rows.

**What shipped.** R-11: a new `series_fts` virtual table mirrors `series.name/localized_name/summary`. The `GET /api/search?q=&libraryId=&limit=` endpoint runs a UNION across `series_fts` + `comics_fts` and ranks series above chapters via `ORDER BY (kind = 'series') DESC`. Both kinds respect soft-delete and library scoping.

**Where in the code.** `src/main/db/search.ts` (`unionSearch`); `src/main/webServer/routes/search.ts` for the HTTP route. Client function `searchAll(q, options)` in `src/web/api.js`.

**Caveat.** The existing in-grid library search keeps chapter-only behavior. A "global search palette" UI that adopts the union endpoint is left for a future iteration.

---

### 12. "I want to drop a CBZ from Finder and have it just work."

**Story.** As a casual user, I want to drag a CBZ into the app and have it ingest without me first picking a target library.

**What shipped.** R-6 with Option B: every comic must have a library context (no silent "default library" inserts). Orphan ingests (Finder drag-drop, CLI single-file mode) auto-create and use a library named **Inbox**. The user can move comics from Inbox to a curated library at any time via the existing `addComicsToLibrary` flow.

**Where in the code.** `getOrCreateInbox` + `getLibraryForFolder` in `src/main/db/libraries.ts`; `IngestService.resolveLibraryId` (in `ingestService.ts`) implements the precedence: explicit `libraryId` → derive from `folderId` via `library_folders` → fall back to Inbox.

---

### 13. "Don't overwrite my manual edits on the next scan."

**Story.** As a user who renamed a series in CB8's edit dialog, I don't want a re-ingest pass to silently revert the name to whatever the filename suggests.

**What shipped.** R-16 user-edit guard. `comics.user_edited_fields` (CSV) tracks which fields have been edited via the metadata PATCH endpoint. The plumbing is in place; `isFieldUserEdited(comicId, field)` reads it. Future re-resolve flows must consult this list before clobbering a column.

**Where in the code.** `addUserEditedFields` + `isFieldUserEdited` in `src/main/db/comics.ts`; appended automatically by every successful `updateComicMetadata` call.

**Caveat.** Like soft-delete, this guard is dormant — no current code path re-runs ingest on an existing comic to overwrite its metadata. It's wired and ready.

---

## Schema evolution at a glance

The project is **green-field at v1**. Earlier development carried a v6 → v7 → v8 migration chain (legacy `series_name` column, hierarchy migration, drop-legacy migration); that history was collapsed once the project committed to a green-field deploy. There are no v6 or v7 databases in the wild, and `create.ts` already encodes the post-collapse shape.

| Module | Role |
|---|---|
| `src/main/db/schema/create.ts` | The canonical SQL — `comics`, `series`, `volume`, `library_comics`, `library_folders`, FTS tables, indexes. Exec'd on every open via `db.exec(SCHEMA)` in `open.ts`. |
| `src/main/db/schema/migrations.ts` | The bootstrap. `initializeVersion` pins `app_meta.schema_version=1` on a fresh DB and asserts the FTS5 virtual tables + secondary indexes exist. `migrateSchema` runs on every open and is a no-op for now. |

The interesting structural facts that used to live in v7's migration block are now part of `create.ts`:

- `comics` carries `series_id` / `volume_id` FK columns plus `deleted_at`, `publication_year`, `publication_month`, `comicinfo_json`, `user_edited_fields`. The intrinsic `chapter_number` column is on the comic itself (it's the chapter ordering key inside a volume).
- `series` and `volume` tables with partial unique indexes: `(library_id, name COLLATE NOCASE) WHERE deleted_at IS NULL` for series uniqueness; `(series_id, number) WHERE number IS NOT NULL AND deleted_at IS NULL` for numbered volumes; `(series_id) WHERE number IS NULL AND deleted_at IS NULL` for the per-series implicit volume (R-3).
- `series_fts` and `comics_fts` virtual tables with insert/update/delete triggers, both maintained by `ensureSeriesSearchIndex` / `ensureSearchIndex`.

---

## What's deferred (and why)

These were explicitly out-of-scope from R-1's "Out of scope" list, or were caveats noted alongside individual stories:

- **Library-browse "Series" tab.** No UI for browsing the series catalogue today; navigate via search or direct URL. R-18 only delivered the detail view.
- **Reader's "more from this series" rail.** The data is there (`comic.seriesId`); the reader UI doesn't yet surface it.
- **Per-library age-gating enforcement.** `series.age_rating` is stored and parsed from ComicInfo, but no enforcement gate exists (gap #5).
- **OPDS feeds.** Will consume this hierarchy but ship separately (gap #1).
- **Per-series metadata refresh / scraping.** The ComicInfo path is one-shot at ingest. No background re-fetch from external sources.
- **File-disappearance auto-reconciliation.** Soft-delete primitives + sweeper are in place, but the scanner never marks a missing file deleted. A future "rescan and reconcile" feature wires the two together.
- **Reading lists / smart filters / series relationships.** Mentioned in R-1 background as motivations; not delivered here. Schema is shaped to allow them (`series.id` is stable across renames per R-5).
- **Optional `T-10.4` perf bench.** Microbenchmark of the union search at 100k chapters; not gating, deferred until a fixture of that size exists.

---

## Surface map for new contributors

If you're touching this code for the first time, the high-leverage entry points are:

- **Read the precedence chain** — `src/main/metadataResolver.ts`. Every "where does this metadata come from?" question lands here. Steps are explicit and ordered, each numbered with the requirement it implements.
- **Read the ingest sequence** — `IngestService.flushBatch` in `src/main/ingestService.ts`. Synchronous, single-transaction, comments numbered 1-7.
- **Read one repo module** — `src/main/db/series.ts` is the smallest. Same pattern in `db/volume.ts` and the existing `db/folders.ts`. Plain functions, first param is the `Database`.
- **Look at the migrations** — `src/main/db/schema/migrations.ts`. Linear `if (version < N)` blocks; each block is independently green and tested.
- **Check the tests** — 257 of them. The integration test in `ingestService.test.ts` is the closest thing to a "how does this thing actually behave" reference.

The three planning docs in this directory (`requirements.md`, `design.md`, `tasks.md`) are the long-form versions of this summary; reach for them when you need acceptance criteria, schema details, or sequencing rationale.
