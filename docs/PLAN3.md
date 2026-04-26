# PLAN3: Web UI — Self-Hosted Ebook & Comic Reader

Goal: add an embedded HTTP server to the CB8 Electron app that serves a minimalistic, mobile-friendly web interface for browsing the library and reading comics/ebooks from any device on the local network.

Baseline docs:
- `AGENTS.md`
- `src/main/libraryDatabase.ts` — SQLite database with comics, libraries, folders, tags, reading progress
- `src/main/archiveLoader.ts` — CBZ / CBR page extraction
- `src/main/ipcHandlers.ts` — existing IPC handlers that the web API mirrors
- `src/shared/types.ts` — `ComicRecord`, `QueryOptions`, `QueryResult`

## Architecture Overview

```
┌──────────────────────────────────────────┐
│              Electron Main Process       │
│                                          │
│  ┌────────────┐    ┌──────────────────┐  │
│  │ LibraryDB  │◄───│  HTTP Server     │  │
│  │ (SQLite)   │    │  (Node http)     │  │
│  └────────────┘    │                  │  │
│  ┌────────────┐    │  /api/*  ──► JSON│  │
│  │ Archive    │◄───│  /read/* ──► img │  │
│  │ Loader     │    │  /       ──► SPA │  │
│  └────────────┘    └──────────────────┘  │
│                          ▲               │
│  ┌────────────┐          │               │
│  │ IPC        │   localhost:port         │
│  │ Handlers   │          │               │
│  └────────────┘          │               │
└──────────────────────────┼───────────────┘
                           │
               ┌───────────┴───────────┐
               │  Browser (any device) │
               │  ┌─────────────────┐  │
               │  │  Vanilla SPA    │  │
               │  │  HTML/CSS/JS    │  │
               │  └─────────────────┘  │
               └───────────────────────┘
```

The web UI is a separate, standalone vanilla HTML/CSS/JS single-page app. It does **not** share renderer code with the Electron UI. The HTTP server runs inside the main process alongside the existing IPC handlers and reuses `LibraryDatabase` and `ArchiveLoader` directly — no IPC indirection.

## Phase 1: Embedded HTTP Server

Problem: there is no HTTP server. The library data and archive files are only accessible through Electron IPC.

### Step 1.1: Create the server module

Create `src/main/webServer.ts`:

- Import Node's built-in `http` module (no Express, no Koa — keep it dependency-free).
- Export a `startWebServer(db: LibraryDatabase, port?: number): http.Server` function.
- Default port: `8008` (mnemonic: CB**8**).
- Bind to `0.0.0.0` so LAN devices can connect.
- Add a simple router that dispatches on `req.url` prefix:
  - `/api/*` → JSON API handlers (Phase 2)
  - `/read/*` → page image streaming (Phase 3)
  - `/*` → static file serving for the SPA (Phase 5)
- Return 404 with a JSON `{ error: "Not found" }` for unmatched routes.
- Add CORS headers (`Access-Control-Allow-Origin: *`) so the SPA works during development from a different port.

### Step 1.2: Wire into the app lifecycle

In `src/main/index.ts`:

- After `db.initialize()` and `registerIpcHandlers(db)`, call `startWebServer(db)`.
- Store the server reference so it can be closed on `app.quit()`.
- Log the URL to the console: `Web UI available at http://localhost:8008`.

### Step 1.3: Expose the server address in the Electron UI

- Add a menu item or status indicator in the Electron window showing the web UI URL.
- Optionally show the machine's LAN IP so users can type it into their phone/tablet.

Acceptance checks:
- `curl http://localhost:8008/` returns a response after launching the app.
- The server starts and stops cleanly with the app lifecycle.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

---

## Phase 2: JSON REST API

Problem: the web SPA needs structured data. The existing data access is locked behind Electron IPC.

### Step 2.1: Library browsing endpoints

Implement these routes in `src/main/webServer.ts` (or a dedicated `src/main/webApi.ts` router module):

| Method | Path | Description | Maps to |
|--------|------|-------------|---------|
| `GET` | `/api/comics` | Query comics (paginated, sortable, searchable) | `db.queryComics(options)` |
| `GET` | `/api/comics/:id` | Single comic metadata | `db.getComic(id)` |
| `GET` | `/api/comics/:id/thumbnail` | Cover thumbnail as JPEG/WebP binary | `db.getComic(id).coverThumbnail` |
| `GET` | `/api/comics/:id/pages/:page` | Single page image from archive | `ArchiveLoader` (Phase 3) |
| `GET` | `/api/libraries` | List libraries | `db.getAllLibraries()` |
| `GET` | `/api/libraries/:id/comics` | Comics in a library | `db.queryComicsByLibrary(id, options)` |
| `GET` | `/api/folders` | List folders | `db.getAllFolders()` |
| `GET` | `/api/folders/:id/comics` | Comics in a folder | `db.getFolderComics(id, options)` |
| `GET` | `/api/tags` | All tags | `db.getAllTags()` |
| `GET` | `/api/recently-read` | Recently read items | `db.getRecentlyRead()` |
| `PUT` | `/api/comics/:id/progress` | Update reading progress | `db.updateReadingProgress()` / `db.updateReadingLocation()` |

