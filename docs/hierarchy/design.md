# Series / Volume Hierarchy — Design

This document is the implementation half of `docs/hierarchy/requirements.md`. It pins down the SQL schema, the modules that change, the ingest pipeline order, the migration, and the rollback plan. Requirement IDs (R-1 … R-22) reference the requirements doc.

## 1. Architecture overview

CB8 is a single-process Electron app with an embedded HTTP server (`src/main/webServer.ts`) serving a vanilla-JS SPA (`src/web/`) and a small admin UI. Persistence is one SQLite database per library, opened via `better-sqlite3` and managed in `src/main/libraryDatabase.ts`. Schema lives in `src/main/db/schema/create.ts`; migrations in `src/main/db/schema/migrations.ts` (currently at version 6).

This work introduces:

- Two new tables (`series`, `volume`) and several new columns on `comics`.
- A reshaped ingest pipeline that resolves metadata from a fixed precedence chain (one-shot guard → ComicInfo → folder vN → folder grouping → date prefix → filename heuristics).
- ID-based read paths on the HTTP API and SPA, with the legacy name-based paths kept as 301 redirects for one release.
- A series detail view in the SPA.

```
ingest (file path)
  └─► resolveMetadata(filePath, db)         ← new module
        ├─ R-19: one-shot ancestor guard      → standalone if matched
        ├─ R-16: ComicInfo.xml parse          → authoritative fields
        ├─ R-20: folder name vN parse         → series + volume
        ├─ R-17: folder grouping cache        → series-name canonicalisation
        ├─ R-21: YYYYMM filename strip        → publication date capture
        └─ R-6:  parseSeriesFromFilename      → fallback
  └─► seriesUpsert / volumeUpsert / chapterUpsert
        ─► comics + series + volume rows in one transaction

read (HTTP)
  /api/libraries/:id/series   → seriesRepo.list
  /api/series/:id             → seriesRepo.get
  /api/series/:id/volumes     → volumeRepo.listForSeries
  /api/series/:id/chapters    → comicsRepo.listForSeries
  /api/volumes/:id/chapters   → comicsRepo.listForVolume

frontend
  /series/:id  ←  R-18 series view, calls the four endpoints above
  /series/:name (legacy) → 301 → /series/:id (R-14)
```

## 2. Schema changes

All changes ship as one migration (`schema_version` 6 → 7). Additive only — nothing is dropped or renamed. Legacy columns on `comics` (`series_name`, `volume_number`, `chapter_number`) are retained for one release window per R-14.

### 2.1 New tables

```sql
CREATE TABLE series (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id      INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  sort_name       TEXT NOT NULL,
  localized_name  TEXT,
  summary         TEXT,
  status          TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (status IN ('unknown','ongoing','completed','hiatus','cancelled')),
  age_rating      TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (age_rating IN ('unknown','g','pg','teen','mature','adults_only')),
  cover_comic_id  INTEGER REFERENCES comics(id) ON DELETE SET NULL,
  metadata_json   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE UNIQUE INDEX idx_series_library_name
  ON series(library_id, name COLLATE NOCASE)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_series_sort ON series(library_id, sort_name COLLATE NOCASE);

CREATE TABLE volume (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id      INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  number         REAL,                       -- NULL = implicit volume (R-3)
  name           TEXT,                       -- e.g. "2015 run", "v1"
  cover_comic_id INTEGER REFERENCES comics(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at     TEXT
);

CREATE UNIQUE INDEX idx_volume_series_number
  ON volume(series_id, number)
  WHERE number IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_volume_series_implicit
  ON volume(series_id)
  WHERE number IS NULL AND deleted_at IS NULL;
```

The two partial unique indexes on `volume` together encode "at most one implicit volume per series, plus a unique numbered volume per `(series_id, number)`" without needing triggers.

### 2.2 Columns added to `comics`

