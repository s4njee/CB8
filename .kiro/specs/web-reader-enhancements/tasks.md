# Implementation Plan: Web Reader Enhancements

## Overview

This plan implements 26 requirements across four major areas: enhanced comic reader, reading progress & library, multi-user system, and metadata. Tasks are ordered so that foundational work (database schema, server modules, auth) comes first, followed by API endpoints, then client-side features.

## Tasks

- [ ] 1. Database schema migrations and new tables
  - [ ] 1.1 Add new columns to `comics` table in `libraryDatabase.ts` `migrateSchema()`
    - Add `series_name` (TEXT), `volume_number` (REAL), `chapter_number` (REAL) for series detection
    - Add `completed` (INTEGER DEFAULT 0) for read status
    - Add `author` (TEXT), `artist` (TEXT), `genre` (TEXT), `year` (INTEGER), `summary` (TEXT), `external_id` (TEXT), `external_source` (TEXT) for metadata
    - Add indexes: `idx_comics_series` on `series_name`, `idx_comics_last_read` on `last_read`
    - _Requirements: 9.2, 13.2, 25.10_
  - [ ] 1.2 Create `users` table
    - Columns: `id`, `username` (UNIQUE COLLATE NOCASE), `password_hash`, `is_admin` (DEFAULT 0), `created_at`
    - On first startup with empty table, create initial admin user from existing password
    - _Requirements: 19.1, 19.2_
  - [ ] 1.3 Create `user_progress` table
    - Columns: `user_id`, `comic_id`, `last_page`, `last_location`, `last_read`, `completed` (DEFAULT 0)
    - Composite primary key (`user_id`, `comic_id`), foreign keys with ON DELETE CASCADE
    - _Requirements: 20.1_
  - [ ] 1.4 Create `bookmarks` table
    - Columns: `id`, `user_id`, `comic_id`, `page`, `note`, `created_at`
    - Index on (`user_id`, `comic_id`)
    - _Requirements: 10.5, 20.6_
  - [ ] 1.5 Create `reading_history` table
    - Columns: `id`, `user_id`, `comic_id`, `action`, `page`, `timestamp`
    - Indexes on `user_id` and `timestamp`
    - _Requirements: 11.1, 20.7_
  - [ ] 1.6 Create `user_favorites` table
    - Columns: `user_id`, `comic_id`, `created_at`
    - Composite primary key (`user_id`, `comic_id`)
    - _Requirements: 23.1_

- [ ] 2. Install server-side dependencies
  - [ ] 2.1 Add `sharp` for image resizing
    - `pnpm add sharp`
    - _Requirements: 17.4_
  - [ ] 2.2 Add `bcrypt` (or `bcryptjs`) for password hashing
    - `pnpm add bcryptjs` (pure JS, no native build issues)
    - _Requirements: 19.1_

- [ ] 3. Create server-side utility modules
  - [ ] 3.1 Create `src/main/seriesParser.ts`
    - `parseSeriesFromFilename(filename)` → `{ seriesName, volumeNumber, chapterNumber }`
    - `normalizeSeriesName(name)` — trim, collapse spaces
    - Handle patterns: "Title v01", "Title Vol. 3 Ch. 12", "Title #005", "Title (2020) #01"
    - Return nulls when no pattern matches
    - _Requirements: 13.1, 13.3, 13.4_
  - [ ] 3.2 Create `src/main/imageResizer.ts`
    - `resizeImage(inputBuffer, width)` → resized Buffer via `sharp`
    - `getCachedOrResize(comicId, page, width, getOriginal)` — check `<userData>/image-cache/`, resize and cache if missing
    - Clamp width to 200–4000
    - _Requirements: 17.1, 17.3, 17.4, 17.5_
  - [ ] 3.3 Create `src/main/metadataScraper.ts`
    - `searchMetadata(query, sources?)` → `{ results: MetadataCandidate[], warnings: string[] }`
    - Adapters for ComicVine, AniList, MangaDex APIs
    - Per-source error handling (return empty results + warning on failure)
    - _Requirements: 25.1, 25.2, 25.8_

