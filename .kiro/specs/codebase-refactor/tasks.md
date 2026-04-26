# Implementation Plan: Codebase Refactor

## Overview

Eight behavior-preserving refactoring efforts. Each task is independently implementable. Run `pnpm run typecheck` and `pnpm test` after each task to verify no regressions.

## Tasks

- [x] 1. Centralize file type support in `src/shared/mediaTypes.ts`
  - [x] 1.1 Create `src/shared/mediaTypes.ts` with exports
    - `COMIC_EXTENSIONS`, `BOOK_EXTENSIONS`, `ALL_EXTENSIONS` sets
    - `detectMediaType(filename)` → `'comic' | 'book' | null`
    - `isSupportedFile(filename)` → boolean
    - `hasSupported(filenames)` → boolean
    - `EXTENSION_LABELS` record
    - `ALL_EXTENSIONS_ARRAY` for dialog filters
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [x] 1.2 Update `src/shared/dropValidator.ts` to delegate to `mediaTypes.ts`
    - Keep existing function signatures as thin wrappers
    - _Requirements: 5.7_
  - [x] 1.3 Update `src/main/fileScanner.ts` to import from `mediaTypes.ts`
    - Replace local `COMIC_EXTENSIONS` / `BOOK_EXTENSIONS` constants
    - _Requirements: 5.8_
  - [x] 1.4 Update web server ingest code to import from `mediaTypes.ts`
    - Replace local `COMIC_EXTS` / `BOOK_EXTS` constants
    - _Requirements: 5.9_
  - [x] 1.5 Update IPC dialog filter to use `ALL_EXTENSIONS_ARRAY`
    - Replace hardcoded extension list in file dialog handler
    - _Requirements: 5.10_

- [x] 2. Checkpoint — Verify mediaTypes module
  - Run `pnpm run typecheck` and `pnpm test`

- [x] 3. Separate schema creation from migrations
  - [x] 3.1 Create `src/main/db/schema/create.ts`
    - Move `SCHEMA` constant (all CREATE TABLE / CREATE INDEX DDL)
    - _Requirements: 1.3_
  - [x] 3.2 Create `src/main/db/schema/migrations.ts`
    - Move `migrateSchema`, `migrateAuthSchema`, `ensurePostMigrationIndexes`
    - Remove repair function calls from migration code
    - _Requirements: 1.4_
  - [x] 3.3 Create `src/main/db/schema/repairs.ts`
    - Move `repairExistingThumbnails`, `backfillCompletedOnFinalPage`, `backfillAccountFromPasswordHash`
    - Export a single `runRepairs(db)` entry point
    - _Requirements: 1.5_
  - [x] 3.4 Create `src/main/db/schema/open.ts`
    - Move `openOrRecreate` function
    - Call create → migrate → repair in fixed order
    - _Requirements: 1.1, 1.2_
  - [x] 3.5 Create `src/main/db/schema/index.ts` barrel export
    - Re-export `openOrRecreate` so existing `import { openOrRecreate } from './db/schema'` resolves
    - _Requirements: 1.7_
  - [x] 3.6 Delete old `src/main/db/schema.ts`
    - Verify all imports updated
    - _Requirements: 1.6_

- [x] 4. Improve DB startup diagnostics
  - [x] 4.1 Create `DbStartupError` class in `src/main/db/schema/open.ts`
    - Category field: `'corrupt' | 'migration' | 'repair'`
    - Structured error with `category`, `detail`, and `cause`
    - _Requirements: 7.7_
  - [x] 4.2 Update `openOrRecreate` error handling
    - Corrupt file: wipe and recreate, throw `DbStartupError('corrupt')` if recreation fails
    - Migration failure: throw `DbStartupError('migration')`, do NOT delete DB
    - Repair failure: log warning, continue with usable DB
    - Remove "database corrupted" phrasing from non-corruption errors
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - [x] 4.3 Update `src/main/index.ts` to handle `DbStartupError` categories
    - Show appropriate error messages based on category
    - _Requirements: 7.7_

- [x] 5. Checkpoint — Verify schema split and diagnostics
  - Run `pnpm run typecheck` and `pnpm test`

- [x] 6. Unify ingest/add/scan logic into `src/main/ingestService.ts`
  - [x] 6.1 Create `src/main/ingestService.ts` with `IngestService` interface
    - `addFile(filePath)` → `IngestResult`
    - `scanDirectory(dirPath, mediaType, onProgress)` → number
    - Use `detectMediaType` from `mediaTypes.ts`
    - Consolidate cover extraction, thumbnail generation, series parsing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - [x] 6.2 Update IPC `library:add-files` handler to delegate to `IngestService`
    - Replace inline ingest logic with `ingestService.addFile` calls
    - _Requirements: 2.9_
  - [x] 6.3 Update web server ingest to delegate to `IngestService`
    - Replace `addSingleFile` with `ingestService.addFile`
    - _Requirements: 2.10_
  - [x] 6.4 Update `FileScannerImpl` to delegate to `IngestService`
    - Replace `processComicFile` / `processBookFile` with `ingestService.addFile`
    - _Requirements: 2.11_
  - [x] 6.5 Verify identical database records for all file types
    - Test CBZ, CBR, PDF, EPUB, MOBI produce same records as before
    - _Requirements: 2.12_

- [x] 7. Checkpoint — Verify ingest unification
  - Run `pnpm run typecheck` and `pnpm test`

