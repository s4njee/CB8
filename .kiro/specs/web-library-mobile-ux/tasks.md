# Implementation Plan: Web Library Mobile UX

## Overview

Most mobile UX features (tab bar, filter strips, sort sheet, badges, empty states, sticky navbar, card sizing, headless mode, upload, drag-and-drop) are already implemented. This plan focuses on the remaining work: server-side REST endpoints for library/folder/tag management, client-side API wrappers, card context menu enhancements, tab panel context menus, and property-based tests.

## Tasks

- [x] 1. Add library management REST endpoints to webServer.ts
  - [x] 1.1 Add `PUT /api/libraries/:id` endpoint for renaming a library
    - Parse JSON body `{ name }`, validate non-empty, call `db.renameLibrary(id, name.trim())`
    - Return 401 if not authenticated, 400 if name empty, 409 on duplicate name
    - _Requirements: 17.3, 17.4, 17.8, 17.9_
  - [x] 1.2 Add `DELETE /api/libraries/:id` endpoint for deleting a library
    - Call `db.deleteLibrary(id)` — removes library and associations, not comic records or files
    - Return 401 if not authenticated
    - _Requirements: 17.5, 17.6, 17.8_
  - [x] 1.3 Add `DELETE /api/libraries/:id/comics` endpoint for removing comics from a library
    - Parse JSON body `{ comicIds }`, call `db.removeComicsFromLibrary(id, comicIds)`
    - Return 401 if not authenticated, 400 if comicIds missing/empty
    - _Requirements: 19.4, 19.5, 19.7_

- [x] 2. Add folder management REST endpoints to webServer.ts
  - [x] 2.1 Add `POST /api/folders` endpoint for creating a folder
    - Parse JSON body `{ name, comicIds }`, call `db.createFolder(name.trim(), comicIds)`
    - Return 401 if not authenticated, 400 if name empty
    - _Requirements: 18.1, 18.2, 18.9_
  - [x] 2.2 Add `PUT /api/folders/:id` endpoint for renaming a folder
    - Parse JSON body `{ name }`, call `db.renameFolder(id, name.trim())`
    - Return 401 if not authenticated, 400 if name empty
    - _Requirements: 18.4, 18.5, 18.9_
  - [x] 2.3 Add `DELETE /api/folders/:id` endpoint for deleting a folder
    - Call `db.deleteFolder(id)` — removes folder and associations, not comic records or files
    - Return 401 if not authenticated
    - _Requirements: 18.6, 18.7, 18.9_
  - [x] 2.4 Add `POST /api/folders/:id/comics` endpoint for adding comics to a folder
    - Parse JSON body `{ comicIds }`, call `db.addComicsToFolder(id, comicIds)`
    - Return 401 if not authenticated, 400 if comicIds missing/empty
    - _Requirements: 20.2, 20.5, 20.8_
  - [x] 2.5 Add `DELETE /api/folders/:id/comics` endpoint for removing comics from a folder
    - Parse JSON body `{ comicIds }`, call `db.removeComicsFromFolder(id, comicIds)`
    - Return 401 if not authenticated, 400 if comicIds missing/empty
    - _Requirements: 20.4, 20.6, 20.8_

- [x] 3. Add tag management REST endpoints to webServer.ts
  - [x] 3.1 Add `PUT /api/comics/:id/tags` endpoint for setting tags on a comic
    - Parse JSON body `{ tags }`, compute diff with current tags, call `db.addTag`/`db.removeTag` as needed
    - Return 401 if not authenticated, 404 if comic not found, 400 if tags not an array
    - _Requirements: 21.2, 21.3, 21.4, 21.10_
  - [x] 3.2 Add `PUT /api/tags/:name` endpoint for renaming a tag globally
    - Parse JSON body `{ newName }`, call `db.renameTag(oldName, newName.trim())`
    - Return 401 if not authenticated, 400 if newName empty
    - _Requirements: 21.5, 21.6, 21.10_
  - [x] 3.3 Add `DELETE /api/tags/:name` endpoint for deleting a tag globally
    - Call `db.deleteTag(tagName)`
    - Return 401 if not authenticated
    - _Requirements: 21.7, 21.8, 21.10_

