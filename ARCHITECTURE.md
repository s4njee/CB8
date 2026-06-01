# CB8 Architecture

CB8 is a comic / book reader that runs in three deployment modes from a single TypeScript codebase:

- **Electron desktop app** — native window + embedded server.
- **Headless server** — same Electron build, started with `--headless`, no window.
- **Standalone** — Electron-free Node.js bundle for Docker / VPS.

All three modes share the same SQLite library, the same Fastify-backed HTTP API, and the same React SPA frontend. The Electron desktop window simply loads the SPA from `http://127.0.0.1:<port>` against the locally-hosted server.

```
┌────────────────────────────────────────────────────────────────────┐
│                         Electron app                               │
│   (main process)                  (BrowserWindow / renderer)       │
│  ┌────────────────┐               ┌──────────────────────────┐     │
│  │ src/main       │  preload.ts   │ src/renderer (React SPA) │     │
│  │  index.ts      │◄──IPC bridge─►│  hostBridge.ts           │     │
│  │  ipc/*         │               │  pages/, components/     │     │
│  └───────┬────────┘               └────────────┬─────────────┘     │
│          │ in-process call                    │                    │
│          ▼                                    │ HTTP fetch         │
│  ┌────────────────────────────────────────────▼─────────────────┐  │
│  │  Fastify web server (src/main/webServer)                     │  │
│  │   routes/   middleware.ts   auth.ts (better-auth)            │  │
│  └───────┬─────────────────────────────────────┬────────────────┘  │
│          │                                     │                   │
│          ▼                                     ▼                   │
│   ┌─────────────┐                      ┌─────────────────┐         │
│   │ archive +   │   ingest writes      │ LibraryDatabase │         │
│   │ image work  │─────────────────────►│ (better-sqlite3)│         │
│   │ (sharp, 7z, │                      │  src/main/db/   │         │
│   │  yauzl,...) │                      └─────────────────┘         │
│   └─────────────┘                                                  │
└────────────────────────────────────────────────────────────────────┘

  Standalone mode: src/main/standalone.ts skips Electron and runs only
  the Fastify server + LibraryDatabase. Same modules, no IPC, no menu.
```

---

## Top-level layout

| Path | Purpose |
| --- | --- |
| `src/main/` | Node-side code: DB, ingest, archive readers, embedded HTTP server, Electron lifecycle + IPC. |
| `src/renderer/` | React 18 SPA served by the Fastify server and loaded by the Electron window. |
| `src/shared/` | Pure-TypeScript modules usable from both sides (sorting, validators, types, IPC channel registry). |
| `packaging/` | Docker, systemd, and Kubernetes manifests for non-desktop deploys. |
| `scripts/` | Build helpers (`build-standalone.mjs`, dev branding). |
| `forge.config.ts`, `vite.*.config.ts` | Electron Forge + Vite build pipeline for desktop / SPA. |

There are three entry points compiled by Vite:

- `src/main/index.ts` — Electron main process (desktop + headless).
- `src/main/preload.ts` — Electron preload, the only place that touches `contextBridge`.
- `src/main/standalone.ts` — Plain Node entry for the Docker / VPS bundle.
- `src/renderer/main.tsx` — SPA entry (mounts `<App />`).

---

## Main process (`src/main/`)

### Lifecycle and orchestration