```sql
ALTER TABLE comics ADD COLUMN series_id          INTEGER REFERENCES series(id) ON DELETE SET NULL;
ALTER TABLE comics ADD COLUMN volume_id          INTEGER REFERENCES volume(id) ON DELETE SET NULL;
ALTER TABLE comics ADD COLUMN deleted_at         TEXT;
ALTER TABLE comics ADD COLUMN publication_year   INTEGER;   -- R-21
ALTER TABLE comics ADD COLUMN publication_month  INTEGER;   -- R-21
ALTER TABLE comics ADD COLUMN comicinfo_json     TEXT;      -- raw ComicInfo for fields we don't promote
ALTER TABLE comics ADD COLUMN user_edited_fields TEXT;      -- CSV of field names (R-16: edits beat ingest)

CREATE INDEX idx_comics_series ON comics(series_id) WHERE series_id IS NOT NULL;
CREATE INDEX idx_comics_volume ON comics(volume_id) WHERE volume_id IS NOT NULL;
CREATE INDEX idx_comics_deleted ON comics(deleted_at) WHERE deleted_at IS NOT NULL;
```

`series_id` is denormalised — it must always equal `volume.series_id` for the same row. R-4 enforces this via a post-write check in tests; we don't add a runtime trigger to avoid the write-amplification cost.

### 2.3 FTS5 source for series search (R-11)

```sql
CREATE VIRTUAL TABLE series_fts USING fts5(
  name, localized_name, summary,
  content='series', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

-- triggers to keep series_fts in sync
CREATE TRIGGER series_ai AFTER INSERT ON series BEGIN
  INSERT INTO series_fts(rowid, name, localized_name, summary)
  VALUES (new.id, new.name, COALESCE(new.localized_name,''), COALESCE(new.summary,''));
END;
CREATE TRIGGER series_au AFTER UPDATE ON series BEGIN
  INSERT INTO series_fts(series_fts, rowid, name, localized_name, summary)
  VALUES('delete', old.id, old.name, COALESCE(old.localized_name,''), COALESCE(old.summary,''));
  INSERT INTO series_fts(rowid, name, localized_name, summary)
  VALUES (new.id, new.name, COALESCE(new.localized_name,''), COALESCE(new.summary,''));
END;
CREATE TRIGGER series_ad AFTER DELETE ON series BEGIN
  INSERT INTO series_fts(series_fts, rowid, name, localized_name, summary)
  VALUES('delete', old.id, old.name, COALESCE(old.localized_name,''), COALESCE(old.summary,''));
END;
```

## 3. Migration

The project is **green-field at schema v1**. The full schema lives in `src/main/db/schema/create.ts` and is exec'd on every open via `db.exec(SCHEMA)` in `open.ts`. There is no upgrade chain to walk — every fresh DB starts at v1.

`src/main/db/schema/migrations.ts` keeps two responsibilities:

- `initializeVersion(db)` — called once on a fresh DB right after `db.exec(SCHEMA)`. Pins `app_meta.schema_version=1` and ensures `comics_fts` + `series_fts` virtual tables and secondary indexes exist (idempotent helpers `ensureSearchIndex`, `ensureSeriesSearchIndex`, `ensurePostMigrationIndexes`).
- `migrateSchema(db)` — called on every open. With v1 as the only version, the body is a defensive "make sure FTS + indexes exist" pass for any DB that lost them out of band. R-13 / R-15 (backfill, reversibility) are not relevant in the green-field configuration.

If a future change needs an actual upgrade chain, the version-detect + setVersion plumbing is still in place — bump `CURRENT_VERSION` and add an `if (version < N)` block. The earlier development branch carried v6 → v7 → v8 (legacy `series_name`, hierarchy migration, drop-legacy migration); that history was deleted once the project committed to a green-field deploy and is not part of any shipped binary.

## 4. Code changes

### 4.1 New modules