- [ ] 4. Extend auth system for multi-user
  - [ ] 4.1 Update session model in `webServer.ts`
    - Change session storage from `{ expiresAt }` to `{ userId, expiresAt }`
    - Add `resolveUser(req)` function returning `{ id, username, isAdmin }` or null
    - Update `isAuthenticated()` to check `users` table
    - _Requirements: 19.8, 19.9_
  - [ ] 4.2 Add `POST /api/auth/login` with username/password
    - Verify password with bcrypt, create session with userId
    - Return `{ authenticated: true, user: { id, username, isAdmin } }`
    - _Requirements: 19.3, 19.4_
  - [ ] 4.3 Add `POST /api/auth/register` (admin only)
    - Create new user with bcrypt-hashed password, `is_admin = false`
    - Return 409 on duplicate username
    - _Requirements: 19.5, 19.6_
  - [ ] 4.4 Update `GET /api/auth/session` to return user info
    - Return `{ authenticated, user: { id, username, isAdmin }, host }` or `{ authenticated: false }`
    - _Requirements: 19.9_
  - [ ] 4.5 Add guest access middleware
    - Read `guest_access` from `app_meta` (default `"false"`)
    - When disabled + unauthenticated: return 401 for all non-auth endpoints
    - When enabled + unauthenticated: allow read-only endpoints, block writes with 401
    - _Requirements: 22.1, 22.2, 22.3, 22.4_
  - [ ] 4.6 Add `PUT /api/settings/guest-access` (admin only)
    - Toggle `guest_access` in `app_meta`
    - _Requirements: 22.5_

- [ ] 5. Add user management API endpoints
  - [ ] 5.1 Add `GET /api/users` (admin only)
    - Return list of users: `id`, `username`, `isAdmin`, `createdAt`
    - _Requirements: 21.1_
  - [ ] 5.2 Add `POST /api/users` (admin only)
    - Create user with bcrypt-hashed password
    - _Requirements: 21.2_
  - [ ] 5.3 Add `DELETE /api/users/:id` (admin only)
    - Delete user and cascade to progress/bookmarks/history/favorites
    - Prevent self-deletion
    - _Requirements: 21.3_
  - [ ] 5.4 Add `PUT /api/users/:id/role` (admin only)
    - Promote/demote user; prevent demoting last admin
    - _Requirements: 21.4, 21.5_
  - [ ] 5.5 Add role-based access control to existing admin endpoints
    - Non-admin users get 403 on upload, scan, delete, library/folder/tag management
    - _Requirements: 21.6, 21.7, 21.8_

- [ ] 6. Add per-user progress and favorites API endpoints
  - [ ] 6.1 Update `PUT /api/comics/:id/progress` for per-user progress
    - Upsert into `user_progress` using resolved userId
    - Support `completed` flag
    - _Requirements: 9.2, 20.2_
  - [ ] 6.2 Add `DELETE /api/comics/:id/progress` for mark-as-unread
    - Delete `user_progress` row for current user
    - _Requirements: 9.3, 20.3_
  - [ ] 6.3 Update `GET /api/comics` to join per-user progress
    - Join `user_progress` and `user_favorites` for authenticated user
    - Return null progress for guests
    - Add `readStatus` filter param (unread/in-progress/completed)
    - Add `favorites=true` filter param
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 20.4, 20.5, 23.4, 23.5_
  - [ ] 6.4 Add `POST /api/comics/:id/favorite` and `DELETE /api/comics/:id/favorite`
    - Insert/delete from `user_favorites` for current user
    - _Requirements: 23.2, 23.3_
  - [ ] 6.5 Update `GET /api/recently-read` to scope by user
    - Query `user_progress` joined with `comics` for current user
    - _Requirements: 24.9_

