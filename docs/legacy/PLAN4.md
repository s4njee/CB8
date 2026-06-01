# PLAN4: Web UI Improvement Backlog

Goal: make the CB8 Web UI feel like a reliable companion reader for phones, tablets, and secondary computers on the local network. PLAN3 established the embedded HTTP server, REST API, and static vanilla SPA. PLAN4 focuses on polish, mobile ergonomics, safety, and richer reading workflows without turning the Web UI into a full duplicate of the Electron app.

## Current Baseline

- The Electron main process serves a built-in HTTP server from `src/main/webServer.ts`.
- The web API exposes library browsing, thumbnails, archive page images, full book files, tags, folders, libraries, recently read records, and reading progress updates.
- Static files are served from `src/web/` in development and from bundled resources in packaged builds.
- The Web UI is intentionally dependency-light: vanilla HTML/CSS/JS, no build step.
- The web server is LAN-facing when enabled and currently does not require authentication.

## Design Principles

1. Keep the Web UI reader-first. Browsing, search, and reading should be excellent; deep library management can stay in the desktop app unless there is a clear mobile workflow.
2. Stay mobile-first. Phone and tablet layouts matter more than desktop parity.
3. Preserve privacy by default. Do not expose filesystem paths in web responses.
4. Avoid heavy frontend tooling unless the no-build SPA becomes the bottleneck.
5. Make LAN access understandable: users should know when the server is on, where it is reachable, and who can access it.

## Phase 1: Library Browsing Polish

Problem: the web library should be quick to scan on a phone and should make books/comics/folders/libraries easy to switch between.

Implementation ideas:

- Add top-level tabs for `Books`, `Comics`, `Libraries`, `Folders`, and `Recent`.
- Add a compact search bar that remains sticky at the top of mobile screens.
- Add filter chips for file type: `EPUB`, `PDF`, `CBZ`, `CBR`, and `MOBI`.
- Add sort controls for title, recently read, date added, size, and page count.
- Show progress badges on cards: percent complete for comics/PDFs, and `In progress` for EPUBs with saved locations.
- Show format badges using `fileExt` from `WebComicRecord`.
- Improve empty states: no server connection, no results, no recent items, no cover image.
- Keep card dimensions stable so covers loading late do not shift the layout.

API changes:

- Extend `/api/comics` to support `sortBy=lastRead` if needed.
- Consider `GET /api/stats` for counts by media type and file extension.

Acceptance checks:

- A phone can search and filter a 1,000+ item library without layout jumps.
- Recent items and active progress are visible without opening the desktop app.

## Phase 2: Mobile Reader Ergonomics

Problem: reading from a phone or tablet needs touch-first controls and predictable fullscreen behavior.

Implementation ideas:

- Add tap zones: left/right for previous/next, center for toolbar toggle.
- Add swipe gestures for page turns in comic/PDF readers.
- Add a bottom progress scrubber with page number and total page count.
- Add quick buttons for fit width, fit height, and original size for comic pages.
- Add reading direction options: left-to-right and right-to-left.
- Add fullscreen support using the browser Fullscreen API.
- Add orientation-friendly layouts for tablets.
- Keep controls auto-hidden while reading, with large enough touch targets.

API changes:

- Current `/api/comics/:id/pages/:page` is sufficient for comic pages.
- Progress can continue using `PUT /api/comics/:id/progress`.

Acceptance checks:

- Reading a CBZ on a phone works one-handed.
- Progress saves reliably after page turns and restores after reload.

## Phase 3: EPUB and PDF Web Reading

Problem: the desktop app has EPUB/PDF support, but the Web UI should make these formats pleasant instead of only serving raw files.

Implementation ideas:

- Use browser-native PDF viewing as an initial fallback via `/api/comics/:id/file`.
- Add a simple PDF reader shell around native PDF embedding or PDF.js later.
- Add EPUB rendering with a lightweight client-side reader if the no-build constraint remains acceptable.
- Provide EPUB theme controls: light/dark, font family, font size, margins.
- Persist EPUB location via `PUT /api/comics/:id/progress` with `location`.
- Show clear unsupported states for MOBI unless a browser-compatible path is added.

Tradeoffs:

- PDF.js and EPUB.js improve reading quality but add frontend dependencies or vendored assets.
- Native browser PDF support is simpler but inconsistent on mobile browsers.

Acceptance checks:

- Opening an EPUB from the Web UI resumes near the last saved location.
- Opening a PDF displays the document and preserves the last page when possible.

## Phase 4: Server Safety and Access Control

Problem: the server binds to LAN and exposes readable library content. Users need basic protection on shared networks.

Implementation ideas:

- Add optional PIN/password authentication for the Web UI.
- Store an auth setting in `app_meta`, never in source files.
- Add a simple login screen with a session cookie.
- Protect all `/api/*` routes and static reader routes when auth is enabled.
- Add a one-click "Reset Web Sessions" desktop setting.
- Add a visible warning in Settings when the server is enabled without auth.
- Consider binding options: localhost only vs LAN.