- **`index.ts`** — Electron entry. On `app.ready` it either calls `createWindow()` (opens the SQLite DB, starts the embedded server in desktop mode, then opens a `BrowserWindow` pointing at `http://127.0.0.1:<port>`) or `startHeadless()` (DB + server only). Also handles `open-file` events, the `before-quit` shutdown chain (server → DB), and pending-file dispatch via `resolveAndDispatchComic`.
- **`standalone.ts`** — Electron-free entry: builds the Fastify server directly and listens on `CB8_HOST:CB8_PORT`. Reads paths from `CB8_DATA_DIR`. Used by the slim Docker image.
- **`menu.ts`** — Builds the Electron application menu and implements its destructive actions (Clear Database, Reset Admin Password, Open Recent). It interacts with the rest of the app only through a `MenuContext` injected by `index.ts`, so it never imports `index.ts` directly.
- **`preload.ts`** — Whitelist-checked `contextBridge` that exposes `electronAPI.invoke / on / send / getPathForFile` to the renderer. The whitelist is generated from `src/shared/ipcTypes.ts`.
- **`adminReset.ts`** — Used by the menu's "Reset Admin Password" action.
- **`sevenZipPath.ts`** — Locates a usable `7z` / `7zz` / `7za` binary, honouring `CB8_SEVENZIP_PATH`.
- **`utils/timeout.ts`** — Tiny `withTimeout` helper used by ingest.

### Database (`src/main/db/`)

Owned by `libraryDatabase.ts`, which is a thin facade. It opens a single `better-sqlite3` handle and exposes one method per logical operation; each method delegates to a free function in a per-domain file.

- **`db/schema/`** — Database lifecycle.
  - `open.ts` — Opens the DB, sets pragmas (`WAL`, `synchronous=NORMAL`, foreign keys on), wipes-and-recreates on corruption, then runs migrations and async repairs. Exposes `DbStartupError` for typed init failures.
  - `create.ts` — The `SCHEMA` string: `comics`, `users`, `session`/`account`/`verification` (better-auth), `user_progress`, `bookmarks`, `user_favorites`, `reading_history`, `tags`/`comic_tags`, `libraries`/`library_comics`/`library_folders`, `folders`/`folder_comics`, `dismissed_paths`, `app_meta`.
  - `migrations.ts` — Versioned migrations up to `CURRENT_VERSION = 6`; detects pre-versioned databases by column presence.
  - `repairs.ts` — Idempotent post-startup fixes (e.g. `backfillAccountFromPasswordHash`), gated by `app_meta` flags.
- **`db/comics.ts`** — The largest module. Comic CRUD, series metadata, paged queries (`queryComics`, `queryComicsForUser`), continue / recently-read lists.
- **`db/folders.ts`** — Folder CRUD + the series/volume/chapter rollups (global and per-folder, with per-user read state).
- **`db/libraries.ts`** — Libraries (`comic` vs `book` media-typed buckets) and their folder/comic membership.
- **`db/tags.ts`** — Tag CRUD + bulk operations.
- **`db/users.ts`** — User table, admin counts, credential-account upserts that bridge to better-auth's `account` table.
- **`db/progress.ts`** — Per-user `user_progress` rows; powers continue / recently-read per-user.
- **`db/bookmarks.ts`, `db/favorites.ts`, `db/history.ts`** — Self-explanatory side tables.
- **`db/appMeta.ts`** — Single-row config (`get/set` against `app_meta`).
- **`db/maintenance.ts`** — `clearLibrary` (truncate catalog while keeping users / auth state).
- **`db/cast.ts`, `db/transaction.ts`, `db/types.ts`** — Small helpers shared by the above.

### Ingest pipeline

