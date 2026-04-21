# Implementation Plan: Comic Book Reader

## Overview

Migrate the existing Qt6/C++ comic book reader to an Electron + TypeScript + React application. Implementation proceeds bottom-up: core utilities and main-process services first (archive loading, image decoding, database, scanner), then renderer-side UI (reader view, library view, navigation, drag-and-drop), and finally integration wiring via IPC. Property-based tests use `fast-check`.

## Tasks

- [x] 1. Initialize Electron + TypeScript + React project
  - Scaffold the Electron project with TypeScript, React, and a bundler (Electron Forge or electron-builder)
  - Install dependencies: `yauzl`, `node-unrar-js`, `better-sqlite3`, `fast-check`, `react`, `react-dom`, `@tanstack/react-virtual` (or `react-window`)
  - Install a JXL WASM decoder package (`jxl-dec` or `jxl.js`)
  - Configure `electron-rebuild` for `better-sqlite3`
  - Create directory structure: `src/main/`, `src/renderer/`, `src/shared/`
  - Set up a minimal Electron main process entry and renderer HTML entry
  - _Requirements: All (project foundation)_

- [x] 2. Implement core utilities (main process)
  - [x] 2.1 Implement natural sort comparator
    - Create `src/shared/naturalSort.ts` with a comparator function that splits strings into numeric and non-numeric chunks, comparing numeric chunks by integer value and non-numeric chunks lexicographically
    - _Requirements: 1.2, 2.2_

  - [ ]* 2.2 Write property test for natural sort comparator
    - **Property 1: Natural sort ordering**
    - Generate arbitrary filename lists with embedded numeric sequences; verify sorted output orders numeric substrings by value
    - **Validates: Requirements 1.2, 2.2**

  - [x] 2.3 Implement image extension filter
    - Create `src/shared/imageFilter.ts` with a function that returns `true` iff the file extension (case-insensitive) is one of: `jpg`, `jpeg`, `png`, `webp`, `gif`, `bmp`, `jxl`, `avif`
    - _Requirements: 1.5, 2.5_

  - [ ]* 2.4 Write property test for image extension filter
    - **Property 2: Image extension filter correctness**
    - Generate arbitrary filename strings; verify the filter returns `true` only for recognized image extensions
    - **Validates: Requirements 1.5, 2.5**

  - [x] 2.5 Implement cover image selection logic
    - Create `src/shared/coverSelection.ts` with a function that, given a sorted list of image entries, returns the entry with basename `"cover"` (case-insensitive) if present, otherwise the first entry
    - _Requirements: 11.7_

  - [ ]* 2.6 Write property test for cover image selection
    - **Property 18: Cover image selection priority**
    - Generate arbitrary lists of image entries with and without a "cover" basename; verify correct selection
    - **Validates: Requirements 11.7**

  - [x] 2.7 Implement drop validator
    - Create `src/shared/dropValidator.ts` with a function that accepts a filename and returns `true` iff the extension (case-insensitive) is `cbz` or `cbr`
    - _Requirements: 7.3_

  - [ ]* 2.8 Write property test for drop validator
    - **Property 5: Drop validator accepts only comic archives**
    - Generate arbitrary filename strings; verify acceptance only for `.cbz` and `.cbr` extensions
    - **Validates: Requirements 7.3**

  - [x] 2.9 Implement status bar formatter
    - Create `src/shared/statusFormat.ts` with a function that takes `currentPage` (0-based) and `totalPages` and returns `"${currentPage + 1} / ${totalPages}"`
    - _Requirements: 8.1_

  - [ ]* 2.10 Write property test for status bar formatter
    - **Property 6: Status bar format**
    - Generate arbitrary valid page indices and totals; verify output string matches expected format
    - **Validates: Requirements 8.1**

  - [x] 2.11 Implement window title generator
    - Create `src/shared/windowTitle.ts` with a function that extracts the basename from a file path and returns a title string containing it
    - _Requirements: 9.1_

  - [ ]* 2.12 Write property test for window title generator
    - **Property 7: Window title contains filename**
    - Generate arbitrary file path strings; verify the title contains the basename
    - **Validates: Requirements 9.1**

  - [x] 2.13 Implement aspect-ratio scaling function
    - Create `src/shared/scaleFit.ts` with a function that computes display dimensions preserving aspect ratio and fitting within viewport bounds
    - _Requirements: 3.1_

  - [ ]* 2.14 Write property test for aspect-ratio scaling
    - **Property 3: Aspect-ratio scaling preserves ratio and fits viewport**
    - Generate arbitrary positive image and viewport dimensions; verify ratio preservation and viewport fit
    - **Validates: Requirements 3.1**

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement ArchiveLoader (main process)
  - [x] 4.1 Implement CBZ loader
    - Create `src/main/archiveLoader.ts` with `open()` for ZIP files using `yauzl`, filtering image entries via the image filter, sorting via natural sort, and `getPage()` to extract raw image bytes by index
    - Return descriptive error messages for missing/corrupted files without crashing
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 4.2 Implement CBR loader
    - Extend `src/main/archiveLoader.ts` with RAR support using `node-unrar-js`, same filtering and sorting logic
    - Return descriptive error messages for missing/corrupted files without crashing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 4.3 Implement getCoverImage
    - Add `getCoverImage()` to `ArchiveLoader` using the cover selection logic from `src/shared/coverSelection.ts`
    - _Requirements: 11.7_

  - [x] 4.4 Implement JXL image decoder
    - Create `src/main/imageDecoder.ts` that detects `.jxl` files, decodes via WASM, and converts to PNG buffer
    - Integrate into `getPage()` and `getCoverImage()` so JXL images are transparently decoded before being sent to the renderer
    - _Requirements: 1.5, 2.5 (JXL support)_

  - [ ]* 4.5 Write unit tests for ArchiveLoader
    - Test CBZ and CBR open/getPage/getCoverImage with small fixture archives
    - Test error handling for missing and corrupted files
    - _Requirements: 1.1–1.5, 2.1–2.5, 11.7_