- [x] 8. Break up IPC handlers
  - [x] 8.1 Create `src/main/ipc/archiveHandlers.ts`
    - Move `archive:open`, `archive:page`, `archive:close`, `book:read-file` handlers
    - Keep `currentHandle` as module-level state
    - _Requirements: 3.2_
  - [x] 8.2 Create `src/main/ipc/libraryHandlers.ts`
    - Move `library:*`, `libraries:*`, `folders:*`, `dialog:*`, tag channel handlers
    - _Requirements: 3.3_
  - [x] 8.3 Create `src/main/ipc/readingHandlers.ts`
    - Move `reading:*` channel handlers
    - _Requirements: 3.4_
  - [x] 8.4 Create `src/main/ipc/webServerHandlers.ts`
    - Move `webserver:*` handlers and web server auto-start logic
    - _Requirements: 3.5_
  - [x] 8.5 Create `src/main/ipc/appHandlers.ts`
    - Move `window:*` and any `app-meta:*` handlers
    - _Requirements: 3.8_
  - [x] 8.6 Create `src/main/ipc/index.ts` coordinating entry point
    - Export `registerIpcHandlers` that calls all domain registration functions
    - _Requirements: 3.7_
  - [x] 8.7 Convert old `src/main/ipcHandlers.ts` to re-export barrel
    - `export { registerIpcHandlers } from './ipc/index'`
    - Preserves existing import in `src/main/index.ts`
    - _Requirements: 3.6_

- [x] 9. Checkpoint — Verify IPC handler split
  - Run `pnpm run typecheck` and `pnpm test`

- [-] 10. Clarify comic vs book naming
  - [x] 10.1 Add `MediaRecord` type and `ComicRecord` alias in `src/shared/types.ts`
    - `MediaRecord` is the canonical interface
    - `ComicRecord = MediaRecord` as deprecated alias
    - _Requirements: 4.1, 4.5_
  - [ ] 10.2 Add method aliases in `src/main/db/comics.ts`
    - `addItem = addComic`, `getItem = getComic`, `queryItems = queryComics`, etc.
    - _Requirements: 4.2_
  - [ ] 10.3 Add forwarding methods in `src/main/libraryDatabase.ts`
    - `addItem`, `getItem`, `queryItems`, `itemExistsByPath`, `getItemByPath`
    - _Requirements: 4.3_
  - [x] 10.4 Verify IPC channel names remain unchanged
    - No changes to preload bridge whitelist
    - _Requirements: 4.6_

- [ ] 11. Checkpoint — Verify naming changes
  - Run `pnpm run typecheck` and `pnpm test`

- [x] 12. Extract library UI state from LibraryView
  - [x] 12.1 Create `src/renderer/components/library/hooks/useLibraryQuery.ts`
    - Extract `comics`, `folders`, `totalCount`, `loadingMore`, `hasMore`, `loadInitial`, `loadMore`
    - _Requirements: 6.1_
  - [x] 12.2 Create `src/renderer/components/library/hooks/useLibraryFilters.ts`
    - Extract `sortBy`, `sortOrder`, `readStatus`, `fileExt`, `filterTag`, `availableTags`
    - _Requirements: 6.2_
  - [x] 12.3 Create `src/renderer/components/library/hooks/useLibrarySelection.ts`
    - Extract selection state, shift/ctrl click logic, `toggleSelection`, `rangeSelection`
    - Export pure helper functions for unit testing
    - _Requirements: 6.3_
  - [x] 12.4 Update `LibraryView.tsx` to use extracted hooks
    - Replace inline state with hook calls
    - Verify identical rendering output
    - _Requirements: 6.4, 6.5, 6.6_

- [x] 13. Checkpoint — Verify LibraryView hook extraction
  - Run `pnpm run typecheck` and `pnpm test`

- [ ]* 14. Property-based tests for refactored modules
  - [ ]* 14.1 Property test: media type detection correctness (Property 1)
    - Generate arbitrary filenames, verify `detectMediaType` and `isSupportedFile` consistency
    - _Validates: Requirements 5.3, 5.4_
  - [ ]* 14.2 Property test: drag-and-drop validation consistency (Property 2)
    - Generate filename arrays, verify `hasSupported` matches `some(isSupportedFile)`
    - _Validates: Requirements 5.6_
  - [ ]* 14.3 Property test: selection toggle is self-inverse (Property 3)
    - Generate random sets and ids, verify double-toggle identity
    - _Validates: Requirements 6.3_
  - [ ]* 14.4 Property test: range selection covers exact range (Property 4)
    - Generate item lists and index pairs, verify exact coverage
    - _Validates: Requirements 6.3_

- [ ] 15. Final checkpoint — All tests pass
  - Run `pnpm run typecheck` and `pnpm test`

## Notes

- Tasks marked with `*` are optional and can be skipped for faster delivery
- Task order is recommended but each numbered group (1, 3-4, 6, 8, 10, 12) can be done independently
- `mediaTypes.ts` (task 1) should be done first since tasks 6 and others depend on it
- The naming rename (task 10) uses type aliases for backward compatibility — no mass find-and-replace needed
- IPC channel names are NEVER changed — only the handler registration code moves
- Each checkpoint verifies `pnpm run typecheck` and `pnpm test` pass before proceeding
- The `ipcHandlers.ts` barrel re-export (task 8.7) ensures `src/main/index.ts` import doesn't change