- **`fileScanner.ts`** — Stable public surface (`FileScannerImpl`) that the upload route uses. It delegates to `IngestService` and adds a small `refreshBookMetadata` helper.
- **`ingestService.ts`** — The actual worker. Walks a directory, runs a bounded producer/consumer queue (`MAX_INGEST_CONCURRENCY`, default 4), extracts cover thumbnails, batches inserts (`FLUSH_BATCH_SIZE = 200`) inside a single SQLite transaction, attaches new comics to a folder if requested, parses series/volume/chapter info from filenames.
- **`archiveLoader.ts`** — Opens CBZ via `yauzl` (random-access through a kept-open handle + per-archive page LRU) and CBR via `unrar` or 7-Zip fallback. Provides `getCoverImage`, page entry listing, and timed-out extraction.
- **`epubCoverExtractor.ts`, `pdfCoverExtractor.ts`** — Format-specific cover/page-count helpers.
- **`imageDecoder.ts`** — Decodes JXL / odd formats so `sharp` can resize them.
- **`thumbnailGenerator.ts`** — Encodes cover thumbnails (and a placeholder when extraction fails).
- **`imageResizer.ts`** — On-demand page resizing via `sharp`, cached on disk under `<userData>/image-cache` keyed by `(comicId, page, width)`. Bounded by `CACHE_BUDGET_BYTES` with mtime-based eviction.
- **`metadataScraper.ts`** — External metadata lookups (used by the comics route).
- **`seriesParser.ts`** — Pure filename-pattern parser (`name v01 c003.cbz` → `{ seriesName, volumeNumber, chapterNumber }`). Heavily unit-tested in `seriesParser.test.ts`.
- **`ingestErrorLog.ts`** — Classifies and persists per-file failures so the upload UI can surface what dropped and why.

### IPC handlers (`src/main/ipc/`)

The IPC surface is intentionally tiny — most product features go through the HTTP API instead. `ipcHandlers.ts` re-exports `registerIpcHandlers` from `ipc/index.ts`, which composes:

- **`libraryHandlers.ts`** — Native file/directory pickers (`dialog:open-file`, `dialog:open-directory`).
- **`readingHandlers.ts`** — `reading:get-comic-by-path` — used to translate an OS file-open into a comic id.
- **`webServerHandlers.ts`** — `webserver:get-settings` / `webserver:set-settings`. Owns server lifecycle from the renderer's perspective; mode-dependent (`desktop` keeps the server alive always; `headless` lets the user stop it).
- **`appHandlers.ts`** — Window controls (`window:toggle-fullscreen`, etc.) and `shell:open-path`.

The channel allowlist comes from `src/shared/ipcTypes.ts` (`IpcInvokeMap`, `IpcEventMap`, `IpcSendMap`), so adding a channel is a one-place edit.

### Embedded web server (`src/main/webServer/`)

A Fastify instance that serves the SPA + the entire product API. Used uniformly by the Electron window, LAN browsers, the headless run, and the standalone Docker bundle.

- **`webServer.ts`** (parent dir) — Public façade. `startWebServer(db, port, host)` builds the Fastify instance, listens, and returns a `WebServerHandle` shaped for the existing IPC callers. Also exports `getLanIp()`.
- **`webServer/server.ts`** — `buildServer(db)` constructs the Fastify instance: rate limiting hooks, CORS, content-type parser disable (legacy handlers consume the raw body themselves), then mounts:
  - `/api/auth/*` — better-auth handler for the endpoints we don't override.
  - `/api/*` — `dispatchApi`, an adapter that calls the per-domain `RouteHandler` modules with raw `IncomingMessage` / `ServerResponse`.
  - Everything else — static SPA via `serveStatic`.
- **`webServer/middleware.ts`** — Cookie parsing, host-connection (loopback) detection, body reading with size limits (`BodyTooLargeError`), guest-access policy, initial-admin bootstrap (`ensureInitialAdmin`), and the `sendJson` / `sendError` helpers used by routes.
- **`webServer/auth.ts`** — `better-auth` setup against the existing better-sqlite3 connection. Maps `user` → our `users` table; persists `auth_secret` in `app_meta` so sessions survive restarts; bcrypt-compatible with legacy `password_hash` rows.
- **`webServer/context.ts`** — `RequestContext` and `RouteHandler` types + `requireAdmin` gate.
- **`webServer/routes/`** — One file per resource (`auth`, `users`, `comics`, `folders`, `libraries`, `progress`, `tags`, `upload`, `staticFiles`). Each exports a `handle: RouteHandler` that returns `true` when it owns the request.
- **`webServer/archiveCache.ts`** — LRU of open archive handles keyed by comic id with refcounted readers and TTL eviction, so concurrent page fetches against the same archive share one open handle.
- **`webServer/ingest.ts`** — Bridges the upload route to `IngestService` with a streaming event interface.
- **`webServer/mapping.ts`** — `toWebRecord` / `overlayUserState` — map internal `MediaRecord` to the API shape (`WebComicRecord`) and overlay per-user progress/favourite state.
- **`webServer/rateLimit.ts`** — Login + forgot-password limiters, applied as a Fastify preHandler hook.
- **`webServer/safeFetch.ts`** — SSRF-safe outbound HTTP for the metadata scraper.
- **`webServer/emailSender.ts`** — Plumbing better-auth's email hooks; no-ops in environments without SMTP configured.