- [-] 5. Implement LibraryDatabase (main process)
  - [x] 5.1 Create SQLite schema and initialization
    - Create `src/main/libraryDatabase.ts` implementing the `LibraryDatabase` interface
    - Create `comics`, `tags`, and `comic_tags` tables with all indexes per the design schema
    - Handle missing/corrupted database by creating a new empty database and logging a warning
    - _Requirements: 10.1, 10.2, 10.5, 14.1_

  - [x] 5.2 Implement CRUD operations
    - Implement `addComic`, `removeComics`, `getComic`, `comicExistsByPath`
    - `addComic` stores file path, title, page count, file size, cover thumbnail, and date added
    - `removeComics` deletes records and associated thumbnail data; cascade deletes tag associations
    - _Requirements: 10.3, 10.4, 14.2, 14.3, 16.1_

  - [ ]* 5.3 Write property test for comic record round-trip
    - **Property 8: Comic record storage round-trip**
    - Generate arbitrary valid comic records; store and retrieve by ID; verify all fields match
    - **Validates: Requirements 10.4**

  - [ ]* 5.4 Write property test for batch deletion
    - **Property 17: Batch deletion correctness**
    - Generate a set of comic records and a subset to delete; verify remaining records are exactly the non-deleted ones
    - **Validates: Requirements 14.3, 16.1**

  - [x] 5.5 Implement search and query
    - Implement `queryComics` with case-insensitive search on title and file path, tag filtering, sorting (title, dateAdded, fileSize, pageCount), and pagination (offset/limit)
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 14.4, 14.5_

  - [ ]* 5.6 Write property test for search correctness
    - **Property 11: Search returns correct matches**
    - Generate comic records and search queries; verify results contain exactly the matching records
    - **Validates: Requirements 13.1**

  - [ ]* 5.7 Write property test for combined tag and search filter
    - **Property 12: Combined tag and search filter**
    - Generate records with tags and a search query; verify results match both tag and search criteria
    - **Validates: Requirements 13.4, 13.5**

  - [ ]* 5.8 Write property test for sort ordering
    - **Property 13: Sort ordering correctness**
    - Generate comic records; sort by each field in each direction; verify ordering
    - **Validates: Requirements 14.4**

  - [x] 5.9 Implement tag operations
    - Implement `addTag`, `removeTag`, `getAllTags`
    - Support multiple tags per comic and shared tags across comics
    - Retain orphaned tags (tags with no remaining associations)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 5.10 Write property test for tag assignment and retrieval
    - **Property 14: Tag assignment and retrieval**
    - Generate comics and tag sets; assign tags; verify retrieval returns all assigned tags
    - **Validates: Requirements 15.1, 15.3, 15.4**

  - [ ]* 5.11 Write property test for tag removal
    - **Property 15: Tag removal**
    - Assign and then remove a tag; verify the tag no longer appears on the comic
    - **Validates: Requirements 15.2**

  - [ ]* 5.12 Write property test for orphaned tag retention
    - **Property 16: Orphaned tag retention**
    - Assign a tag, remove all associations; verify the tag still appears in `getAllTags()`
    - **Validates: Requirements 15.5**