- [x] 4. Checkpoint — Verify server endpoints
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Add client-side API functions in api.js
  - [x] 5.1 Add library management API functions
    - `renameLibrary(id, name)` — `PUT /api/libraries/:id`
    - `deleteLibrary(id)` — `DELETE /api/libraries/:id`
    - `removeComicsFromLibrary(libraryId, comicIds)` — `DELETE /api/libraries/:id/comics`
    - _Requirements: 17.3, 17.5, 19.4_
  - [x] 5.2 Add folder management API functions
    - `createFolder(name, comicIds)` — `POST /api/folders`
    - `renameFolder(id, name)` — `PUT /api/folders/:id`
    - `deleteFolder(id)` — `DELETE /api/folders/:id`
    - `addComicsToFolder(folderId, comicIds)` — `POST /api/folders/:id/comics`
    - `removeComicsFromFolder(folderId, comicIds)` — `DELETE /api/folders/:id/comics`
    - _Requirements: 18.1, 18.4, 18.6, 20.2, 20.4_
  - [x] 5.3 Add tag management API functions
    - `setComicTags(comicId, tags)` — `PUT /api/comics/:id/tags`
    - `renameTag(oldName, newName)` — `PUT /api/tags/:name`
    - `deleteTag(name)` — `DELETE /api/tags/:name`
    - _Requirements: 21.2, 21.5, 21.7_

- [x] 6. Enhance card context menu in admin.js
  - [x] 6.1 Add "Add to folder ▸" submenu to card context menu
    - Lazy-load folder list via `api.fetchFolders()` on hover/click
    - Each folder calls `api.addComicsToFolder(folderId, targets)` with toast confirmation
    - Include "+ New folder…" option that prompts for name, creates folder, then adds comics
    - Dispatch `cb8:library-changed` on success
    - _Requirements: 20.1, 20.2, 20.3, 20.7_
  - [x] 6.2 Add "Remove from collection" option to card context menu
    - Render only when `currentRoute.type === 'library'`
    - Call `api.removeComicsFromLibrary(currentRoute.id, targets)`, remove cards from grid
    - Dispatch `cb8:library-changed` on success
    - _Requirements: 19.4, 19.6_
  - [x] 6.3 Add "Remove from folder" option to card context menu
    - Render only when `currentRoute.type === 'folder'`
    - Call `api.removeComicsFromFolder(currentRoute.id, targets)`, remove cards from grid
    - Dispatch `cb8:library-changed` on success
    - _Requirements: 20.4, 20.7_
  - [x] 6.4 Add "Tags…" option to card context menu with tag editor
    - Fetch current tags via `api.fetchComic(targetId)`
    - Display tags as removable chips with text input for adding new tags
    - On each add/remove, send `api.setComicTags(comicId, updatedTags)`
    - Dispatch `cb8:library-changed` on success
    - _Requirements: 21.1, 21.2, 21.3, 21.9_

- [x] 7. Add context menus and action buttons to tab panels in app.js
  - [x] 7.1 Add library context menu in Collections tab panel
    - Right-click (desktop) or long-press (mobile) on a library item opens context menu with "Rename" and "Delete"
    - Rename: inline text input, sends `api.renameLibrary(id, name)` on confirm
    - Delete: `window.confirm(...)`, sends `api.deleteLibrary(id)` on confirm; navigate to `#/` if viewing deleted library
    - Dispatch `cb8:library-changed` on success
    - _Requirements: 17.2, 17.3, 17.5, 17.7_
  - [x] 7.2 Add folder context menu in Folders tab panel
    - Same pattern as library context menu: "Rename" and "Delete" options
    - Rename: sends `api.renameFolder(id, name)` on confirm
    - Delete: sends `api.deleteFolder(id)` on confirm; navigate to `#/` if viewing deleted folder
    - Dispatch `cb8:library-changed` on success
    - _Requirements: 18.3, 18.4, 18.6, 18.8_
  - [x] 7.3 Add tag context menu in Tags tab panel
    - Right-click or long-press on a tag item opens context menu with "Rename tag" and "Delete tag"
    - Rename: inline text input, sends `api.renameTag(oldName, newName)` on confirm
    - Delete: `window.confirm('Delete tag "{name}"? This will remove the tag from all comics.')`, sends `api.deleteTag(name)` on confirm
    - Dispatch `cb8:library-changed` on success
    - _Requirements: 21.5, 21.7, 21.9_
  - [x] 7.4 Add "New collection" button in Collections tab panel
    - Visible only to authenticated admins
    - Prompts for name and media type (comic/book), sends `api.createLibrary(name, mediaType)`
    - Dispatch `cb8:library-changed` on success
    - _Requirements: 17.1, 17.7_
  - [x] 7.5 Add "New folder" button in Folders tab panel
    - Visible only to authenticated admins
    - Prompts for name, sends `api.createFolder(name, [])`
    - Dispatch `cb8:library-changed` on success
    - _Requirements: 18.1, 18.8_