---

## Renderer (`src/renderer/`)

A React 18 SPA built with Vite + Tailwind + shadcn/ui (Radix primitives under `components/ui/`). Routing is hash-based (`HashRouter`) so the same bundle works whether loaded by Electron or directly from the server. State that needs to survive across pages lives in Zustand stores; server data is cached via `@tanstack/react-query`.

### Entry + shell

- **`main.tsx`** — React root mount.
- **`App.tsx`** — Wraps the app in `QueryClientProvider` + `HashRouter`. Does session bootstrap (auto-logs-in with the printed initial admin password until the admin changes it).
- **`components/layout/AppShell.tsx`** — The persistent layout: navbar, sidebar, mobile tab bar, reader overlay. Defines all the routes. Listens to Electron host bridge events (`onComicOpened`, `onOpenSettings`). Hosts the global drop overlay and pull-to-refresh.

### Pages (`renderer/pages/`)

One file per top-level route, mapped from `AppShell`'s `<Routes>`:

- `AllPage`, `RecentPage`, `ContinuePage` — Library-wide views.
- `LibraryPage` — Single library by id.
- `FolderPages.tsx` — `FolderPage`, `FolderSeriesPage`, `FolderVolumePage`, `FolderChapterPage` (folder-scoped series/volume/chapter drill-down).
- `BrowsePages.tsx` — Global (library-wide) series/volume/chapter drill-down.
- `TagPage` — Tag-scoped listing.
- `ReaderPage.tsx` — Resolves the comic record then picks `ComicReader`, `EpubReader`, or `PdfReader` based on `mediaType` / file extension.
- `AuthPages.tsx` — `ResetPasswordPage`, `VerifiedPage`.

### Components

- **`components/layout/`** — `Navbar`, `Sidebar`, `TabBar`, `TabPanel`, `SortSheet`, `ReaderOverlay`.
- **`components/library/`** — `ComicCard`, `FolderCard`, `GroupCard`, `LibraryGrid`, `ContextMenu`, `ContinueShelf`, `Breadcrumb`, `FilterStrips`, `SelectionBar`.
- **`components/reader/`** — `ComicReader` (sharp-rendered images via `/api/comics/:id/page/:n`), `EpubReader` (epub.js with a themed iframe), `PdfReader` (pdfjs-dist), and `ReaderToolbar`.
- **`components/admin/`** — `AdminModal` and its tab panels: `LoginPanel`, `SignupPanel`, `ForgotPasswordPanel`, `ResetPasswordPanel`, `SettingsPanel`, `UploadPanel`, `AddPathPanel`, `UsersPanel`, `AdminMenu`.
- **`components/ui/`** — shadcn-style primitives (button, dialog, dropdown-menu, sheet, slider, select, tabs, toast, etc.). Mostly thin wrappers over Radix.

### Hooks and lib

