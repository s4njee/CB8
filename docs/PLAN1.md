# PLAN1: Scale the Reader to Thousands of Volumes

Goal: make the comic reader responsive and reliable for libraries with thousands of volumes, with a path toward 100,000+ records from the Kiro specs.

Baseline docs:
- `.kiro/specs/comic-book-reader/requirements.md`
- `.kiro/specs/comic-book-reader/design.md`
- `AGENTS.md`
- `REFACTOR.md`

## Phase 1: Virtualized Library Browsing

Problem: `LibraryView` currently uses paged loading plus a CSS grid, but every loaded comic remains mounted. This will degrade as the library grows.

Changes:
- Replace the current grid in `src/renderer/components/LibraryView.tsx` with `@tanstack/react-virtual`.
- Compute column count from container width and fixed card width.
- Virtualize rows, not individual cards.
- Render only visible rows plus one buffer row above and below.
- Preserve current selection, double-click open, drag-to-library, and search behavior.

Acceptance checks:
- A generated library with 10,000 records can scroll without mounting all cards.
- Search and library switching reset scroll and selection correctly.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

## Phase 2: Metadata-Only Queries and Lazy Thumbnails

Problem: library queries return `coverThumbnail` for every record, making result pages heavier than needed.

Changes:
- Split comic query results into metadata and thumbnail fetches.
- Add a lightweight comic summary type that excludes `coverThumbnail`.
- Update `library:query` and `libraries:query` to return metadata only.
- Keep `library:get-thumbnail` for thumbnail bytes.
- Add visible-item thumbnail loading in the virtual grid.
- Cache object URLs by comic ID in the renderer.
- Revoke object URLs when records are evicted or the component unmounts.

Acceptance checks:
- Querying 50 items does not transfer thumbnail blobs.
- Visible cards request thumbnails only when they enter the virtualized range.
- No broken thumbnails after scrolling away and back.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

## Phase 3: Real Thumbnail Generation

Problem: scans currently store raw cover bytes as `cover_thumbnail`; large covers increase database size and renderer memory.

Changes:
- Add a thumbnail generation module in `src/main/`.
- Resize covers to a fixed max dimension, for example 240px wide or 360px tall.
- Encode thumbnails to a browser-native format such as JPEG or WebP.
- Store only generated thumbnail bytes in `cover_thumbnail`.
- Add a fallback placeholder when thumbnail generation fails.
- Add a migration or one-shot repair path for existing raw thumbnails.

Acceptance checks:
- Newly scanned comics store bounded-size thumbnails.
- Large source covers do not create multi-megabyte DB blobs.
- Corrupt cover images do not abort the entire scan.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

## Phase 4: Search and Sort Scalability

Problem: `%term% LIKE` queries will not scale well because normal B-tree indexes cannot satisfy arbitrary substring search efficiently.

Changes:
- Add SQLite schema versioning and migrations.
- Add an FTS5 table for searchable comic fields.
- Index title, file path, tags, and later series metadata.
- Keep sort fields backed by indexed columns.
- Update `queryComics` and `queryComicsByLibrary` to use FTS for search terms.
- Add a benchmark seed script for 10k, 50k, and 100k fake records.

Acceptance checks:
- Search over 10,000 records returns within 200ms on the development machine.
- Sort by title, date added, file size, and page count remains DB-backed.
- Existing databases migrate without data loss.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

## Phase 5: Scanner Job Queue

Problem: directory scanning, archive opening, cover extraction, and DB writes currently run through main-process service code with only cooperative yielding.

Changes:
- Introduce a scan job queue with bounded concurrency.
- Move expensive archive metadata and thumbnail extraction into worker threads or isolated jobs.
- Add cancellation support.
- Track scan status: queued, discovered, processed, skipped duplicates, failed files.
- Persist scan errors in a scan report table or log file.
- Keep UI progress updates throttled to avoid IPC spam.

Acceptance checks:
- The app remains responsive during large scans.
- Scan can be cancelled.
- Bad archives are skipped and reported without stopping the scan.
- Re-running a scan skips existing paths.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

## Phase 6: Large Archive Memory Controls

Problem: CBR loading currently extracts all image files into memory at archive open time.

Changes:
- Refactor `openCbr` to separate archive metadata from page bytes.
- Extract pages on demand where the library supports it.
- Add a bounded reader page cache for current, previous, and next pages.
- Ensure CBZ and CBR paths share the same high-level cache API.
- Add explicit cache eviction when closing an archive.

Acceptance checks:
- Opening a large CBR does not load every page into memory.
- Navigation preloads the next page without unbounded memory growth.
- Closing a comic releases archive/page cache resources.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

## Phase 7: Library UX for Thousands of Volumes

Problem: large libraries need stronger organization and maintenance workflows.

Changes:
- Add DB-backed filters for tags, libraries, read status, missing files, and recently added.
- Add bulk operations that work from selected IDs and later from query filters.
- Add rescan and missing-file repair workflows.
- Add scan result UI for failed/skipped files.
- Add optional metadata fields: series, volume number, issue number, publisher, year, last opened, read status.

Acceptance checks:
- Filters compose with search.
- Bulk remove never deletes archive files from disk.
- Missing-file checks do not block the renderer.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

## Suggested Implementation Order

1. Phase 1: Virtualized Library Browsing.
2. Phase 2: Metadata-Only Queries and Lazy Thumbnails.
3. Phase 3: Real Thumbnail Generation.
4. Phase 4: Search and Sort Scalability.
5. Phase 5: Scanner Job Queue.
6. Phase 6: Large Archive Memory Controls.
7. Phase 7: Library UX for Thousands of Volumes.

This order improves user-visible performance early while reducing memory and database pressure before deeper scanner and archive refactors.

## Verification Checklist for Each Phase

Run:

```sh
pnpm run typecheck
pnpm test
```

For phases that affect scale, also run or add a deterministic fixture/benchmark:

```sh
pnpm run seed:library
pnpm run benchmark:library
```

Those benchmark scripts do not exist yet. Add them during Phase 4, when schema and query performance become explicit work items.