- [ ] 6. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement FileScanner (main process)
  - [x] 7.1 Implement directory scanner
    - Create `src/main/fileScanner.ts` implementing the `FileScanner` interface
    - Recursively traverse directories using `fs.opendir`, discover `.cbz` and `.cbr` files
    - For each discovered file: check `comicExistsByPath` to skip duplicates, extract metadata and cover thumbnail via `ArchiveLoader`, create `ComicRecord` via `LibraryDatabase`
    - Yield control periodically to keep the main process responsive
    - Report progress via callback (discovered count, processed count, current file)
    - Skip unreadable archives with error logging and continue scanning
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6_

  - [ ]* 7.2 Write property test for scan idempotence
    - **Property 9: Scan idempotence**
    - Create a temp directory with comic files; scan twice; verify no duplicate records
    - **Validates: Requirements 11.3**

- [x] 8. Set up IPC channels (main process)
  - Create `src/main/ipcHandlers.ts` registering all IPC handlers per the design channel table
  - Wire `archive:open`, `archive:page`, `archive:close` to `ArchiveLoader`
  - Wire `dialog:open-file` to Electron's native file dialog with CBZ/CBR filters
  - Wire `library:query`, `library:scan`, `library:scan-progress`, `library:add-tag`, `library:remove-tag`, `library:remove-comics`, `library:get-thumbnail` to `LibraryDatabase` and `FileScanner`
  - Create `src/renderer/ipcClient.ts` with typed wrapper functions for invoking each channel from the renderer
  - Create `src/main/preload.ts` exposing IPC invoke/on methods via `contextBridge`
  - _Requirements: All (IPC is the communication backbone)_

- [ ] 9. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement ReaderView (renderer)
  - [x] 10.1 Implement NavigationController
    - Create `src/renderer/components/NavigationController.ts` (or React hook `useNavigation`) implementing `nextPage`, `previousPage`, `firstPage`, `lastPage` with boundary clamping
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 10.2 Write property test for navigation state machine
    - **Property 4: Navigation state machine correctness**
    - Generate arbitrary valid navigation states and actions; verify page index stays in bounds and transitions are correct
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**

  - [x] 10.3 Implement ReaderView component
    - Create `src/renderer/components/ReaderView.tsx` displaying the current page image scaled to fit the viewport while preserving aspect ratio (use the `scaleFit` utility)
    - Show black background when no archive is loaded
    - Re-scale on window resize
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 10.4 Implement keyboard event handling
    - Bind Right/Space → nextPage, Left/Backspace → previousPage, Home → firstPage, End → lastPage
    - Bind F11 → toggle fullscreen, Escape → exit fullscreen
    - Wire fullscreen toggle to Electron's `BrowserWindow.setFullScreen` via IPC or `webFrame`
    - _Requirements: 4.1–4.6, 5.1, 5.2, 5.3, 5.4_

  - [x] 10.5 Implement StatusBar component
    - Create `src/renderer/components/StatusBar.tsx` using the status bar formatter
    - Display "X / Y" when archive is loaded, empty when not
    - Update on page change
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 10.6 Implement window title updates
    - Use the window title generator to set the document/window title when an archive is loaded
    - Show default application title when no archive is loaded
    - _Requirements: 9.1, 9.2_