- **`hooks/`** — `useDrop` (drag-and-drop ingest path), `useComicGestures`, `useComicKeyboard`, `useInfiniteComics`, `usePullToRefresh`, `useToast`, `useWakeLock`.
- **`lib/api.ts`** — Single-file fetch wrapper over the `/api/*` HTTP surface; defines `WebComicRecord`, `Folder`, `Library`, `SeriesGroup`, etc. The renderer never goes through IPC for product data.
- **`lib/hostBridge.ts`** — Optional Electron bridge (`window.electronAPI`). Returns no-ops when running in a plain browser, so the SPA gracefully degrades.
- **`lib/queryClient.ts`** — react-query setup and `invalidateLibraryQueries`.
- **`lib/dropUtils.ts`, `lib/utils.ts`** — `cn` helper + drag-and-drop helpers.

### Stores (`renderer/store/`)

- **`readerStore`** — Reader preferences (zoom, direction, spread, EPUB font/theme) persisted in `localStorage`.
- **`selectionStore`** — Multi-select state for bulk operations.
- **`uiStore`** — Global UI state.

---

## Shared (`src/shared/`)

Pure modules with no DOM / no Node deps, importable from both sides:

- **`types.ts`** — Canonical `MediaRecord`, `QueryOptions`, `QueryResult`, `ScanProgress`, `NavigationState`.
- **`ipcTypes.ts`** — Source of truth for the (small) IPC channel surface. Used by preload to build the allowlist and by both sides for types.
- **`mediaTypes.ts`** — File-extension → `'comic' | 'book'` mapping.
- **`naturalSort.ts`** — Natural filename comparison (`page2 < page10`). Drives both archive entry ordering and library sort.
- **`coverSelection.ts`** — Picks a cover image entry from an archive's image list.
- **`imageFilter.ts`** — `isImageFile` extension check.
- **`scaleFit.ts`** — Layout math for the comic reader's fit-width / fit-height modes.
- **`filterLogic.ts`** — Filter preset normalisation shared by sidebar and query routes.
- **`statusFormat.ts`, `windowTitle.ts`** — Small formatting helpers.
- **`lru.ts`** — Byte-bounded LRU used by `archiveLoader`'s in-archive page cache.
- **`dropValidator.ts`** — Drag-and-drop file-list validation.
- **`epubTheme.ts`** — EPUB theme injection helpers shared by `EpubReader`.

Most of these have colocated `.test.ts` files run by Vitest.

---

## Configuration knobs

- **Environment variables** — `CB8_HEADLESS`, `CB8_DATA_DIR`, `CB8_PORT`, `CB8_HOST`, `CB8_INGEST_CONCURRENCY`, `CB8_SEVENZIP_PATH`, `CB8_UNRAR_PATH`, `CB8_ARCHIVE_LIST_TIMEOUT_MS`, `CB8_ARCHIVE_EXTRACT_TIMEOUT_MS`, `BETTER_AUTH_SECRET`.
- **Persistent settings** — Stored in the `app_meta` table: `web_server_enabled`, `web_server_port`, `guest_access`, `auth_secret`, `initial_password`, `schema_version`, and various repair flags.
- **On-disk artifacts** — `library.db` (+ WAL/SHM), `image-cache/`, `web-uploads/`, ingest-error log under the platform-specific `userData` directory (or `CB8_DATA_DIR` in standalone).

---

## Request paths at a glance

**SPA → server**: `fetch('/api/...')` → Fastify hook (auth/rate-limit) → `dispatchApi` resolves session via better-auth → tries each `RouteHandler` in turn → handler hits `LibraryDatabase` or, for page reads, `withArchive` (from `archiveCache`) → image responses go through `imageResizer` with its on-disk cache.

**OS file open → reader**: Electron `open-file` event → `index.ts` `openFileInWindow` → `IngestService.addFile` if unknown → `BrowserWindow.webContents.send('comic-opened', id)` → `hostBridge.onComicOpened` in `AppShell` → `navigate('/read/:id')`.

**Renderer → native dialog**: `hostBridge.pickFile()` → `electronAPI.invoke('dialog:open-file')` → `ipc/libraryHandlers.ts` → Electron `dialog.showOpenDialog`.
