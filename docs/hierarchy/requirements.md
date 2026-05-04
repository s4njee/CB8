# Series / Volume Hierarchy — Requirements

This document specifies the requirements for promoting CB8's library model from a **flat `comics` table** to a **Library → Series → Volume → Chapter** graph. It is the requirements half of the work outlined as gap #2 in `FINDINGS.md`. Design (schema, code, migration plan) lives in `docs/hierarchy/design.md`; sequenced work lives in `docs/hierarchy/tasks.md`.

## Background

Today, a series in CB8 is a string. Queries like `getAllSeries()` (`src/main/db/comics.ts:327`) do `GROUP BY series_name COLLATE NOCASE`, and `getSeriesComics()` (`src/main/db/comics.ts:341`) joins on the same string. Volumes are inferred from the `volume_number` REAL column on `comics`. There is no series row to attach a summary, status, age rating, or override cover to; there is no volume row to give a volume its own name or cover. Chapter ordering across mixed-numbered files (1, 1.5, 2, "Special") is fragile because the only sort keys are the nullable numbers on each comic.

Adding real `series` and `volume` tables is a prerequisite for OPDS catalogs, per-series metadata refresh, ACLs and age gating done at series granularity, reading lists, smart filters that filter on series-level fields, and series relationships.

## Scope

In scope:

- New first-class `series` and `volume` tables in SQLite.
- New foreign-key columns on `comics` linking each comic (a chapter, in domain terms) to exactly one volume.
- Backfill from existing `series_name` / `volume_number` / `chapter_number` data.
- Updated ingest pipeline so new and rescanned files resolve into series and volume rows.
- `ComicInfo.xml` parsing on ingest, with embedded metadata taking precedence over filename heuristics (R-16).
- Folder-as-series grouping at ingest (R-17): comics sharing a leaf directory with a recurring base name are bound to one series, even when filenames would otherwise fragment them across multiple series.
- Reserved `one-shot/` directory at the library root for standalone books (R-19).
- Folder-name `vN` suffix as the canonical multi-volume signal (R-20); sibling `<Series> vN/` folders form one series with one volume per folder.
- Filename `YYYYMM ` date prefix recognised as publication metadata and stripped before chapter-number / series parsing (R-21).
- Updated read paths (queries, REST routes, UI) so series and volumes are addressed by ID, not by string match.
- Soft-delete on series and volumes so user state (progress, bookmarks, favorites) survives temporary file disappearance.
- A reversible-by-restore migration with no data loss.

Out of scope (handled in their own docs):