| File | Responsibility |
|---|---|
| `src/main/comicInfoParser.ts` | Read `ComicInfo.xml` from a CBZ/CBR. Parse with a lenient XML parser (e.g. `fast-xml-parser`); accept case-insensitive element names; return a typed `ComicInfo` object with `null` for missing fields. R-16. |
| `src/main/metadataResolver.ts` | The precedence chain. Takes `(filePath, archiveHandle?, db)`, returns `ResolvedMetadata { seriesName, volumeNumber, volumeLabel, chapterNumber, title, publicationYear, publicationMonth, ageRating, summary, isStandalone, ... }`. Encodes the order from R-6: one-shot guard → ComicInfo → folder vN → folder grouping → date prefix → filename heuristics. |
| `src/main/folderGroupingResolver.ts` | For a given parent directory, compute the recurring base name and per-file prefix gate (R-17). Caches per directory across the run so a 50-file folder isn't re-scanned 50 times. |
| `src/main/db/series.ts` | `seriesRepo`: `getOrCreate`, `get`, `listForLibrary`, `update`, `softDelete`, `restore`. NOCASE-unique upsert keyed on `(library_id, normalized_name)` (R-1, R-5). |
| `src/main/db/volume.ts` | `volumeRepo`: `getOrCreate`, `get`, `listForSeries`, `update`, `softDelete`, `restore`, `getOrCreateImplicit`. Two upsert paths because the implicit-volume uniqueness is a partial index, not a single composite key (R-2, R-3). |
| `src/main/maintenance/softDeleteSweeper.ts` | Scheduled job (R-8). Hard-deletes soft-deleted rows past the grace window with no remaining user state. Hook into the existing periodic-task runner if one lands (gap #11); for now, run at app start and once per 24h. |

### 4.2 Updated modules

| File | Change |
|---|---|
| `src/main/seriesParser.ts` | Add `parseFolderVolumeMarker(folderName)` returning `{seriesName, volumeNumber} | null` for the `^(.+?) v(\d+)$` regex (R-20). Add `stripDatePrefix(filename)` returning `{stripped, year?, month?}` (R-21) with the plausibility check (year ∈ [1900, currentYear+5], month ∈ [1,12]). Existing `parseSeriesFromFilename` becomes the last-resort fallback. |
| `src/main/ingestService.ts` | Replace the inline `parseSeriesFromFilename` call in `prepareInsert` (line 108) with `await metadataResolver.resolve(filePath, handle, db)`. The `flushBatch` transaction now also calls `seriesRepo.getOrCreate` and `volumeRepo.getOrCreate` and writes `series_id` / `volume_id` alongside the existing `setComicSeries` (which keeps populating `series_name` etc. for legacy compatibility per R-14). |
| `src/main/db/comics.ts` | `getAllSeries` is reimplemented to read from `series` (R-9). Old shape (`{name, count, coverComicId}`) is preserved as a thin view. `getSeriesComics(name)` becomes a deprecation shim — looks up the series by NOCASE name, then delegates to the new `listForSeries(seriesId)`. New: `listForSeries(seriesId, opts)`, `listForVolume(volumeId)`. |
| `src/main/webServer/routes/progress.ts` | Add the five endpoints listed in R-12. Keep `/api/series` (no library scope) as a deprecated alias of `/api/libraries/:id/series` for one release. |
| `src/main/webServer/routes/upload.ts` | Pass library context through to ingest (R-6: ingest without a library is an error). |
| `src/web/api.js` | Add `getSeries(id)`, `getSeriesVolumes(id)`, `getSeriesChapters(id)`, `getVolumeChapters(id)`. Keep `getSeriesComics(name)` as a 1-release deprecation shim that resolves the name to an ID via a new `/api/series/lookup?name=...` endpoint. |
| `src/web/app/drop.js`, `src/web/index.html` | Add the series detail view per R-18. Route is `/series/:id`. Renders volumes + chapters; clicking a chapter opens the reader. |

### 4.3 Removed inline behaviour

The current `parseSeriesFromFilename` call sequence in `ingestService.ts:108` is the *only* input to `series_name` / `volume_number` / `chapter_number`. After this change, that call becomes one of six steps in `metadataResolver`. We do not remove it — `metadataResolver` calls into it as the fallback.

### 4.4 Sort-key algorithm

`computeSortName(name)` is added to `seriesParser.ts` (re-used by both ingest and the migration). Behaviour:

- Lowercase via `toLocaleLowerCase('en-US')`.
- Trim, collapse whitespace.
- If a config flag `series_sort_strip_articles` is true (default false), move leading `the `, `a `, `an ` to a `, the` etc. suffix.
- Pad runs of digits to 10 places (`Avengers v3` → `avengers v0000000003`) so natural-numeric sort matches via plain `COLLATE NOCASE`.

Padding the digits in `sort_name` lets the existing single-column `COLLATE NOCASE` index do natural sort without a custom collation function — important because better-sqlite3 collations are bound per-connection and can complicate pooled access.

## 5. Ingest pipeline (R-6, R-16, R-17, R-19, R-20, R-21)

`metadataResolver.resolve(filePath, archiveHandle, db)` runs these steps in order. Each step writes into a `partial: ResolvedMetadata` object; later steps fill only fields that are still `null`/`undefined`.

```ts
async function resolve(filePath, archive, db): Promise<ResolvedMetadata> {
  const dir = path.dirname(filePath);
  const folderName = path.basename(dir);
  const fileName = path.basename(filePath);
  const partial: ResolvedMetadata = {};

  // R-19: one-shot ancestor guard. Walk up to library root; if any ancestor
  // matches /^one[\s-]?shot$/i, mark standalone and skip series resolution.
  if (isUnderOneShot(filePath, db)) {
    partial.isStandalone = true;
    // ComicInfo can still pull it back into a series — fall through.
  }

  // R-16: ComicInfo.xml inside the archive. Authoritative when present.
  const ci = await comicInfoParser.read(archive); // null if absent or unreadable
  if (ci) {
    if (ci.series)        partial.seriesName        = ci.series;
    if (ci.volume != null) partial.volumeNumber     = ci.volume;
    if (ci.number != null) partial.chapterNumber    = ci.number;
    if (ci.title)         partial.title             = ci.title;
    if (ci.summary)       partial.summary           = ci.summary;
    if (ci.year != null)  partial.publicationYear   = ci.year;
    if (ci.month != null) partial.publicationMonth  = ci.month;
    if (ci.ageRating)     partial.ageRating         = mapAgeRating(ci.ageRating);
    partial.comicinfoJson = JSON.stringify(ci.raw);
  }

  // R-19 short-circuit (after ComicInfo, so ComicInfo can override).
  if (partial.isStandalone && !partial.seriesName) {
    return { ...partial, isStandalone: true };
  }

  // R-20: folder name ends in " vN".
  const fv = parseFolderVolumeMarker(folderName);
  if (fv) {
    partial.seriesName ??= fv.seriesName;
    partial.volumeNumber ??= fv.volumeNumber;
    partial.volumeLabel ??= `v${fv.volumeNumber}`;
  }

  // R-17: folder grouping (recurring base name, per-file prefix gate).
  // Cached per `dir` for the lifetime of one ingest run.
  const fg = await folderGroupingResolver.resolve(dir);
  if (fg && fg.matches(fileName)) {
    partial.seriesName ??= normalizeSeriesName(folderName);
  }

  // R-21: strip YYYYMM filename prefix and capture publication date.
  const dp = stripDatePrefix(fileName);
  partial.publicationYear  ??= dp.year ?? null;
  partial.publicationMonth ??= dp.month ?? null;

  // Final fallback: filename heuristics on the post-strip name.
  const f = parseSeriesFromFilename(dp.stripped);
  partial.seriesName    ??= f.seriesName;
  partial.volumeNumber  ??= f.volumeNumber;
  partial.chapterNumber ??= f.chapterNumber;

  // R-7: standalone if still no series.
  partial.isStandalone = !partial.seriesName;
  return partial;
}
```

Run-detection (R-17 chapter-collision) is performed *after* the per-file resolve, in `flushBatch` — once all files in a directory have been resolved, `volumeRepo.getOrCreate` sees the colliding chapter numbers and creates one volume row per detected run, keyed on `volumeLabel` (year tag fallback).

## 6. Read paths (R-9, R-12, R-18)

### 6.1 HTTP

```
GET /api/libraries/:libId/series?cursor=&limit=
  → { items: [{ id, name, sortName, ageRating, status, coverComicId, chapterCount, lastUpdatedAt }], nextCursor }

GET /api/series/:id
  → { id, libraryId, name, sortName, summary, status, ageRating, coverComicId, volumeCount, chapterCount, lastUpdatedAt }

GET /api/series/:id/volumes?include_implicit=false
  → [{ id, number, name, coverComicId, chapterCount }]

GET /api/series/:id/chapters?cursor=&limit=
  → { items: [{ id, title, volumeId, volumeNumber, chapterNumber, ... }], nextCursor }
  ORDER BY volume.number NULLS LAST, comic.chapter_number, comic.title COLLATE NOCASE

GET /api/volumes/:id/chapters?cursor=&limit=
  → same shape, scoped to one volume

GET /api/series/lookup?name=&libraryId=    [deprecated, 1-release shim]
  → { id }   or 404

GET /api/series/:nameOrId/cover            [legacy alias resolves either]
GET /api/volumes/:id/cover

GET /series/:name   [legacy SPA route]
  → 301 /series/:id    (resolved via the lookup endpoint)
```

### 6.2 SPA (R-18)

The series detail view is a new view in the existing routing scheme (`src/web/app/drop.js`). It calls `/api/series/:id`, `/api/series/:id/volumes`, and `/api/series/:id/chapters` in parallel on mount. Volumes are rendered as collapsible groups; the implicit volume (`number IS NULL`) is rendered as a flat list directly under the series header (R-18: no "Volume null" group). Soft-deleted chapters are filtered server-side and revealed by an admin-only `?include_deleted=1` query param.

## 7. Cover resolution (R-10)

Implemented as SQL views and a route in `src/main/webServer/routes/upload.ts` (alongside the existing comic-cover route):

```sql
-- default series cover: lowest volume.number NULLS LAST, then lowest comic.chapter_number, ties by id
CREATE VIEW series_default_cover AS
SELECT s.id AS series_id,
       (SELECT c.id FROM comics c
         JOIN volume v ON v.id = c.volume_id
         WHERE v.series_id = s.id AND c.deleted_at IS NULL
         ORDER BY (v.number IS NULL), v.number, c.chapter_number, c.id
         LIMIT 1) AS cover_comic_id
FROM series s;

CREATE VIEW volume_default_cover AS
SELECT v.id AS volume_id,
       (SELECT c.id FROM comics c
         WHERE c.volume_id = v.id AND c.deleted_at IS NULL
         ORDER BY c.chapter_number, c.id LIMIT 1) AS cover_comic_id
FROM volume v;
```

The cover endpoint resolves `series:<id>` / `volume:<id>` selectors as follows: prefer the explicit `cover_comic_id` override on the series/volume row; fall back to the view. The route reuses the existing comic-cover bytes path so cache headers and response shape are identical to today.

## 8. Soft-delete and grace window (R-8)

- File scanner (`src/main/fileScanner.ts`) is updated: a missing file triggers `comicsRepo.softDelete(id, now)` instead of a `DELETE FROM comics`. Cascading soft-delete to series/volume happens in a single SQL pass at the end of the scan: a series row is soft-deleted iff every chapter in every volume of that series has `deleted_at IS NOT NULL`; same for volumes.
- The maintenance sweeper (`softDeleteSweeper.ts`, §4.1) hard-deletes a soft-deleted row only if `deleted_at < now - 7 days` and the row has no surviving user state (`user_progress`, `bookmarks`, `user_favorites`, future reading-list memberships). Otherwise the row is retained indefinitely.
- The grace window is currently a hard-coded 7 days; promotion to a config knob is deferred to gap #11 (job runner) per R-8 risk note.

## 9. Search (R-11)

The existing FTS5 setup over `comics` already exists. We add `series_fts` (§2.3) and a union query in the search route:

```sql
WITH s AS (
  SELECT id, 'series' AS kind, name AS title, library_id, NULL AS series_id
  FROM series_fts
  JOIN series ON series.id = series_fts.rowid
  WHERE series_fts MATCH ? AND series.deleted_at IS NULL
),
c AS (
  SELECT id, 'chapter' AS kind, title, NULL AS library_id, series_id
  FROM comics
  WHERE id IN (SELECT rowid FROM comics_fts WHERE comics_fts MATCH ?)
    AND deleted_at IS NULL
)
SELECT * FROM s
UNION ALL
SELECT * FROM c
ORDER BY (kind = 'series') DESC, title COLLATE NOCASE
LIMIT ?;
```

The `(kind = 'series') DESC` ranks series above chapters when both match (R-11 acceptance). The 100k-chapter performance budget is preserved because the union pre-filters via FTS before joining.

## 10. Test plan (NFR-H3)

New tests in addition to the existing suites:

- `seriesParser.test.ts` (existing file; extend) — `parseFolderVolumeMarker`, `stripDatePrefix`, edge cases including `Avengers vs Pet Avengers`, `199913 Foo.cbz` (invalid month), `vN` alone.
- `comicInfoParser.test.ts` — minimal valid XML, missing root namespace, mixed-case element names, malformed XML, the Gwenpool sample.
- `folderGroupingResolver.test.ts` — single-file folder, multi-file with recurring prefix, multi-file with one stranger (Darth Vader + a stray crossover), prefix length below threshold.
- `metadataResolver.test.ts` — drives the precedence chain. Asserts ComicInfo > folder vN > folder grouping > date prefix > filename for each conflicting field.
- `migrations.test.ts` — schema bootstrap: open a fresh DB via `db.exec(SCHEMA); initializeVersion(db);`, assert `app_meta.schema_version='1'`, `PRAGMA foreign_key_check` returns zero rows, the v7 hierarchy tables (series, volume) exist, the legacy columns are gone, and the partial unique indexes on `volume` block both implicit-volume duplicates and numbered-volume duplicates. Plus FTS-trigger sync tests for `comics_fts` and `series_fts`.
- `softDelete.test.ts` — file disappear → soft-delete cascade; file reappear → restore cascade; sweeper hard-delete only past grace window and only with no user state.

## 11. Rollback / reversibility

Not applicable in the green-field configuration. The schema is v1 and there is no upgrade chain to roll back through. Local recovery from a corrupt DB is handled by `openOrRecreate` in `src/main/db/schema/open.ts`, which deletes the file and recreates it from `SCHEMA` if the initial open fails. Per-user data loss in that path is acceptable for a green-field deploy; if the project grows real users, this section should be revisited along with a backup story.

## 12. Legacy columns

Not applicable. Earlier development carried `series_name`, `volume_number`, and `chapter_number` (the last is *kept*, since chapter number is intrinsic to a comic). The first two are not part of the v1 schema. There is nothing to deprecate or remove; new ingest writes only the FK columns + `chapter_number`.

## 13. Sequencing

The work splits into the order below. Each phase is independently green (tests pass, app boots, existing flows work). Phases 1 and 11 from the original plan have been folded into v1 — there is no separate migration shipping nor a separate "drop legacy" follow-up.

1. **Schema + repos** (v1). Tables, columns, indexes, FTS triggers in `create.ts`. `series.ts` and `volume.ts` repo modules.
2. **`comicInfoParser.ts` + tests.** Pure-function module, no integration.
3. **`seriesParser.ts` extensions.** `parseFolderVolumeMarker`, `stripDatePrefix`, `computeSortName`. Pure-function changes.
4. **`folderGroupingResolver.ts` + tests.** Per-directory scanner with caching.
5. **`metadataResolver.ts` + tests.** Wires 2/3/4 together with the precedence chain.
6. **Ingest integration.** Swap `prepareInsert` to call `metadataResolver`. Write series/volume FKs + `chapter_number` directly.
7. **Read API.** New endpoints in `routes/series.ts`.
8. **SPA series view.** Route, view, links from library browse + search.
9. **Soft delete + sweeper.** Scanner primitives, sweeper job.
10. **Search union.** `series_fts` source + union query.