- [ ] 7. Add bookmark API endpoints
  - [ ] 7.1 Add `POST /api/comics/:id/bookmarks`
    - Create bookmark for current user with page number
    - _Requirements: 10.2_
  - [ ] 7.2 Add `GET /api/comics/:id/bookmarks`
    - List bookmarks for current user and comic, sorted by page
    - _Requirements: 10.6_
  - [ ] 7.3 Add `PUT /api/comics/:id/bookmarks/:bookmarkId`
    - Update bookmark note (scoped to current user)
    - _Requirements: 10.4_
  - [ ] 7.4 Add `DELETE /api/comics/:id/bookmarks/:bookmarkId`
    - Delete bookmark (scoped to current user)
    - _Requirements: 10.3_

- [ ] 8. Add reading history API endpoints
  - [ ] 8.1 Add `POST /api/history`
    - Log reading event (opened/closed) with comicId, action, page for current user
    - _Requirements: 11.1, 11.2_
  - [ ] 8.2 Add `GET /api/history`
    - Return paginated history entries for current user, sorted by timestamp desc
    - _Requirements: 11.5_

- [ ] 9. Add series API endpoints and integrate series parsing
  - [ ] 9.1 Integrate `seriesParser` into file scanning and upload flows
    - Call `parseSeriesFromFilename()` when adding comics via scan or upload
    - Store `series_name`, `volume_number`, `chapter_number` on comic record
    - _Requirements: 13.1, 13.2_
  - [ ] 9.2 Add `GET /api/series` endpoint
    - Return distinct series with count, cover thumbnail URL, combined progress
    - _Requirements: 13.5_
  - [ ] 9.3 Add `GET /api/series/:name/comics` endpoint
    - Return comics in series sorted by volume then chapter number
    - _Requirements: 14.3_

- [ ] 10. Add metadata API endpoints
  - [ ] 10.1 Add `GET /api/comics/:id/metadata-search` (admin only)
    - Search external APIs using query param, return candidate matches
    - _Requirements: 25.1, 25.2, 25.3_
  - [ ] 10.2 Add `PUT /api/comics/:id/metadata` (admin only)
    - Update comic metadata columns (author, artist, genre, year, summary, external_id, external_source)
    - Optionally download and replace cover thumbnail from cover_url
    - Validate genre as JSON array of strings
    - _Requirements: 25.4, 25.5, 25.6, 26.3, 26.4, 26.5_

- [ ] 11. Add image resizing to page and thumbnail endpoints
  - [ ] 11.1 Update `GET /api/comics/:id/pages/:page` to accept `width` param
    - When present, resize via imageResizer before responding
    - Clamp to 200–4000, cache results
    - _Requirements: 17.1, 17.2, 17.3, 17.5_
  - [ ] 11.2 Update `GET /api/comics/:id/thumbnail` to accept `width` param
    - Same resize logic for thumbnails
    - _Requirements: 17.7_

- [ ] 12. Checkpoint — Verify all server endpoints
  - Run `pnpm run typecheck` and `pnpm test`

- [ ] 13. Extend client API wrappers in `api.js`
  - [ ] 13.1 Add auth API functions
    - `login(username, password)`, `register(username, password)`, `logout()`, `getSession()`
    - _Requirements: 19.3, 19.5, 19.7, 19.9_
  - [ ] 13.2 Add user management API functions
    - `getUsers()`, `createUser(username, password)`, `deleteUser(id)`, `setUserRole(id, isAdmin)`
    - _Requirements: 21.1, 21.2, 21.3, 21.4_
  - [ ] 13.3 Add progress API functions
    - `updateProgress(comicId, page, completed)`, `clearProgress(comicId)`
    - _Requirements: 9.2, 9.3_
  - [ ] 13.4 Add bookmark API functions
    - `createBookmark(comicId, page)`, `getBookmarks(comicId)`, `updateBookmark(comicId, bookmarkId, note)`, `deleteBookmark(comicId, bookmarkId)`
    - _Requirements: 10.2, 10.3, 10.4, 10.6_
  - [ ] 13.5 Add history API functions
    - `logHistory(comicId, action, page)`, `getHistory(offset, limit)`
    - _Requirements: 11.1, 11.5_
  - [ ] 13.6 Add series API functions
    - `getSeries()`, `getSeriesComics(name)`
    - _Requirements: 13.5, 14.3_
  - [ ] 13.7 Add favorites API functions
    - `addFavorite(comicId)`, `removeFavorite(comicId)`
    - _Requirements: 23.2, 23.3_
  - [ ] 13.8 Add metadata API functions
    - `searchMetadata(comicId, query)`, `applyMetadata(comicId, metadata)`
    - _Requirements: 25.1, 25.4_
  - [ ] 13.9 Add settings API functions
    - `setGuestAccess(enabled)`
    - _Requirements: 22.5_
  - [ ] 13.10 Update `pageUrl()` and `thumbnailUrl()` to accept optional `width` param
    - _Requirements: 17.6_