- [x] 11. Implement file opening UI (renderer)
  - [x] 11.1 Implement File > Open menu and dialog
    - Create application menu with File > Open item
    - Trigger `dialog:open-file` IPC, filter for `.cbz` and `.cbr` files
    - On file selection, open the archive and display the first page
    - On cancel, preserve current state
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 11.2 Implement drag-and-drop loading
    - Add drag-and-drop handlers to the application window
    - Use the drop validator to accept only `.cbz`/`.cbr` files
    - Show visual drop acceptance indicator on dragover
    - On drop, open the archive and display the first page
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 12. Implement LibraryView (renderer)
  - [x] 12.1 Implement virtual scrolling grid
    - Create `src/renderer/components/LibraryView.tsx` with a virtualized grid using `@tanstack/react-virtual` or `react-window`
    - Render only visible rows plus one buffer row above and below
    - Each cell shows cover thumbnail and title
    - Show placeholder image for thumbnails not yet loaded
    - Double-click a cell to open the comic in the reader view
    - _Requirements: 12.1, 12.2, 12.4, 12.5_

  - [ ]* 12.2 Write property test for virtual scroll item range
    - **Property 10: Virtual scroll renders correct item range**
    - Generate arbitrary total counts, viewport heights, row heights, column counts, and scroll offsets; verify rendered item range is correct
    - **Validates: Requirements 12.2**

  - [x] 12.3 Implement search and filter UI
    - Add search input that sends queries via `library:query` IPC
    - Add tag filter dropdown populated from `getAllTags()`
    - Combined tag + search filtering
    - Clear search restores full library view
    - _Requirements: 13.1, 13.3, 13.4, 13.5_

  - [x] 12.4 Implement sort controls
    - Add sort-by dropdown (title, date added, file size, page count) and sort direction toggle
    - Wire to `library:query` IPC with sort options
    - _Requirements: 14.4, 14.5_

  - [x] 12.5 Implement scan directory UI
    - Add menu item or button to trigger a directory scan
    - Show progress indicator with discovered/processed counts during scan
    - Wire to `library:scan` and `library:scan-progress` IPC channels
    - _Requirements: 11.1, 11.4, 11.5_

  - [x] 12.6 Implement tag management UI
    - Add UI to assign and remove tags on selected comics
    - Wire to `library:add-tag` and `library:remove-tag` IPC channels
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 12.7 Implement remove comics UI
    - Add remove action for selected comics with confirmation prompt
    - Wire to `library:remove-comics` IPC channel
    - Update the library view to remove deleted entries
    - Do not delete underlying archive files from the filesystem
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [x] 13. Implement App Shell and view switching (renderer)
  - Create `src/renderer/components/App.tsx` as the root component
  - Implement navigation between LibraryView and ReaderView
  - Wire all child components together with shared state
  - _Requirements: All (integration)_

- [ ] 14. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Integration wiring and final polish
  - [x] 15.1 Wire main process entry point
    - Update `src/main/index.ts` to initialize LibraryDatabase, register all IPC handlers, create the BrowserWindow, and load the renderer
    - _Requirements: 10.1, 10.2_

  - [ ]* 15.2 Write integration tests
    - Test end-to-end archive loading with small CBZ/CBR fixture files via IPC
    - Test library scan → query → tag → remove flow
    - Test search and sort at scale with seeded database
    - _Requirements: All_

- [ ] 16. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check`
- Unit tests validate specific examples and edge cases
- All code is TypeScript targeting Electron (main + renderer processes)
