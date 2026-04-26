# Implementation Plan: Library Filter & Sort

## Overview

Bottom-up implementation: shared types and pure filter logic first, then database query changes and IPC wiring, then UI components, then LibraryView integration and persistence. Each task builds on the previous so there is no orphaned code.

## Tasks

- [x] 1. Add shared types and pure filter logic
  - [x] 1.1 Extend QueryOptions and add FilterPreset type
    - Add `readStatus?: 'unread' | 'in-progress' | 'completed'` to `QueryOptions` in `src/shared/types.ts`
    - Add `FilterPreset` interface to `src/shared/types.ts`
    - _Requirements: 9.1, 7.1_

  - [x] 1.2 Create pure filter logic module
    - Create `src/shared/filterLogic.ts` with the following pure functions:
      - `classifyReadStatus(comic)` → `'unread' | 'in-progress' | 'completed'`
      - `filterByReadStatus(comics, status)` → filtered array
      - `filterByFileExt(comics, ext)` → filtered array
      - `applyFilters(comics, filters)` → filtered array (AND composition)
      - `getDefaultSortOrder(sortBy)` → `'asc' | 'desc'`
      - `toggleSortOrder(current)` → opposite order
      - `updateFilterPreset(preset, field, value)` → new preset
      - `parseFilterPreset(json)` → `FilterPreset` with fallback to defaults on invalid input
    - Classification rules per design: unread = lastPage null AND lastRead null; completed = lastPage === pageCount - 1; in-progress = otherwise
    - _Requirements: 3.4, 3.5, 3.6, 9.1_

  - [ ]* 1.3 Write property test: read status classification is a total partition
    - **Property 1: Read status classification is a total partition**
    - Generate random comic records with arbitrary lastPage, lastRead, pageCount (pageCount >= 1)
    - Verify classifyReadStatus returns exactly one of the three values and matches the defined rules
    - **Validates: Requirements 3.4, 3.5, 3.6**

  - [ ]* 1.4 Write property test: read status filter returns exactly matching comics
    - **Property 2: Read status filter returns exactly matching comics**
    - Generate random comic arrays and random readStatus (including undefined)
    - Verify filter output matches manual classification; undefined returns all
    - **Validates: Requirements 3.2, 3.3, 9.2, 9.3, 9.4**

  - [ ]* 1.5 Write property test: file extension filter returns exactly matching comics
    - **Property 3: File extension filter returns exactly matching comics**
    - Generate random file paths and extensions
    - Verify filter output matches case-insensitive extension check; undefined returns all
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 1.6 Write property test: filters compose as logical AND
    - **Property 4: Filters compose as logical AND**
    - Generate random comics and random filter combinations
    - Verify applyFilters result equals intersection of individual filters
    - **Validates: Requirements 6.1, 9.5**

  - [ ]* 1.7 Write property test: default sort direction mapping
    - **Property 5: Default sort direction mapping**
    - For each sort field, verify getDefaultSortOrder returns 'desc' for dateAdded/lastRead, 'asc' for title/fileSize/pageCount
    - **Validates: Requirements 2.4, 2.5**

  - [ ]* 1.8 Write property test: sort direction toggle is an involution
    - **Property 6: Sort direction toggle is an involution**
    - Generate random starting order, verify toggleSortOrder(toggleSortOrder(x)) === x
    - **Validates: Requirements 2.2**

  - [ ]* 1.9 Write property test: single filter change preserves other filter values
    - **Property 7: Single filter change preserves other filter values**
    - Generate random FilterPreset and single-field update, verify other fields unchanged
    - **Validates: Requirements 6.2**

  - [ ]* 1.10 Write unit tests for edge cases
    - `classifyReadStatus` with pageCount = 1 and lastPage = 0 → completed
    - `filterByFileExt` with mixed-case extensions (.CBZ vs .cbz)
    - `parseFilterPreset` with malformed JSON → returns default
    - `parseFilterPreset` with unknown sortBy value → returns default
    - _Requirements: 3.4, 3.5, 3.6, 4.2_