API changes:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/status`

Acceptance checks:

- With auth enabled, direct API URLs return 401 until login.
- Existing LAN setup still works when auth is disabled.

## Phase 5: Discoverability and Device Setup

Problem: users should not have to manually type URLs or inspect console logs.

Implementation ideas:

- Show local and LAN URLs in the desktop Settings dialog.
- Add QR code display for the LAN URL.
- Add copy buttons for both URLs.
- Add server status indicator in the desktop menu or status bar.
- Add "Open Web UI" menu item that is enabled only when the server is running.
- Add a small `/api/health` endpoint for connection checks.
- Add friendly mobile landing state if the desktop server is offline or unreachable.

Acceptance checks:

- A user can enable the server and open it on a phone in under 30 seconds.
- The UI clearly reports when the chosen port is unavailable.

## Phase 6: Performance and Caching

Problem: large libraries and page images can make the Web UI feel slow over Wi-Fi.

Implementation ideas:

- Add HTTP `ETag` or `Last-Modified` headers for thumbnails and page images.
- Add client-side thumbnail lazy loading with `IntersectionObserver`.
- Add in-memory client cache for current/next/previous comic pages.
- Add server-side thumbnail cache headers tuned for stable cover images.
- Add pagination controls that do not refetch already loaded pages.
- Add request cancellation in the web reader when users turn pages quickly.
- Add a small loading skeleton for cards and pages.

Server changes:

- Keep the existing archive handle LRU, but expose basic debug logging for cache hits/misses during development.
- Consider a page-image response cache only if profiling shows archive reads dominate.

Acceptance checks:

- Scrolling a large library does not issue unbounded thumbnail requests.
- Rapid comic page turns do not queue stale requests indefinitely.

## Phase 7: Offline-Like PWA Polish

Problem: the Web UI should feel installable on mobile even though content is served from the desktop app.

Implementation ideas:

- Add `manifest.json` with CB8 name, icons, display mode, and theme color.
- Add a service worker for static assets only.
- Do not cache private library content by default.
- Add "Add to Home Screen" friendly metadata.
- Use `viewport-fit=cover` and safe-area CSS variables for iOS.

Acceptance checks:

- On iOS/Android, the Web UI can be saved to the home screen with CB8 branding.
- Static assets load quickly on repeat visits while library content stays live.

## Phase 8: Limited Web Library Management

Problem: some lightweight management tasks are useful from a phone, but risky destructive operations should remain cautious.

Implementation ideas:

- Add tag viewing and tag assignment from item detail pages.
- Add "mark as unread" or "clear progress" actions.
- Add library/folder membership changes for selected items.
- Add read-only item details: title, format, size, pages, date added, last read.
- Avoid file deletion from the Web UI.

API changes:

- `PUT /api/comics/:id/tags`
- `DELETE /api/comics/:id/progress`
- `PUT /api/libraries/:id/comics`
- `PUT /api/folders/:id/comics`

Acceptance checks:

- Web mutations are limited, intentional, and easy to undo where possible.
- No endpoint deletes source files from disk.

## Phase 9: Robustness and Testing

Problem: Web UI behavior touches network, filesystem, archive loading, and browser APIs. Failures should be graceful.

Implementation ideas:

- Add focused tests for `webServer.ts` route behavior using temporary databases.
- Test API path traversal rejection.
- Test missing source files return clean errors.
- Test `/api/comics/:id/pages/:page` out-of-range responses.
- Test progress updates for page and EPUB location.
- Add manual test checklist for phone, tablet, desktop browser, and packaged app.

Manual checklist:

- Enable/disable server from Settings.
- Open Web UI locally.
- Open Web UI from phone on LAN.
- Browse books and comics.
- Read a CBZ and save progress.
- Open EPUB/PDF routes.
- Confirm filesystem paths are not exposed in JSON.
- Confirm packaged app serves static assets.

## Suggested Implementation Order

1. Browsing polish and mobile layout.
2. Reader gestures and progress controls.
3. Server discoverability: QR code, status, health endpoint.
4. Authentication/PIN.
5. EPUB/PDF web reading improvements.
6. Performance/caching.
7. PWA polish.
8. Limited management actions.
9. Automated web-server tests.

## Open Questions

- Should authentication be mandatory whenever binding to LAN, or optional with a warning?
- Should the Web UI support library editing, or stay mostly read-only?
- Is no-build vanilla JS still the right constraint, or should Web UI complexity justify a small Vite build?
- Should EPUB/PDF web reading reuse vendored `epubjs`/`pdfjs-dist`, or lean on browser-native rendering first?
- Should remote devices be allowed to download full source files, or only stream/read them?
