/**
 * Barrel for the per-domain comics modules. The 700-line monolith was
 * carved up by responsibility:
 *
 *   - `comics/core.ts`       — row mappers + basic CRUD (add, get,
 *                              remove, dismissed paths, page-count and
 *                              reading-progress UPDATEs)
 *   - `comics/query.ts`      — paginated browse (`queryComics`,
 *                              `queryComicsForUser`) + `buildFtsQuery`
 *   - `comics/recent.ts`     — recently-read / continue-reading shelves
 *   - `comics/listings.ts`   — R-9 chapter listings under a series/volume
 *   - `comics/covers.ts`     — cover-bytes I/O + R-10 default cover
 *   - `comics/softDelete.ts` — R-8 soft-delete primitives + cascade rules
 *   - `comics/metadata.ts`   — `updateComicMetadata` / `getComicMetadata`
 *   - `comics/userEdits.ts`  — R-16 user-edit field tracking
 *
 * Re-exporting through this barrel keeps the existing
 * `import * as comics from './db/comics'` shape that `LibraryDatabase`'s
 * `bindAll` helper relies on — every export here ends up bound on
 * `db.comics.*` automatically.
 */
export * from './comics/core';
export * from './comics/query';
export * from './comics/recent';
export * from './comics/listings';
export * from './comics/covers';
export * from './comics/softDelete';
export * from './comics/metadata';
export * from './comics/userEdits';