- OPDS feeds (gap #1). They will consume this hierarchy but ship separately.
- Per-library ACLs and age gating (gap #5). Series will carry an `age_rating` column so #5 can wire enforcement, but enforcement itself is not delivered here.
- Series relationships (gap #15). The `series` table will be ID-stable so relationships can be added later without another migration.
- A new admin UI for editing series / volume metadata. Read paths and existing edit fields are scoped here; a richer editor is a follow-up.

## Non-goals (this iteration)

- Multi-library series. A series belongs to exactly one library. The same name under two libraries is two distinct series rows. (Matches Kavita.)
- Multi-version chapters (different scanlations of the same chapter as alternates). One file = one chapter row, as today.
- Reordering chapters by anything other than `(volume.number, chapter.number, sort_key)`. No manual chapter ordering at this stage; that arrives with reading lists (gap #9).

## Glossary

- **Library** — top-level container, already exists (`libraries` table). Comics are linked via `library_comics`.
- **Series** — a logical work (e.g. "One Piece"). New table in this work. Belongs to exactly one library.
- **Volume** — a publishing unit within a series. New table. Belongs to exactly one series. Series with no volume distinction get a single implicit volume (see R-3).
- **Chapter** — a single readable file. Already exists as a `comics` row; gains a `volume_id` foreign key in this work. The word "chapter" is used in this doc; the table stays named `comics` for backward compatibility.
- **Standalone book** — a comic that does not belong to a series (one-shot, art book). Stays as a series-less comic row; see R-7.

---

## Functional requirements

### R-1: Series table

A new `series` table exists with referential integrity to libraries.

**Acceptance criteria**

- A series row has at minimum: `id`, `library_id`, `name`, `sort_name` (natural-sort key), `created_at`, `updated_at`, `deleted_at`.
- A series row has space for: `localized_name`, `summary`, `status` (one of `unknown`, `ongoing`, `completed`, `hiatus`, `cancelled`), `age_rating` (one of `unknown`, `g`, `pg`, `teen`, `mature`, `adults_only`), `cover_comic_id` (override), `metadata_json`.
- `(library_id, name)` is unique under `COLLATE NOCASE`. The same name in two libraries produces two rows.
- Deleting a library cascades to its series.
- A query "list series in library X" runs in under 50 ms p95 at 10,000 series per library on commodity SSD.

### R-2: Volume table

A new `volume` table exists with referential integrity to series.

**Acceptance criteria**

- A volume row has at minimum: `id`, `series_id`, `number` (REAL, supports 1.5 etc., nullable for the implicit volume), `name` (nullable), `cover_comic_id` (nullable override), `created_at`, `updated_at`, `deleted_at`.
- `(series_id, number)` is unique when `number` is non-null.
- A series may have at most one volume with `number IS NULL` — the implicit volume (see R-3).
- Deleting a series cascades to its volumes.

### R-3: Implicit "no volume" handling

Many series (especially long-running manga) have no volume axis, only chapters. The model must handle this without forcing fake volume rows on the user.

**Acceptance criteria**

- When a series has chapters with no parsed `volume_number`, those chapters live under a single per-series **implicit volume** with `number IS NULL` and no name.
- The implicit volume is auto-created on demand and never visible as a separate node in the UI; chapters under it appear directly under the series.
- A series may simultaneously have numbered volumes and an implicit volume (e.g. a series where v01 contains ch1–10 but ch10.5 is an unnumbered side-chapter).
- Adding the first numbered-volume chapter to an implicit-only series does not move existing chapters; they stay under the implicit volume unless the user explicitly re-organises (out of scope here).

### R-4: Chapter (comic) belongs to a volume

Every `comics` row that is part of a series links to exactly one volume.

**Acceptance criteria**

- `comics.volume_id` foreign key references `volume(id)`. Nullable only for standalone books (R-7).
- `comics.series_id` denormalised foreign key for query convenience; must always equal `volume.series_id` for the same row. A trigger or post-write check enforces this in tests.
- Existing columns `series_name`, `volume_number`, `chapter_number` are retained as legacy fallback during the transition (see R-13) and removed in a later migration once all consumers are switched.
- Deleting a volume cascades to its chapters in the database, but the soft-delete rule (R-8) applies before any hard delete from a normal scan.

### R-5: Stable IDs

Series and volume IDs survive renames, merges, and library moves wherever a stable identity can be reasonably established.

**Acceptance criteria**

- A series row keeps its `id` when the user renames it through the existing edit flow (`updateComicMeta` is the analogue today).
- A series row keeps its `id` when files for the series are moved within the same library root, as long as ingest can match them to the existing series by normalised name.
- Merging two series (an admin action — out of scope to build here, but the schema must allow it) is implementable as `UPDATE volume SET series_id = ? WHERE series_id = ?` followed by `DELETE FROM series WHERE id = ?` without breaking foreign keys.
- Re-ingesting the same file twice never creates a second series row for the same `(library_id, normalized_name)` pair.

### R-6: Ingest produces series and volume rows

The existing ingest pipeline (`src/main/ingestService.ts`, `src/main/seriesParser.ts`) populates the new tables.

**Acceptance criteria**

- On ingest of a chapter file, the pipeline resolves metadata in this order: (1) check for the reserved `one-shot/` ancestor and short-circuit to standalone if present (R-19); (2) read `ComicInfo.xml` from the archive (R-16); (3) parse the parent folder name for a `vN` suffix (R-20) and the canonical series name; (4) apply folder-grouping for sibling comics with a recurring base name (R-17); (5) strip a `YYYYMM ` filename date prefix (R-21) before the remaining filename heuristics; (6) fall back to `parseSeriesFromFilename()` for any field still unset. The merged result drives an upsert: get-or-create series by `(library_id, normalized_name)`, get-or-create volume by `(series_id, volume_number)` or the implicit volume if `volume_number IS NULL`.
- A library context is required at ingest time. Files ingested without a target library are an error, not a silent insert into a default library.
- A bulk ingest of 10,000 chapters across 200 series completes within 2× the time of the current flat ingest. The hierarchy is not allowed to make ingest user-noticeably slower.
- Per-file ingest errors do not abort the overall scan (existing behaviour is preserved).
- `series.sort_name` is computed at write time using the same natural-sort key already used elsewhere; "The X" sorts as "X, The" optionally controlled by a config flag (default off, for parity with current behaviour).

### R-7: Standalone books

A comic that does not match any series pattern stays addressable without forcing it into a series.

**Acceptance criteria**

- A `comics` row may have `series_id IS NULL` and `volume_id IS NULL`. This is the "standalone" state.
- Standalone books appear in the library browse view as today; they do not need to be wrapped in a synthetic single-chapter series.
- A standalone book can be promoted to a series (and back) via the existing edit flow without losing reading progress, bookmarks, favorites, or tags.

### R-8: Soft-delete and grace window

A file disappearing from disk must not destroy series/volume rows or user state.

**Acceptance criteria**

- When a chapter's file is missing on scan, the chapter is **soft-deleted** (`comics.deleted_at` set), not hard-deleted. (This may require introducing `deleted_at` on `comics` if not already present; same for `series` and `volume`.)
- A series with all chapters soft-deleted is itself soft-deleted; same for a volume with all chapters soft-deleted. Restoration cascades back when files reappear.
- Hard delete only happens after a configurable grace period (default 7 days) and only for rows with no remaining user state (no progress, bookmarks, favorites, list memberships) — otherwise the soft-deleted row is retained indefinitely.
- The existing `dismissed_paths` flow continues to work and short-circuits any auto-recreation of series/volume rows for paths the user has actively dismissed.
- A separate maintenance job (or scheduled tick) performs the eventual hard delete; the scan path itself never hard-deletes.

### R-9: Read paths use IDs

Every consumer of the old string-based series API switches to ID-based.

**Acceptance criteria**

- `getAllSeries()` returns `{ id, library_id, name, sort_name, age_rating, cover_comic_id, chapter_count, last_updated_at }` rows.
- `getSeriesComics(name)` is replaced by `getSeriesChapters(seriesId, { volumeId? })` returning chapters in `(volume.number NULLS LAST, comic.chapter_number, comic.title)` order.
- New `getSeriesVolumes(seriesId)` returns volumes in `number NULLS LAST` order.
- Routes in `src/main/webServer/routes/progress.ts` and any other consumer (search, library views) are updated to consume the new shapes.
- Frontend (`src/web/views/library/...`, `src/web/views/reader/...`) uses series ID in URLs (`/series/:id`) instead of URL-encoded series names. Old name-based URLs keep working for one release via redirect (see R-14).

### R-10: Series-level cover resolution

A series and a volume have a deterministic cover with optional manual override.

**Acceptance criteria**

- Default series cover: cover of the lowest-numbered chapter in the lowest-numbered volume; ties broken by `comic.id`.
- Default volume cover: cover of the lowest-numbered chapter in that volume; ties broken by `comic.id`.
- `series.cover_comic_id` and `volume.cover_comic_id` overrides take precedence when set.
- The cover endpoint already in use for comics is reused; new routes accept `series:<id>` / `volume:<id>` selectors and resolve to the chosen comic's cover bytes. Cache headers stay as they are today.
- Changing a cover override is reflected on the next request; no manual cache bust required from the user.

### R-11: Search returns series

Search results expose series as first-class entities, not just chapters.

**Acceptance criteria**

- The existing FTS5 search (`src/main/db/comics.ts:23-29` area) gains a series-level result type. Results may be `{ kind: 'series', id, name, library_id, ... }` or `{ kind: 'chapter', id, title, ... }`.
- A `series` FTS source is fed from `series.name`, `series.localized_name`, `series.summary`, and joined tag names. Maintained by trigger or by explicit re-index hook on writes.
- Series results outrank chapter results when the query matches the series name.
- Existing search performance budget (≤ ~7 ms typical at 100k chapter rows per the current bench) holds for the union query at 100k chapters + 5k series.

### R-12: API surface (internal)

The internal HTTP API exposes series and volumes; OPDS (gap #1) will consume this surface later.

**Acceptance criteria**

- `GET /api/libraries/:id/series` — paginated series list with cover IDs, chapter counts, last-updated.
- `GET /api/series/:id` — series detail.
- `GET /api/series/:id/volumes` — volume list (excludes the implicit volume from the response unless `?include_implicit=true`).
- `GET /api/series/:id/chapters` — flattened chapter list across all volumes.
- `GET /api/volumes/:id/chapters` — chapters under a specific volume (including the implicit volume if `:id` resolves to it).
- All endpoints return JSON; pagination with `?cursor=&limit=` (default 50, max 200).
- Errors follow the convention already used elsewhere in `src/main/webServer/routes/` (no new error envelope is introduced here).

### R-16: ComicInfo.xml is authoritative when present

CBZ archives commonly ship with a `ComicInfo.xml` file at the archive root — the ComicRack metadata standard, also used by Komga, Kavita, ComicTagger, and Mylar. A real-world sample lives at `Gwenpool Omnibus (2022) (Digital) (Kileko-Empire).cbz` in this repo. When such a file is present, it is the authoritative source for series, volume, chapter, and per-comic metadata; filename heuristics are the fallback, not the override.

**Acceptance criteria**

- On ingest of a CBZ, the pipeline locates `ComicInfo.xml` at the archive root by case-insensitive name match. Files in subdirectories are ignored.
- Parsed fields, when present and non-empty, take precedence over filename heuristics for: `series_name` (`<Series>`), `volume_number` (`<Volume>`), `chapter_number` (`<Number>`), `title` (`<Title>`), `summary` (`<Summary>`), `publisher` (`<Publisher>`), `language` (`<LanguageISO>`), `year`/`month` (`<Year>`/`<Month>`), `page_count` (`<PageCount>`), `age_rating` (`<AgeRating>` mapped to the R-1 enum; unrecognised values fall to `unknown`).
- Credits (`<Writer>`, `<Penciller>`, `<Inker>`, `<CoverArtist>`, etc.) and tag-shaped fields (`<Genre>`, `<Tags>`, `<Characters>`, `<Teams>`, `<Locations>`) are parsed into the existing tag/credit storage where one exists, or stored on `comics.metadata_json` for later promotion to first-class columns. Tag splitting uses the standard `,` delimiter with whitespace trim.
- The `<Pages>` block, when present, drives cover resolution: a page with `Type="FrontCover"` is preferred over the first page when computing default series/volume covers (R-10). Absent a `<Pages>` block, the first image in archive order remains the cover.
- Malformed XML, missing fields, or an absent `ComicInfo.xml` does not abort ingest. Per-field fallback to filename heuristics is independent — a `ComicInfo.xml` with only `<Series>` populated still leaves `chapter_number` to filename parsing. Parse errors are logged at warn level with the file path and the parser error.
- Re-ingesting a file whose `ComicInfo.xml` has been updated refreshes the comic's metadata on the existing row; it does not create a duplicate. If the new `<Series>` value normalises to a different series, the comic is rebound to the new series row, and the now-empty old series row is left for the soft-delete sweep (R-8) — never silently merged.
- A user edit through the existing edit flow wins over a subsequent ingest from `ComicInfo.xml`. Once a field has been edited by the user, ingest must not overwrite it from the XML; this is tracked via per-field `*_user_edited` flags on `comics` (or equivalent — exact mechanism is a design decision).
- ComicInfo parsing adds no more than 5 ms per file p95 on a commodity laptop and does not regress the R-6 bulk-ingest budget.

### R-17: Folder grouping is a strong series signal

A directory whose contents are multiple comic files with a recurring base name represents one series, not several. Filename heuristics alone can fragment this: `/Marvel_Backup/Darth Vader/Darth Vader 001 (2015) (Digital) (BlackManta-Empire).cbr` and `/Marvel_Backup/Darth Vader/Darth Vader 001 (2017) (Digital) (Kileko-Empire).cbr` share a folder and a base name but a year-aware filename parser would split them across two series. The user has already expressed intent — they put the files in one folder.

The reverse case must not falsely group: a folder containing an unrelated one-shot dropped alongside a series must not pull that one-shot into the series. Folder grouping is gated by per-file filename-prefix match against the folder's recurring base name, so unmatched siblings stay independent.

**Acceptance criteria**

- For each leaf directory containing 2+ comic files, ingest computes a **recurring base name** for the directory: the longest normalised prefix shared by at least 2 sibling filenames, after stripping issue numbers, year tags, scanlator suffixes, and other ignorable tokens via the same normalisation `parseSeriesFromFilename` already uses. Minimum length is 3 characters; below that, the directory has no recurring base name and folder grouping does not trigger for any file in it.
- A file is bound to the folder-derived series **only if its own normalised filename starts with the recurring base name**. Files in the same directory whose names do not match (e.g. a one-shot, an unrelated crossover, a cover-art bonus) are ingested independently under filename and ComicInfo rules — they may end up standalone (R-7) or under their own filename-derived series.
- When folder grouping binds a file, the series name is the directory's basename run through `normalizeSeriesName`. The recurring base name is the prefix gate; the directory basename is the canonical name.
- ComicInfo.xml `<Series>` (R-16) overrides folder grouping per file: a stray crossover whose ComicInfo identifies a different series binds that file to the ComicInfo series even if its filename matches the folder prefix. ComicInfo always wins.
- **Run detection — each run gets its own volume.** Distinct *runs* of a series under the same folder must be split into separate volume rows under the same series. The `Darth Vader/` folder contains both Marvel's 2015 and 2017 runs (each shipping issues 001-025); the resulting series has two volume rows, one per run, and chapters do not collide.
- Runs are detected by either signal: (a) a chapter-number collision among folder-grouped files (two files resolve to the same `chapter_number`); (b) heterogeneity in a strong run-discriminator across folder-grouped files — primarily ComicInfo.xml `<Volume>` (R-16), and as a fallback the year tag in the filename (`(2015)`, `(2017)`, …) or another consistent parenthesised disambiguator. Either signal is sufficient; the second handles the case where chapter ranges happen not to overlap.
- Run identity (the value used to bucket files into volume rows) resolves in this order: (a) ComicInfo.xml `<Volume>` when present; (b) folder-name `vN` suffix per R-20 when the comic lives directly inside an `<X> vN/` folder; (c) the year tag from the filename — this is the "year as volume" rule, a **labelling and default-ordering** signal, not an authoritative reading-order claim; (d) any other consistent parenthesised disambiguator (scanlator group, edition mark) when no year tag is present; (e) failing all of the above, a placeholder label per detected run (`Run A`, `Run B`, …) with a warn-level log so the user can rename via the existing edit flow.
- Volume **default order** uses the run identity: numeric `<Volume>` values sort numerically, year tags sort by year ascending. This is a sensible default for the common case (a Volume 2 succeeds Volume 1; a 2017 reboot succeeds a 2015 run). The user can override volume ordering through the existing edit flow when default order disagrees with intended reading order — for example, the Darth Vader 2017 run is set chronologically before the 2015 run in-universe, so a user may swap their volume numbers. Reading order *within* a single run continues to follow `chapter_number`.
- A folder with no chapter-number collisions, no `<Volume>` heterogeneity, and no consistent year/disambiguator differences collapses to a single implicit volume (R-3). The year-as-volume rule does not split a folder into volumes when every file shares the same year tag.
- A folder where no recurring base name meets the threshold is not forced into a series; each file ingests under its filename-derived rules. Standalone state from R-7 still applies.
- Intermediate organisational directories (`Marvel/`, `By Year/2015/`) are not series. Folder grouping evaluates at the leaf directory containing the comic files, walking no further up.
- A directory with exactly one comic file does not trigger folder grouping; that file follows filename and ComicInfo rules alone. Adding a second matching file later promotes the directory to a folder-grouped series and rebinds the first file to the new series row when the prefix gate now passes.
- `dismissed_paths` continues to suppress folder-driven series creation for paths the user has explicitly dismissed.

### R-18: Series view

The library UI exposes a series detail view that lists every comic belonging to a series, reachable from any place a series is rendered.

**Acceptance criteria**

- Clicking a series tile (library browse, search results, recently-added, "more from this series" rails, etc.) navigates to `/series/:id` (the URL shape from R-9).
- The series view shows: series name, default or override cover (R-10), summary, status, age rating, total chapter count, and per-volume breakdown — backed by `getSeriesVolumes(seriesId)` and `getSeriesChapters(seriesId)` (R-9).
- The view lists every non-soft-deleted chapter in the series in `(volume.number NULLS LAST, comic.chapter_number, comic.title)` order. Each row is one comic file. The Darth Vader case (50 cbr files across two year-runs in one folder per R-17) renders as one series with the chapters grouped by volume.
- For series with multiple volumes, chapters are grouped by volume with a header for each volume (collapsible). The implicit volume (R-3) renders as a flat list directly under the series header — no "Volume null" group is shown.
- Clicking a chapter row opens the reader at the start of that file; reading progress (R-7 / existing flow) is preserved.
- Soft-deleted chapters (R-8) are hidden by default. An admin/debug toggle in the series view reveals them, distinct from active rows.
- Standalone books (R-7) do not have a series view — they open the reader directly from library browse.
- The series view degrades correctly for an empty series (all chapters soft-deleted): it renders the series header with a "no chapters available" placeholder and a "show hidden" affordance for admins, rather than 404.

### R-19: Reserved `one-shot/` directory

Library roots may contain a top-level directory named `one-shot/` whose immediate children are folders of standalone books — one comic file per child folder. This is the result of a triage pass that pulls every single-comic folder out of the active series tree (CB8's `consolidate-marvel-backup` ops script does this). Comics under `one-shot/` are standalone (R-7); they are not promoted to series even when sibling names share a prefix.

**Acceptance criteria**

- A directory at the library root whose normalised name is `one-shot` (case-insensitive, hyphen or space tolerant — also matches `oneshot`, `one shot`) is treated as a reserved standalone container during ingest.
- For each immediate child folder of `one-shot/`, ingest treats the contained comic file as standalone (R-7): `series_id IS NULL`, `volume_id IS NULL`. Reading progress, bookmarks, and tags still attach to the comic row.
- R-17 folder-grouping is **not** applied at the `one-shot/` level. Even if many child folder names share a prefix (`100th Anniversary Special - Avengers`, `100th Anniversary Special - Spider-Man`, …), the reserved container suppresses series formation.
- A child folder under `one-shot/` containing 2+ comic files is a data-shape error: ingest logs at warn level with the folder path, ingests each comic as a standalone, and does not promote the folder to a series. The user must move the folder out of `one-shot/` if they want it series-grouped.
- ComicInfo.xml `<Series>` (R-16) still wins per file. A comic under `one-shot/` whose ComicInfo names a series binds to that series; the `one-shot/` location is a default, not a hard override.
- The reserved name is convention-only — CB8 does not require the directory to exist.
- `dismissed_paths` and the soft-delete grace window (R-8) apply identically inside `one-shot/`.

### R-20: Volume markers in folder names (`Series Name vN`)

A folder name ending in ` v<digits>` declares the contained chapters belong to that volume of a series. The series name is the folder name with the `vN` suffix stripped; the volume number is the integer after `v`. Sibling folders sharing the stripped name form one series with multiple volumes — `Avengers v1/`, `Avengers v2/`, `Avengers v3/` are one series with three volumes.

**Acceptance criteria**

- A folder name matching the regex `^(.+?) v(\d+)$` (a non-empty prefix, exactly one space, the literal `v`, then one or more digits, end-of-name) is parsed as `(series_name = group(1), volume_number = int(group(2)))`. Match is case-insensitive on the `v`. Whitespace at either end of the name is trimmed before matching.
- Examples that match: `Avengers v1`, `Doom 2099 v1`, `Captain America v3`, `Iron Man v10`. Examples that **do not** match and stay as-is: `Avengers vs Pet Avengers` (no digits after `v`), `Avengers Forever` (no `v` token), `1602` (no volume marker), `vN` alone with no series-name prefix.
- Sibling folders that strip to the same series name (NOCASE-normalised, whitespace-trimmed) are bound to one series row with one volume row per folder. The library currently has 1,069 `vN` folders covering ~700 distinct series; this rule must scale to that.
- A series detected across `vN` siblings does not require contiguous volume numbers. `Avengers v1/` + `Avengers v3/` (no v2) form one series with two volumes — the missing volume is absent, not synthesised.
- Volume identity precedence (extends R-17): ComicInfo.xml `<Volume>` > folder-name `vN` (R-20) > filename year tag (the run-detection rule in R-17) > implicit volume (R-3). Folder-name `vN` is a stronger volume signal than the year tag because it is the user's explicit, repository-level structural choice.
- ComicInfo.xml `<Series>` (R-16) still wins per file. A chapter inside `Avengers v1/` whose ComicInfo names a different series binds to that series — the folder name is the default, not an override.

### R-21: Filename date prefixes (`YYYYMM `)

Many CB8 libraries use a `YYYYMM ` filename prefix to encode publication date — `198001 Avengers v1 191.cbz` is "Avengers v1 #191, published January 1980." The prefix is publication metadata, not series or chapter data, and must not contaminate series/chapter parsing.

**Acceptance criteria**

- A filename prefix matching `^\d{6} ` (six digits, single space) is recognised as a publication date. The first four digits are the year; the last two are the month. The captured `(year, month)` is stored on the comic row — initially in `comics.metadata_json`, with promotion to first-class columns left as a future iteration.
- The prefix is stripped before all subsequent filename-driven parsing — chapter number extraction, title fallback, series fallback, and the recurring-base-name check in R-17 all operate on the post-strip filename.
- ComicInfo.xml `<Year>` and `<Month>` (R-16) take precedence over the filename date prefix when both are present.
- The chapter number is extracted from the post-strip filename's trailing numeric token. For `198001 Avengers v1 191.cbz`, parsing produces `(date=1980-01, volume=1, chapter=191)`. The `v1` is consistent with the parent folder per R-20; ingest cross-checks and logs a warn if the file's volume marker disagrees with the folder's.
- A six-digit prefix that is not a plausible date (year < 1900, year > current year + 5, month outside 1..12) is treated as a non-date numeric prefix: it is *not* stripped as a date but may still match other ingest heuristics. For example, `199913 Foo.cbz` is left intact.
- Files without a date prefix continue to parse as today.

### R-22: Canonical library layout (informative)

This section is informative — it shows the canonical CB8 layout that R-17 / R-19 / R-20 / R-21 produce, so a reader can map the rules onto a real library.

```
<library_root>/
  one-shot/                              ← R-19, reserved standalone container
    100th Anniversary Special - X-Men/
      100th Anniversary Special - X-Men 001.cbz
    Aero/
      Aero 001.cbz
    ...
  Avengers v1/                           ← R-20, "Avengers" series, vol 1
    198001 Avengers v1 191.cbz           ← R-21 date prefix, vol from folder, chapter 191
    198002 Avengers v1 192.cbz
    ...
  Avengers v2/                           ← R-20, same series as v1, vol 2
    ...
  Avengers v3/                           ← R-20, same series as v1, vol 3
    ...
  Darth Vader/                           ← R-17 folder grouping (no vN suffix)
    Darth Vader 001 (2015) (Digital) (BlackManta-Empire).cbr   ← R-17 run-detection
    Darth Vader 001 (2017) (Digital) (Kileko-Empire).cbr       ← splits into 2 volumes
    ...
  1602 - Witch Hunter Angela/            ← R-17, single-volume mini, no vN suffix
    1602 - Witch Hunter Angela 001.cbz
    1602 - Witch Hunter Angela 002.cbz
    ...
```

**Acceptance criteria**

- Dropped into a fresh library, the example above produces:
  - One series **Avengers** with three volumes (1, 2, 3) populated from `Avengers v[1-3]/`.
  - One series **Darth Vader** with two volumes auto-detected by chapter-number collision and labelled by year tag (R-17). Default volume order is year-ascending; user may override.
  - One series **1602 - Witch Hunter Angela** with the implicit volume (R-3) and several chapters.
  - Standalone books for every comic under `one-shot/`, none wrapped in a synthetic series.
- The layout is canonical, not required. CB8 must continue to ingest libraries that do not follow this structure (no `one-shot/`, no `vN` suffixes, no date prefix) using the unchanged R-17 / R-16 / filename-heuristic chain.

---

## Migration requirements

> **Status note (green-field collapse).** R-13, R-14, and R-15 below describe a v6 → v7 → v8 upgrade path that was implemented during development and then deleted. The project committed to a green-field deploy: there are no v6 or v7 databases in the wild, and `create.ts` now defines the post-collapse shape directly. The requirements are kept here because they document the contract that *would* apply if the project ever re-introduces an upgrade path. See `design.md` §3 for the current bootstrap narrative.

### R-13: Backfill

Existing CB8 databases must migrate without manual intervention and without data loss.

**Acceptance criteria**

- A new schema version (`CURRENT_VERSION` advances by 1 in `src/main/db/schema/migrations.ts`) creates `series`, `volume`, the new columns on `comics`, and indexes.
- Backfill SQL groups existing comics by `(library_id, normalized_series_name)` to create series rows, then by `(series_id, volume_number)` to create volume rows, then sets `comics.series_id` and `comics.volume_id`.
- Comics with `series_name IS NULL` are left as standalone (`series_id` and `volume_id` both `NULL`).
- A comic with a `series_name` but ambiguous library (linked to multiple libraries via `library_comics`) is assigned to the **first** library by `library_comics.rowid` and the migration logs the conflict; no comic is dropped.
- The migration runs in under 60 seconds on a 100k-chapter database on a commodity laptop.
- The migration is idempotent — running it twice is a no-op (it is gated by `app_meta.schema_version`, matching the existing pattern).

### R-14: Backward-compatible read shape during transition

One release window keeps the old call sites working while consumers move.

**Acceptance criteria**

- The legacy `series_name`, `volume_number`, `chapter_number` columns on `comics` are kept in the schema and populated by ingest (write to both old and new) for one release.
- Old name-based URLs (`/series/:name`) issue a 301 redirect to `/series/:id` after the migration runs, so external links and bookmarks survive.
- A removal plan is recorded in `docs/hierarchy/design.md` for the schema version that drops the legacy columns. This requirements doc commits to *deprecation*, not removal in the same release.

### R-15: Reversibility

A user must be able to restore a pre-migration backup and have CB8 work.

**Acceptance criteria**

- The migration adds tables and columns only; it does not drop or rename anything.
- A backup taken before the migration can be restored; on next start the migration runs again cleanly against the restored DB.
- The migration is documented in `docs/hierarchy/design.md` with a manual rollback recipe (drop new tables, drop new columns, decrement `schema_version`) for emergency use.

---

## Non-functional requirements

### NFR-H1: Performance

- A library browse listing 200 series with covers responds in under 150 ms p95 from cache, under 500 ms cold, at 100k chapters total.
- The series list query degrades no worse than O(n log n) in series count; no N+1 chapter-count queries.
- Chapter listing under a series with 1,000 chapters across 50 volumes responds in under 200 ms p95.

### NFR-H2: Data integrity

- A foreign key check (`PRAGMA foreign_key_check`) over the entire DB returns zero rows immediately after migration and after any 24-hour fuzz of ingest + edit + delete operations.
- A consistency check that `comics.series_id = volume.series_id` for every row with `volume_id NOT NULL` returns zero violations after the same fuzz.

### NFR-H3: Test coverage

- Unit tests on the backfill SQL against synthetic legacy-shaped fixtures: standalone, single-volume, multi-volume, ambiguous library, NULL series_name.
- Integration test: open a v6 (pre-hierarchy) snapshot DB, run migration, assert series/volume row counts match expectation, assert no comic was orphaned.
- Idempotency test: run migration twice; assert second run is a no-op.
- Round-trip test: edit a comic to change its series/volume via the existing edit flow; assert series/volume rows reflect the change without duplicates.

### NFR-H4: Observability

- Migration logs a one-line summary: `migrated N comics into S series and V volumes in Tms`.
- Backfill conflicts (R-13 ambiguous-library case) are logged at warn level with the comic ID and the libraries involved.

### NFR-H5: No user-visible regression

- Every page that worked before the migration works after, with the same data visible. The "library" view, the series view, the reader, search results, bookmarks, favorites, history all still resolve.
- Existing Playwright/vitest suites pass without change. New tests are additive.

---

## Risks and open questions

- **Same-name series across libraries.** Allowed and treated as distinct (matches Kavita). Surfaced in the UI by their library badge. Open question: should an admin merge action exist now or be deferred? Current call: defer, schema supports it.
- **NOCASE collation across SQLite versions.** `(library_id, name) UNIQUE COLLATE NOCASE` works on the SQLite shipped with `better-sqlite3` but fold rules differ from full Unicode case-folding; non-ASCII series names with case differences could collide or fail to collide unexpectedly. Mitigation: normalise series name (`normalizeSeriesName` already exists) before write, store the canonical form, treat the `name` column as the canonical key.
- **Library reassignment.** What happens if the user moves a chapter from one library to another? Current call: re-resolves into a series row in the new library, leaves the old series row in place (which becomes empty and is soft-deleted by the next maintenance pass). Avoids cross-library series merges that would surprise users.
- **Implicit volume vs. explicit volume 0.** Some users intentionally create "Volume 0" for prologue chapters. The implicit volume must not collide with an explicit `0`. The unique constraint `(series_id, number)` with `number IS NULL` for implicit is sufficient, but UI must render volume 0 distinctly from "no volume."
- **Hard-delete grace window default.** 7 days is a guess. Open: tie to a config setting from day one or hard-code with a TODO. Current call: hard-code in the maintenance job, expose as config when (gap #11) job runner lands.
- **Re-ingest reshuffles.** If a user renames a directory so series parsing now produces a different name, ingest will create a new series row and orphan the old one. Mitigation in this iteration: rely on soft-delete + admin merge later; do not attempt automatic rename detection.
- **ComicInfo.xml conflicts with filename.** When `ComicInfo.xml` says `<Series>One Piece</Series>` but the filename parses to `One Piece - East Blue Saga`, R-16 says ComicInfo wins. This can surprise users who curate by filename. Mitigation: log the conflict at info level on first ingest of the file so it's discoverable in scan output; do not surface a UI prompt in this iteration.
- **ComicInfo.xml dialect drift.** The standard is loosely specified; ComicTagger, Mylar, and hand-authored files vary in element casing, missing root namespace, and field semantics (e.g. `<Number>` as float vs string vs range). Mitigation: be liberal in what we accept (case-insensitive element match, lenient number parsing), strict in what we trust (refuse to overwrite a user-edited field; log unrecognised elements rather than failing).
- **Folder grouping vs. multi-series folders.** A user who dumps unrelated one-shots into a single `Misc/` folder will not have a recurring base name, so R-17 will not trigger and each file ingests independently. The opposite case — a folder genuinely meant to mix two series — is rare in practice but real (anthology folders, bundled crossovers). Mitigation: ComicInfo.xml `<Series>` overrides folder grouping per file (R-17); for non-tagged anthology folders, the user must split the folder. Open question: should the threshold (>= 2 files, >= 3-char prefix) be per-library configurable on day one, or hard-coded with a TODO? Current call: hard-code, expose later.
- **Year-as-volume vs. year-as-cosmetic-tag.** R-17 says year suffixes inside a folder-grouped series feed volume resolution. This is correct for Marvel-style "(2015)" / "(2017)" relaunches, but may produce noisy volumes for fan-tagged scans where the year is the scan year, not the publication year. Mitigation: prefer ComicInfo `<Volume>` and `<Year>` over filename-extracted year when both are present; treat filename year as a fallback signal only.