Query parameters for listing endpoints:
- `search` — search term
- `tag` — filter by tag
- `sortBy` — `title`, `dateAdded`, `fileSize`, `pageCount`
- `sortOrder` — `asc`, `desc`
- `offset`, `limit` — pagination
- `mediaType` — `comic` or `book`

### Step 2.2: Response format

All API responses use JSON. Comic records are serialized without `coverThumbnail` (binary) — thumbnails are fetched as separate image requests. Strip the `filePath` field from web API responses (do not expose server filesystem paths to network clients).

```typescript
interface WebComicRecord {
  id: number;
  title: string;
  pageCount: number;
  fileSize: number;
  dateAdded: string;
  tags: string[];
  lastPage: number | null;
  lastRead: string | null;
  mediaType: 'comic' | 'book';
  thumbnailUrl: string;  // "/api/comics/:id/thumbnail"
}
```

### Step 2.3: Request parsing helpers

Write a small utility to:
- Parse URL path parameters (`:id`, `:page`) from the URL.
- Parse query string into a typed `QueryOptions` object.
- Parse JSON request bodies for `PUT` endpoints.
- Return typed error responses with appropriate HTTP status codes.

Acceptance checks:
- `GET /api/comics?limit=10` returns a JSON array of comic summaries.
- `GET /api/comics/1/thumbnail` returns image bytes with the correct `Content-Type`.
- `PUT /api/comics/1/progress` with `{ "page": 5 }` updates the reading progress.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

---

## Phase 3: Page Streaming for Comics

Problem: the web reader needs to display individual comic pages. `ArchiveLoader` is stateful (it holds an open file handle) and designed for single-user Electron use.

### Step 3.1: Per-request archive access

For the web server, do **not** reuse the single `currentHandle` from `ipcHandlers.ts`. Instead:

- For each `/api/comics/:id/pages/:page` request:
  1. Look up the comic's `filePath` from the database.
  2. Open the archive with `ArchiveLoader.open(filePath)`.
  3. Extract the requested page with `ArchiveLoader.getPage(handle, pageIndex)`.
  4. Close the handle with `ArchiveLoader.close(handle)`.
  5. Stream the image bytes back with the correct MIME type.

This is simple but opens/closes the archive per request.

### Step 3.2: Archive handle cache (optimization)

Add a bounded LRU cache of open archive handles keyed by `comicId`:

- Cache capacity: 3–5 open archives.
- On cache eviction, close the handle.
- On server shutdown, close all cached handles.
- Add a TTL (e.g. 5 minutes idle) to avoid holding file locks indefinitely.

This avoids re-opening the same archive for consecutive page requests during reading.

### Step 3.3: MIME type detection

Reuse the extension-to-MIME map already in `ipcHandlers.ts`:

```typescript
const mimeMap: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  avif: 'image/avif', jxl: 'image/png',
};
```

Set `Content-Type` and `Cache-Control: public, max-age=86400` on page responses (page images are immutable for a given archive).

### Step 3.4: Book file serving

For EPUB and PDF files, serve the raw file bytes:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/comics/:id/file` | Full file download (EPUB/PDF) |

Set `Content-Type` to `application/epub+zip` or `application/pdf` based on extension. The web EPUB/PDF reader will fetch the entire file and render it client-side (same approach as the Electron renderer).

Acceptance checks:
- `GET /api/comics/1/pages/0` returns the first page image of a CBZ.
- `GET /api/comics/2/file` returns EPUB bytes.
- Rapidly requesting pages 0–10 reuses the cached handle (visible in logs).
- Cache eviction closes old handles.
- `pnpm run typecheck` passes.

---

## Phase 4: Web SPA — Library Browser

Problem: there is no web frontend. Phase 4 builds the library browsing UI.

### Step 4.1: Project structure

Create `src/web/` as a self-contained vanilla SPA:

```
src/web/
├── index.html       # Single entry point
├── style.css        # All styles
├── app.js           # SPA router and shared state
├── api.js           # Fetch wrappers for /api/*
├── views/
│   ├── library.js   # Grid of comics/books
│   └── reader.js    # Comic page reader
│   └── bookReader.js # EPUB/PDF reader
└── components/
    ├── comicCard.js  # Single card in the grid
    └── navbar.js     # Top navigation bar