- [x] 2. Checkpoint - Ensure shared logic tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Add readStatus SQL conditions to database query methods
  - [x] 3.1 Add readStatus condition to queryComics
    - In `src/main/libraryDatabase.ts`, add readStatus SQL condition building to `queryComics` method
    - Use the SQL conditions from the design: unread = `last_page IS NULL AND last_read IS NULL`, completed = `last_page = page_count - 1`, in-progress = has activity but not completed
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

  - [x] 3.2 Add readStatus condition to queryComicsByLibrary
    - Add the same readStatus SQL condition building to `queryComicsByLibrary` method
    - _Requirements: 8.1, 9.2, 9.3, 9.4_

  - [x] 3.3 Add readStatus condition to getFolderComics
    - Add the same readStatus SQL condition building to `getFolderComics` method
    - _Requirements: 8.2, 9.2, 9.3, 9.4_

- [x] 4. Add app-meta IPC channels
  - [x] 4.1 Add IPC type definitions for app-meta channels
    - Add `'app-meta:get'` and `'app-meta:set'` to `IpcInvokeMap` in `src/shared/ipcTypes.ts`
    - Add both channels to the `IPC_INVOKE_CHANNELS` array
    - _Requirements: 7.1, 7.2_

  - [x] 4.2 Register app-meta IPC handlers
    - Add `ipcMain.handle('app-meta:get', ...)` and `ipcMain.handle('app-meta:set', ...)` in `src/main/ipcHandlers.ts`
    - Delegate to `db.getAppMeta(key)` and `db.setAppMeta(key, value)`
    - _Requirements: 7.1, 7.2_

  - [x] 4.3 Add app-meta helpers to ipcClient
    - Add `getAppMeta(key)` and `setAppMeta(key, value)` functions to `src/renderer/ipcClient.ts`
    - _Requirements: 7.1, 7.2_

- [x] 5. Checkpoint - Typecheck passes
  - Run `pnpm run typecheck` to verify all type definitions and IPC wiring are correct. Ask the user if questions arise.

- [x] 6. Create SortControl component
  - [x] 6.1 Implement SortControl
    - Create `src/renderer/components/SortControl.tsx`
    - Render a `<select>` dropdown with sort field options: Title, Date Added, File Size, Pages, Recently Read
    - Render a toggle button with arrow icon for sort direction (↑ asc, ↓ desc)
    - Accept props: `sortBy`, `sortOrder`, `onSortByChange`, `onSortOrderToggle`
    - Visually indicate the currently active sort field and direction
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3_

- [x] 7. Create FilterBar component
  - [x] 7.1 Implement FilterBar
    - Create `src/renderer/components/FilterBar.tsx`
    - Render read status pills: All, Unread, In Progress, Completed
    - Render file type pills: All, CBZ, CBR, PDF, EPUB
    - Render tag selector `<select>` populated from `availableTags`, hidden when empty
    - Accept props: `readStatus`, `fileExt`, `tag`, `availableTags`, `onReadStatusChange`, `onFileExtChange`, `onTagChange`
    - Visually highlight active pills
    - _Requirements: 3.1, 3.2, 3.3, 3.7, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4_

- [x] 8. Integrate filter/sort into LibraryView
  - [x] 8.1 Add filter/sort state and persistence to LibraryView
    - Add state variables: `sortBy`, `sortOrder`, `readStatus`, `fileExt`, `filterTag`, `availableTags`
    - On mount, load persisted `FilterPreset` from app_meta via `getAppMeta('filterPreset')` and apply; fall back to defaults on parse failure
    - Replace hardcoded `sortBy: 'title', sortOrder: 'asc'` in `fetchPage` with state values
    - Pass `readStatus` in `QueryOptions` to all three query paths (queryComics, queryLibraryComics, queryFolderComics)
    - Load `availableTags` from `getAllTags()` on mount
    - When `sortBy` changes to `dateAdded` or `lastRead`, default `sortOrder` to `'desc'`; when changed to `title`, default to `'asc'`
    - _Requirements: 1.3, 2.4, 2.5, 7.2, 7.3, 8.1, 8.2_

  - [x] 8.2 Wire SortControl and FilterBar into LibraryView render
    - Render `SortControl` in the toolbar area above the comic grid
    - Render `FilterBar` below the search bar
    - On any filter/sort change: reset offset to 0, re-fetch, persist updated `FilterPreset` via `setAppMeta('filterPreset', ...)`
    - Display total count of matching comics
    - Use the same SortControl and FilterBar across main library, library collection, and folder views
    - _Requirements: 1.1, 3.1, 6.1, 6.2, 6.3, 7.1, 8.3_

- [x] 9. Final checkpoint - Ensure all tests pass and typecheck succeeds
  - Run `pnpm test` and `pnpm run typecheck`. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- No schema migration is needed — existing columns and tables are sufficient
- The `fast-check` library is already installed as a dev dependency