- [ ] 14. Implement comic reader zoom modes
  - [ ] 14.1 Add zoom mode controller to `reader.js`
    - Support `fit-width`, `fit-height`, `original` modes
    - Apply CSS styles to `#comic-page-img` based on mode
    - Persist to `localStorage`, restore on next session
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7_
  - [ ] 14.2 Add zoom mode toggle button to reader toolbar
    - Cycles through modes on each tap
    - _Requirements: 1.5_

- [ ] 15. Implement pinch-to-zoom
  - [ ] 15.1 Add pinch gesture handler to `reader.js`
    - Track two-touch distance changes, apply CSS `transform: scale()`
    - Clamp scale to 1×–5×
    - Allow single-finger pan when zoomed
    - Suppress swipe navigation when scale > 1
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
  - [ ] 15.2 Add double-tap to toggle 2× zoom
    - Toggle between current fit scale and 2× centered on tap point
    - _Requirements: 2.4_

- [ ] 16. Implement comic spread mode
  - [ ] 16.1 Add spread mode to `reader.js`
    - Render two `<img>` elements side by side in flex container
    - Solo display for first page (cover) and last page of odd-total comics
    - Navigation advances by 2 pages
    - Page slider/label reflects left-most visible page
    - Persist to `localStorage`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 17. Implement webtoon vertical scroll mode
  - [ ] 17.1 Add webtoon mode to `reader.js`
    - Replace single-page viewer with scrollable container of stacked full-width images
    - Lazy load with IntersectionObserver (2-page buffer)
    - Track most-visible page for progress updates
    - Disable tap zones and swipe navigation
    - Persist to `localStorage`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ] 18. Implement fullscreen reading
  - [ ] 18.1 Add fullscreen toggle to reader toolbar
    - Call `requestFullscreen()` / `exitFullscreen()` on `#reader-overlay`
    - Hide button if API unavailable
    - Update icon on `fullscreenchange` event
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 19. Implement smooth page transitions
  - [ ] 19.1 Add page transition system to `reader.js`
    - Support `none`, `slide` (250ms translateX), `fade` (200ms opacity)
    - Block navigation during animation
    - No effect in webtoon mode
    - Persist to `localStorage`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 20. Implement reading direction toggle
  - [ ] 20.1 Add direction toggle to reader toolbar
    - LTR/RTL toggle button
    - Reverse tap zone and swipe mappings for RTL
    - Keep keyboard arrows unchanged
    - Swap spread page positions for RTL
    - Persist to `localStorage`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 21. Implement screen wake lock
  - [ ] 21.1 Add wake lock to `reader.js`
    - Acquire on reader open, release on close
    - Re-acquire on visibility change back to visible
    - Silent no-op if API unavailable
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 22. Implement bookmark UI in reader
  - [ ] 22.1 Add bookmark toggle button to reader toolbar
    - Show filled/unfilled state based on current page
    - Tap to create/delete bookmark
    - Long-press to add/edit note
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - [ ] 22.2 Add bookmarks list panel in reader
    - List all bookmarks for current comic sorted by page
    - Show page number, note, thumbnail preview
    - Tap to navigate to bookmarked page
    - _Requirements: 10.6, 10.7_