- [x] 8. Add CSS for context menus in tab panel
  - Add styles for tab panel context menu positioning and long-press interaction
  - Add styles for inline rename input within tab panel list items
  - Add styles for "New collection" / "New folder" action buttons at bottom of tab panel lists
  - _Requirements: 17.2, 18.3, 21.5_

- [x] 9. Checkpoint — Verify all management features work end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Add "Recently Read" option to desktop sort select
  - [x] 10.1 Verify `<option value="lastRead">Recently Read</option>` exists in `#sort-select`
    - Already present in index.html — confirm it works with the existing `applySort` flow
    - _Requirements: 7.1, 13.1_

- [x] 11. Verify existing implementations match spec
  - [x] 11.1 Verify tab bar, tab panels, media strip, file-type strip, sort sheet work correctly
    - Confirm 5 tabs in correct order, panel open/close, pill filtering, sort options
    - _Requirements: 1.1–1.8, 2.1–2.7, 3.1–3.5, 5.1–5.5_
  - [x] 11.2 Verify format badges, progress badges, empty states, stable card dimensions
    - Confirm badge text/styling, progress percentage clamping, empty state messages, aspect-ratio
    - _Requirements: 9.1–9.4, 10.1–10.4, 11.1–11.6, 12.1–12.3_
  - [x] 11.3 Verify mobile card sizing (150px min-width, 12px gap, 10px padding)
    - Confirm CSS custom property `--card-w: 150px` at mobile breakpoint
    - _Requirements: 4.1–4.4_
  - [x] 11.4 Verify sticky navbar on mobile and search accessibility
    - Confirm `position: fixed`, z-index, content offset, search input fills available width
    - _Requirements: 6.1–6.4_
  - [x] 11.5 Verify headless mode in index.ts
    - Confirm `--headless` flag and `CB8_HEADLESS=1` env var detection, no BrowserWindow, forced web server start, SIGINT/SIGTERM handling
    - _Requirements: 14.1–14.10_
  - [x] 11.6 Verify no desktop regression
    - Confirm sidebar, navbar media-toggle, sort select unchanged on desktop; tab bar/panel/strips hidden
    - _Requirements: 7.1–7.3_

- [x] 12. Checkpoint — Full verification complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 13. Property-based tests for correctness properties
  - [ ]* 13.1 Write property test for filter composition (mediaType + fileExt)
    - **Property 1: Filter Composition — mediaType and fileExt**
    - Generate random arrays of comic records with random mediaType and filePath extensions
    - Assert all returned records match both filters simultaneously
    - **Validates: Requirements 8.2, 8.3, 8.4**
  - [ ]* 13.2 Write property test for progress badge percentage computation
    - **Property 2: Progress Badge Percentage Computation**
    - Generate random (lastPage, lastLocation, pageCount) tuples
    - Assert output matches `Math.max(1, Math.min(100, Math.round(lastPage / pageCount * 100))) + '%'`
    - **Validates: Requirements 9.1, 9.2, 9.3**
  - [ ]* 13.3 Write property test for format badge text and style class
    - **Property 3: Format Badge Text and Style Class**
    - Generate random fileExt from valid set plus empty, assert text and class correctness
    - **Validates: Requirements 10.1, 10.2, 10.4**
  - [ ]* 13.4 Write property test for lastRead sort ordering
    - **Property 4: lastRead Sort Ordering**
    - Generate random arrays of records with varying lastRead timestamps (including null)
    - Assert ordering invariants for both asc and desc
    - **Validates: Requirements 13.2, 13.3, 13.4**
  - [ ]* 13.5 Write property test for upload file extension validation
    - **Property 5: Upload File Extension Validation**
    - Generate random filename strings with random extensions
    - Assert acceptance iff extension is in supported set
    - **Validates: Requirements 16.7, 16.11**
  - [ ]* 13.6 Write property test for upload path traversal prevention
    - **Property 6: Upload Path Traversal Prevention**
    - Generate random relative path strings including adversarial components
    - Assert rejection for all traversal attempts
    - **Validates: Requirements 16.8, 16.12**
  - [ ]* 13.7 Write property test for tag set diff correctness
    - **Property 9: Tag Set Diff Correctness**
    - Generate random pairs of old and new tag sets
    - Assert resulting tag set equals new tag set exactly
    - **Validates: Requirements 21.2, 21.3, 21.4**

- [x] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Many features (tab bar, badges, empty states, sort sheet, headless mode, upload, drag-and-drop) are already implemented — task 11 verifies they match the spec
- All database CRUD methods already exist in `libraryDatabase.ts` — server endpoints just wire them to HTTP routes
- The `queryComicsByLibrary` SELECT list already includes `c.last_location` — the incidental fix noted in the design is already resolved
- Property tests use fast-check with the existing Vitest setup
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