```

No build step. No framework. No bundler. The server serves these files directly from disk. During development this is instant; for production, they ship inside the Electron app's resources.

### Step 4.2: Design system

Minimalistic dark theme consistent with the CB8 Electron UI:

- Background: `#0a0a0a` / `#111`
- Card surface: `#1a1a1a` with subtle `1px` border `#2a2a2a`
- Accent color: muted blue `#4a9eff`
- Typography: system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`)
- Grid: CSS Grid with `auto-fill` and `minmax(160px, 1fr)` — naturally responsive
- Transitions: `150ms ease` on hover/active states
- Mobile: touch-friendly tap targets (min 44px), no hover-dependent interactions

### Step 4.3: API client (`api.js`)

Thin `fetch` wrappers:

```javascript
const API_BASE = '';  // Same origin

export async function fetchComics(options = {}) {
  const params = new URLSearchParams(options);
  const res = await fetch(`${API_BASE}/api/comics?${params}`);
  return res.json();
}

export async function fetchThumbnailUrl(comicId) {
  return `${API_BASE}/api/comics/${comicId}/thumbnail`;
}

// ... etc for libraries, folders, tags, progress
```

### Step 4.4: Library view (`views/library.js`)

- Top bar: CB8 logo/text, search input, sort dropdown, media type filter (comics / books / all).
- Grid: lazy-loaded comic cards with cover thumbnails.
- Cards: thumbnail image, title below, subtle progress indicator if partially read.
- Infinite scroll: `IntersectionObserver` on a sentinel element triggers loading the next page.
- Click card → navigate to the reader view.
- Sidebar (collapsible on mobile): libraries list, folders list, tags list, recently read.

### Step 4.5: SPA router (`app.js`)

Hash-based routing for simplicity (no server-side routing needed):

- `#/` → library view (all comics)
- `#/library/:id` → comics in a specific library
- `#/folder/:id` → comics in a specific folder
- `#/tag/:name` → comics filtered by tag
- `#/read/:id` → comic reader
- `#/read/:id/:page` → comic reader at specific page

The router listens to `hashchange`, tears down the current view, and mounts the new one.

Acceptance checks:
- Opening `http://localhost:8008` shows the library grid with cover thumbnails.
- Search filters results in real time (debounced).
- Clicking a card navigates to `#/read/:id`.
- The grid is responsive: 1 column on phones, 4–6 on tablets, 6–8 on desktop.
- `pnpm run typecheck` passes.

---

## Phase 5: Web SPA — Comic Reader

Problem: the web UI can browse but not read. Phase 5 adds the reading experience.

### Step 5.1: Comic reader view (`views/reader.js`)

For CBZ/CBR (image-based comics):

- Full-viewport display of one page at a time.
- Page image loaded from `/api/comics/:id/pages/:page`.
- Preload next page while viewing current page.
- Navigation:
  - Tap/click left third → previous page.
  - Tap/click right third → next page.
  - Swipe left/right on touch devices.
  - Arrow keys on desktop.
- Minimal chrome: page number overlay (`3 / 24`) fades after 2 seconds of inactivity.
- Tap center → toggle toolbar visibility (back button, page slider, fit mode toggle).
- Fit modes: fit-width (default on mobile), fit-page (default on desktop).
- Progress saved on every page turn via `PUT /api/comics/:id/progress`.

### Step 5.2: Book reader view (`views/bookReader.js`)

For EPUB:

- Fetch the full EPUB file from `/api/comics/:id/file`.
- Use `epub.js` loaded from a CDN or bundled as a static file.
- Paginated layout matching the Electron EPUB reader behavior.
- Dark background, light text.
- Tap/swipe/arrow navigation between pages.
- Chapter display in the toolbar.
- Progress (CFI location) saved on each page turn.

For PDF:

- Fetch the full PDF file from `/api/comics/:id/file`.
- Use `pdf.js` loaded from a CDN or bundled as a static file.
- Single-page view, canvas-based rendering.
- Same navigation patterns as the comic reader.
- Page number progress saved on each page turn.

### Step 5.3: Resume reading

- When opening a comic/book, check `lastPage` / `lastLocation` from the API.
- If the user has previous progress, jump to that position automatically.
- Show a subtle toast: "Resuming from page 12."

### Step 5.4: Mobile optimization

- Prevent zoom on the reader page (`<meta name="viewport" content="...user-scalable=no">`).
- Use touch event handlers for swipe gestures (threshold: 50px horizontal swipe).
- Hide the browser address bar: use `display: standalone` in a web app manifest.
- Add a minimal `manifest.json` so the web UI can be "installed" as a PWA-like shortcut on mobile home screens.