- [ ] 23. Implement orientation lock
  - [ ] 23.1 Add orientation lock toggle to reader toolbar
    - Lock portrait for single-page, landscape for spread mode
    - Unlock on deactivate or reader close
    - Hide if API unavailable or rejected
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [ ] 24. Implement mark as read / mark as unread in library
  - [ ] 24.1 Add "Mark as read" / "Mark as unread" to card context menu
    - Show appropriate option based on current Read_Status
    - Call progress API, update card badges without full reload
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 25. Implement read-status filter in library
  - [ ] 25.1 Add read-status filter strip to `library.js`
    - Pill buttons: All, Unread, In Progress, Completed
    - Send `readStatus` param to API
    - Compose with existing filters
    - _Requirements: 12.1, 12.2, 12.6_

- [ ] 26. Implement series grouping in library
  - [ ] 26.1 Add Series_Card rendering to `library.js`
    - Group comics by `series_name`, render one card per series
    - Show cover of lowest-numbered volume, series name, volume count badge
    - Standalone cards for comics with null `series_name`
    - Respect active filters
    - _Requirements: 14.1, 14.2, 14.5, 14.6_
  - [ ] 26.2 Add series detail view (`#/series/:name` route)
    - Display individual comic cards sorted by volume then chapter
    - Show volume/chapter labels and per-volume progress
    - _Requirements: 14.3, 14.4_

- [ ] 27. Implement virtual scrolling grid
  - [ ] 27.1 Add virtual grid to `library.js`
    - Activate when totalCount > 200
    - Create DOM nodes only for visible cards + 2-row buffer
    - Spacer element for correct scrollbar
    - Support all existing interactions (click, selection, context menu, keyboard)
    - Fall back to non-virtualized for ≤ 200 items
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

- [ ] 28. Implement pull-to-refresh on mobile
  - [ ] 28.1 Add pull-to-refresh gesture to `library.js`
    - Detect overscroll > 80px at scrollTop ≤ 0 on mobile
    - Show spinner indicator, re-fetch and re-render grid
    - Guard against concurrent refreshes
    - Disabled on desktop
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

- [ ] 29. Implement continue reading shelf
  - [ ] 29.1 Add Continue_Reading_Shelf to `library.js`
    - Render on `#/` route for authenticated users
    - Horizontal scrollable row of small cards with cover, title, progress
    - Tap to open at last-read page
    - Hidden when no progress data or for guests
    - "See all" link to `#/recent`
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7, 24.8, 24.9_

- [ ] 30. Implement favorites UI
  - [ ] 30.1 Add favorite toggle (heart icon) to comic cards and reader toolbar
    - Call `addFavorite` / `removeFavorite` API
    - Hidden for guests
    - _Requirements: 23.6, 23.8_
  - [ ] 30.2 Add "My Favorites" filter option in library
    - Send `favorites=true` param to API
    - Hidden for guests
    - _Requirements: 23.7_

- [ ] 31. Implement auth UI
  - [ ] 31.1 Create `src/web/auth.js` with login form
    - Username + password fields, call `api.login()`
    - Show inline error on invalid credentials
    - _Requirements: 19.3, 19.4_
  - [ ] 31.2 Add guest mode detection to `app.js`
    - On init, check `GET /api/auth/session`
    - If not authenticated and guest access disabled, show login form
    - If not authenticated and guest access enabled, show read-only library
    - _Requirements: 22.6, 22.7_
  - [ ] 31.3 Add user management panel (admin only)
    - List users, create user, promote/demote, delete
    - Accessible from admin menu
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_
  - [ ] 31.4 Add guest access toggle to admin settings
    - _Requirements: 22.5_

- [ ] 32. Implement reading history UI
  - [ ] 32.1 Add history logging to reader open/close
    - Call `api.logHistory()` on reader open and close
    - _Requirements: 11.1, 11.2_
  - [ ] 32.2 Add `#/history` route and history view
    - Display entries in reverse chronological order, grouped by date
    - Show comic title, action, page, timestamp
    - Tap to navigate to `#/read/:comicId/:page`
    - _Requirements: 11.3, 11.4_

- [ ] 33. Implement metadata UI
  - [ ] 33.1 Add metadata search dialog (admin only)
    - Trigger from card context menu or detail view
    - Search external APIs, present candidate matches
    - On selection, apply metadata via API
    - _Requirements: 25.1, 25.3, 25.4_
  - [ ] 33.2 Add metadata edit form (admin only)
    - Editable fields: title, author, artist, genre, year, summary
    - Pre-fill with current values
    - Save via `PUT /api/comics/:id/metadata`
    - _Requirements: 26.1, 26.2, 26.3_
  - [ ] 33.3 Add read-only metadata display for all users
    - Show metadata fields in comic detail view
    - Hide edit controls for non-admins
    - _Requirements: 26.6, 26.7_

- [ ] 34. Add CSS for new reader controls and library features
  - [ ] 34.1 Reader toolbar button styles (zoom, spread, webtoon, direction, fullscreen, bookmark, orientation lock)
  - [ ] 34.2 Webtoon mode scrollable container styles
  - [ ] 34.3 Spread mode two-page flex layout
  - [ ] 34.4 Read-status filter strip styles
  - [ ] 34.5 Series card badge and series detail view styles
  - [ ] 34.6 Continue Reading shelf horizontal scroll styles
  - [ ] 34.7 Favorite heart icon styles
  - [ ] 34.8 Login form and user management panel styles
  - [ ] 34.9 Metadata search dialog and edit form styles
  - [ ] 34.10 Pull-to-refresh spinner styles
  - [ ] 34.11 Bookmarks list panel styles

- [ ] 35. Checkpoint — Full end-to-end verification
  - Run `pnpm run typecheck` and `pnpm test`

- [ ]* 36. Property-based tests for correctness properties
  - [ ]* 36.1 Zoom mode cycling (Property 1) and localStorage round-trip (Property 2)
    - _Validates: Requirements 1.5, 1.6, 3.5, 4.6, 6.4, 7.6_
  - [ ]* 36.2 Pinch zoom clamping (Property 3) and swipe suppression (Property 4)
    - _Validates: Requirements 2.2, 2.5_
  - [ ]* 36.3 Spread mode page layout (Property 5)
    - _Validates: Requirements 3.3, 3.4, 3.6, 7.5_
  - [ ]* 36.4 Webtoon lazy-load buffer (Property 6)
    - _Validates: Requirements 4.3_
  - [ ]* 36.5 Direction-dependent navigation mapping (Property 7)
    - _Validates: Requirements 7.2, 7.3, 7.4_
  - [ ]* 36.6 Read status menu option and filter correctness (Properties 8, 9)
    - _Validates: Requirements 9.1, 12.3, 12.4, 12.5, 12.6_
  - [ ]* 36.7 Series filename parsing, normalization, and grouping (Properties 10, 11, 12)
    - _Validates: Requirements 13.1, 13.3, 13.4, 14.1, 14.5_
  - [ ]* 36.8 Image resize width clamping (Property 13)
    - _Validates: Requirements 17.3_
  - [ ]* 36.9 Virtual grid visible row calculation (Property 14)
    - _Validates: Requirements 18.1, 18.2, 18.4_
  - [ ]* 36.10 Per-user data isolation (Property 15)
    - _Validates: Requirements 20.2, 20.3, 20.6, 20.7_
  - [ ]* 36.11 Role-based access control (Property 16) and guest access control (Property 17)
    - _Validates: Requirements 21.6, 21.7, 21.8, 22.2, 22.3, 22.4_
  - [ ]* 36.12 Genre field validation (Property 18)
    - _Validates: Requirements 26.5_

- [ ] 37. Final checkpoint — Ensure all tests pass

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Tasks 1–12 are server-side foundation; tasks 13–34 are client-side features
- Database migrations use the existing `migrateSchema()` pattern (PRAGMA table_info + ALTER TABLE ADD COLUMN)
- New tables use IF NOT EXISTS for idempotency
- The existing admin password is migrated to the first user in the `users` table on first startup
- All per-user data (progress, bookmarks, history, favorites) uses foreign keys with ON DELETE CASCADE
- Property tests use fast-check with the existing Vitest setup, minimum 100 iterations per property
- Run `pnpm run typecheck` at each checkpoint to catch integration issues early