Acceptance checks:
- Navigating to `#/read/1` loads and displays the first page of a CBZ comic.
- Swiping left/right navigates pages on a phone.
- Page progress is saved and restored on re-open.
- EPUB and PDF files render correctly.
- The reader is usable on a phone screen.

---

## Phase 6: Static File Serving

Problem: the SPA files need to be served by the embedded HTTP server.

### Step 6.1: Development serving

During `pnpm start` (Electron dev mode), serve files from `src/web/` on disk. Use `fs.readFile` with the correct `Content-Type` based on file extension.

MIME map for static files:
```typescript
const staticMimes: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
```

### Step 6.2: Production bundling

In `forge.config.ts`, ensure `src/web/` is copied into the packaged app's resources directory. The server resolves the static root based on whether it's in dev mode (`src/web/`) or production (`resources/web/` inside the ASAR or unpacked directory).

### Step 6.3: Security considerations

- **Path traversal**: sanitize the requested file path. Reject any path containing `..` or that resolves outside the static root.
- **No file uploads**: the web server is read-only (except for progress updates via PUT).
- **No authentication** in the initial version — the server binds to the LAN. Document this clearly. Authentication can be added later (Phase 8 stretch goal).

Acceptance checks:
- `GET /` serves `index.html`.
- `GET /style.css` serves the CSS with correct content type.
- `GET /../../../etc/passwd` returns 403 or 404.
- Packaged app serves the web UI from bundled resources.
- `pnpm run typecheck` passes.

---

## Phase 7: Settings and Discoverability

Problem: users need to know the server is running and how to connect.

### Step 7.1: Web server toggle

Add an IPC channel and UI control to enable/disable the web server:

- Store the preference in `app_meta` table: `web_server_enabled` (default: `true`).
- Store the port in `app_meta` table: `web_server_port` (default: `8008`).
- Add a settings section in the Electron UI (or a menu item) to toggle the server and change the port.

### Step 7.2: Connection info display

In the Electron UI, show:
- Server status: running / stopped.
- URL: `http://<lan-ip>:8008`.
- QR code of the URL (generate a simple QR code SVG or use a small library) for easy phone scanning.

### Step 7.3: Web app manifest

Create `src/web/manifest.json`:

```json
{
  "name": "CB8",
  "short_name": "CB8",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

This lets mobile users add the reader to their home screen for an app-like experience.

Acceptance checks:
- Toggling the server off stops accepting HTTP connections.
- The QR code scans correctly on a phone and opens the web UI.
- Adding to home screen on iOS/Android creates an app-like shortcut.
- `pnpm run typecheck` passes.

---

## Suggested Implementation Order

1. **Phase 1**: Embedded HTTP Server — get a response from `curl`.
2. **Phase 2**: JSON REST API — library data accessible via `fetch`.
3. **Phase 3**: Page Streaming — comic images served over HTTP.
4. **Phase 6**: Static File Serving — SPA files accessible from the server.
5. **Phase 4**: Web SPA Library Browser — browse covers in a browser.
6. **Phase 5**: Web SPA Reader — read comics and books in a browser.
7. **Phase 7**: Settings and Discoverability — polish the experience.

Phase 6 is moved earlier because Phases 4 and 5 need it to serve the SPA files during development.

## Verification Checklist for Each Phase

```sh
pnpm run typecheck
pnpm test
```

Manual testing:
- Desktop: open `http://localhost:8008` in Chrome/Firefox.
- Mobile: connect to the same URL over LAN from a phone.
- Tablet: test the responsive grid and reader at medium viewport sizes.

## Stretch Goals (Not Scoped Here)

- **Authentication**: optional password/PIN to protect the web UI on shared networks.
- **WebSocket progress sync**: push reading progress changes to all connected clients in real time.
- **OPDS feed**: expose the library as an OPDS catalog for third-party reader apps.
- **Service worker / offline cache**: cache the SPA shell for instant load, cache recently read pages.
- **Web-based library management**: add/remove comics, create folders, manage tags from the web UI (currently read-only except for progress).

## Design Principles

1. **Zero dependencies for the web UI** — vanilla HTML/CSS/JS, no npm packages, no build step.
2. **Zero new dependencies for the server** — Node's built-in `http` module is sufficient.
3. **Reuse existing code** — the server calls `LibraryDatabase` and `ArchiveLoader` directly.
4. **Mobile-first** — the web UI is primarily for reading on phones and tablets away from the desktop.
5. **Read-only by default** — the web API does not mutate the library. Only reading progress is writable.
6. **Minimalistic** — the web UI is deliberately simpler than the Electron UI. It's a reader, not a library manager.
