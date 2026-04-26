# AGENTS.md

Guidance for coding agents working in this repository.

## Project Shape

This is an Electron + TypeScript + React comic reader. The active implementation is TypeScript under `src/`; the root `CMakeLists.txt` is stale Qt/C++ prototype configuration and should not be used for current work.

Specs live in `.kiro/specs/comic-book-reader/`:
- `requirements.md` is the product contract.
- `design.md` describes the intended architecture.
- `tasks.md` tracks implementation status and test expectations.

Active feature inventory lives in `FEATURES.md` — every implemented feature there carries the file paths that own it. Treat that file as the source of truth when looking for "where does X live?". Backlog ideas live at the bottom of the same file, tiered by impact.

Large follow-up work that should not be mixed into small fixes is tracked in `REFACTOR.md`.

## Frontend Direction (PLAN10, in progress)

`src/web/` is the canonical frontend. New user-facing features land there.
`src/renderer/` is being collapsed onto the same SPA — treat it as a
compatibility shell during the migration, not as an evolving app. Do not
add net-new product features to `src/renderer/`; only host-only Electron
glue (file-open, menu commands, packaging) belongs there during cutover.

`src/web-next/` (a SvelteKit scaffold) was abandoned and is **not** the
target — it should not exist in the working tree on this branch. See
`PLAN10.md` for the migration plan.

## Useful Commands

Run these from the repo root:

```sh
pnpm run typecheck
pnpm test
pnpm start
pnpm run package
```

Use `pnpm run typecheck` before trusting a renderer or IPC change. The test suite currently focuses on shared utilities, so TypeScript catches many integration mistakes that tests do not.

For DB-backed perf work, the search benchmark is:

```sh
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/bench-search.mjs --rows 100000 --runs 5
```

(`ELECTRON_RUN_AS_NODE=1` is required because `better-sqlite3` is built against Electron's Node ABI, not system Node.)

## Code Map (high-level)

- `src/main/`: Electron main process, archive loading, SQLite library database, file scanning, IPC handlers, preload bridge.
  - `src/main/db/`: per-domain DB modules + `schema/` for DDL/migrations/repairs.
  - `src/main/ipc/`: IPC handler modules, registered through `ipc/index.ts` (re-exported via `src/main/ipcHandlers.ts`).
  - `src/main/webServer/`: embedded HTTP server, REST routes (`routes/`), middleware, auth, archive cache, rate limiter, SSRF-safe fetch.
- `src/renderer/`: React UI and typed renderer IPC client.
  - `src/renderer/components/`: top-level React components.
  - `src/renderer/components/library/`: library grid + folder/comic cards + per-card hooks.
  - `src/renderer/components/library/hooks/`: extracted state hooks (`useLibraryQuery`, `useLibraryFilters`, `useLibrarySelection`, `useFolderContextMenu`, `useDetailsModal`, `useSidebarLibraryContextMenu`, `useScanProgress`, `useThumbnail`).
- `src/shared/`: code and types shared by main and renderer.
  - `src/shared/ipcTypes.ts`: canonical IPC channel names, argument tuples, result types, event payloads, send-only channels.
  - `src/shared/mediaTypes.ts`: extension allowlist + media-type classification.
  - `src/shared/types.ts`: `MediaRecord`, `QueryOptions`, `FilterPreset`, `ScanProgress`, etc.
- `src/web/`: browser-only web UI served by the embedded HTTP server (vanilla ES modules, no React).
  - `src/web/views/library/`: card builders, strip filters, selection, empty states.
  - `src/web/views/reader/`: reader entry + per-format submodules + comic-reader gestures/keyboard.
  - `src/web/admin/`: auth flows + admin UI (login, signup, forgot/reset password, upload, add-path, context menu, modal).
  - `src/web/app/`: routing, sidebar, toast, sort sheet, tab panel, drop, state.

## IPC Rules

When adding or changing an IPC channel:

1. Update `src/shared/ipcTypes.ts` (`IpcInvokeMap`, `IpcEventMap`, or `IPC_SEND_CHANNELS`).
2. Register the handler in the matching `src/main/ipc/*Handlers.ts` module (archive / library / reading / webServer / app). The barrel `src/main/ipcHandlers.ts` re-exports `registerIpcHandlers`.
3. Add or update a helper in `src/renderer/ipcClient.ts`.
4. Use the helper from React components — do not call `window.electronAPI.invoke` directly.
5. Run `pnpm run typecheck`.

The preload bridge whitelists channels from `IPC_INVOKE_CHANNELS`, `IPC_EVENT_CHANNELS`, and `IPC_SEND_CHANNELS`. If a channel is missing from those arrays, renderer calls will fail at runtime.

## Testing Expectations

Shared pure logic should have Vitest coverage under `src/shared/*.test.ts`. Prefer property-style tests where existing utilities already use them.

For main-process or archive/database behavior, add focused tests only when fixtures or temporary files make the behavior deterministic. Avoid relying on local comic collections.

The current 118-test suite covers: cover selection, drop validator, image filter, natural sort, scale-fit, series parser, status format, window title.

## Feature → File Map

Use this when picking up a task in an unfamiliar area. Each row maps a feature surface to the files that own its behavior. `FEATURES.md` carries finer-grained notes per feature; this is the agent fast-path.

### Database / catalog

| Concern | Files |
|---|---|
| Schema, DDL, migrations | `src/main/db/schema/{create,migrations,open,repairs,index}.ts` |
| Per-domain queries | `src/main/db/{comics,libraries,folders,tags,users,progress,bookmarks,history,favorites,appMeta,types}.ts` |
| DB facade | `src/main/libraryDatabase.ts` |
| FTS5 search | `migrations.ts` (`ensureSearchIndex`, triggers); `comics.ts` (`buildFtsQuery`, `queryComics*`); `scripts/bench-search.mjs` |

### Ingestion / scanning

| Concern | Files |
|---|---|
| Single-file ingest | `src/main/ingestService.ts` |
| Directory scan + cancellation | `src/main/fileScanner.ts`, `src/main/ingestService.ts` (`AbortSignal`-threaded), `src/main/ipc/libraryHandlers.ts` |
| Archive open / page extract | `src/main/archiveLoader.ts` |
| JXL transcode | `src/main/imageDecoder.ts` |
| Cover thumbnails | `src/main/{epubCoverExtractor,pdfCoverExtractor,thumbnailGenerator}.ts`, `src/shared/coverSelection.ts` |
| Series parser | `src/main/seriesParser.ts` (+ `.test.ts`) |

### Library UI (Electron)

| Concern | Files |
|---|---|
| Top-level grid | `src/renderer/components/LibraryView.tsx` |
| Sidebar | `src/renderer/components/LibrarySidebar.tsx` |
| Cards / context menus / details | `src/renderer/components/library/{ComicCard,FolderCard,ComicContextMenu,FolderContextMenu,ContextMenuPrimitives,DetailsModal}.tsx` |
| State hooks | `src/renderer/components/library/hooks/*` (`useLibraryQuery`, `useLibraryFilters`, `useLibrarySelection`, `useFolderContextMenu`, `useDetailsModal`, `useSidebarLibraryContextMenu`, `useScanProgress`, `useThumbnail`) |
| Filter / sort UI | `src/renderer/components/{FilterBar,SortControl}.tsx` |
| Continue-reading shelf | `src/renderer/components/ContinueReadingShelf.tsx` |
| Confirm modal | `src/renderer/components/{ConfirmModal,useConfirm}.tsx` |
| Error boundary | `src/renderer/components/ErrorBoundary.tsx` |

### Library UI (Web)

| Concern | Files |
|---|---|
| Entry / paging / continue shelf / empty | `src/web/views/library.js` |
| Cards (comic + folder) | `src/web/views/library/cards.js` |
| Filter strips, header chrome | `src/web/views/library/strips.js` |
| Selection + bulk bar | `src/web/views/library/selection.js` |
| Empty state SVGs | `src/web/views/library/empty.js` |
| Sidebar / routing / sort / tabs | `src/web/app/{sidebar,sideContextMenu,router,sort,tabPanel,state,toast,drop}.js` |
| API client | `src/web/api.js` (single `request()` helper underneath) |
| Admin flows | `src/web/admin/{login,signup,forgotPassword,resetPassword,session,menu,modal,upload,addPath,drop,bulkDelete,contextMenu}.js` |
| Layout / styles | `src/web/style.css`, `src/web/index.html`, `src/web/manifest.json` |

### Readers

| Format | Electron | Web |
|---|---|---|
| Comic (CBZ / CBR) | `src/renderer/components/{ReaderView,App}.tsx` | `src/web/views/reader/comicReader.js`, `src/web/views/reader/comicReader/{gestures,keyboard}.js` |
| EPUB | `src/renderer/components/EpubReaderView.tsx` | `src/web/views/reader/epubReader.js` |
| PDF | `src/renderer/components/PdfReaderView.tsx` | `src/web/views/reader/pdfReader.js` |
| Shared | `src/web/views/reader/{state,prefs,utils}.js` (web), `src/shared/{scaleFit,statusFormat,windowTitle,naturalSort,imageFilter,coverSelection}.ts` |

### Web server

| Concern | Files |
|---|---|
| Server bootstrap, dispatcher, error handling | `src/main/webServer.ts` |
| Routes | `src/main/webServer/routes/{auth,comics,folders,libraries,progress,tags,upload,users,staticFiles}.ts` |
| Middleware (request context, body cap, query parsing, host check, guest mode, ensureInitialAdmin) | `src/main/webServer/middleware.ts` |
| Better-auth wiring + trusted origins | `src/main/webServer/auth.ts` |
| Archive handle cache (refcounted) | `src/main/webServer/archiveCache.ts` |
| Rate limiter | `src/main/webServer/rateLimit.ts` |
| SSRF-safe fetch | `src/main/webServer/safeFetch.ts` |
| Web record mapping (`thumbnailUrl?v=…` cache busting) | `src/main/webServer/mapping.ts` |
| Streaming server-side ingest | `src/main/webServer/ingest.ts` |
| Email transport | `src/main/webServer/emailSender.ts` |
| Per-user overlay (progress / favorites) | `src/main/db/progress.ts` + `routes/progress.ts` + `mapping.ts` |

### Electron shell

| Concern | Files |
|---|---|
| App lifecycle, window, headless mode | `src/main/index.ts` |
| Application menu (incl. Reset Admin Password, Clear Database) | `src/main/menu.ts` |
| Admin reset helper | `src/main/adminReset.ts` |
| Settings dialog | `src/renderer/components/SettingsDialog.tsx` (+ `.styles.ts`) |
| Preload bridge | `src/main/preload.ts` |

### Resource / perf primitives

| Concern | Files |
|---|---|
| Refcounted archive cache (web) | `src/main/webServer/archiveCache.ts` |
| CBR per-handle LRU page cache | `src/main/archiveLoader.ts` |
| On-disk image-resize cache | `src/main/imageResizer.ts` |
| Sharp-based thumbnail generation | `src/main/thumbnailGenerator.ts` |
| `withTimeout` util | `src/main/utils/timeout.ts` |
| ArrayBuffer page IPC (no base64) | `src/main/ipc/archiveHandlers.ts` + `src/renderer/components/{App,ReaderView}.tsx` |

### Build / tooling

| Concern | Files |
|---|---|
| Electron Forge | `forge.config.ts` (+ Vite configs) |
| Vite (main / preload / renderer) | `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts` |
| TypeScript | `tsconfig.json`, `tsconfig.web.json` |
| Vitest | `vitest.config.ts` |
| Dev branding script | `scripts/brand-dev-electron.mjs` |
| Bench | `scripts/bench-search.mjs` |

## Implementation Notes

- Archive loading accepts CBZ and CBR files and filters image entries through `src/shared/imageFilter.ts`.
- Natural sort is centralized in `src/shared/naturalSort.ts`.
- Cover selection logic is centralized in `src/shared/coverSelection.ts`.
- Drag/drop archive validation is centralized in `src/shared/dropValidator.ts`.
- JXL support is wired up via `@jsquash/jxl` (WASM) re-encoding to PNG with Sharp inside `src/main/imageDecoder.ts`. Both Electron and the web UI inherit it because `archiveLoader.getPage` always passes the raw bytes through `decode()`. `vite.main.config.ts` lists `@jsquash/jxl` in the externals so its wasm + native loader flow uses Node `require` at runtime.
- Library grid is virtualized in the Electron renderer via `@tanstack/react-virtual` (see `LibraryView.tsx`). The web UI uses `IntersectionObserver` infinite scroll. The 100 K-record search target is met by the FTS5 index — see the bench script for proof.
- Web UI fetch wrappers route through a single `request()` helper in `src/web/api.js`. New endpoints should call that helper, not duplicate fetch boilerplate.
- IPC handler registration is split per-domain under `src/main/ipc/`. The barrel `src/main/ipcHandlers.ts` exists only for backwards-compatible imports.
- `src/main/webServer/archiveCache.ts` exposes `withArchive(comicId, path, fn)` rather than handing out raw handles. This is intentional — it ensures the refcount-aware close path runs even on exceptions.

## Safety Notes

Do not delete underlying comic files when removing library records. The requirements explicitly say library removal must only update the database.

Do not introduce new raw `any` casts or direct component-level `window.electronAPI.invoke` calls unless there is a clear reason and the type map cannot express the case.

Keep generated/build output out of commits: `node_modules/`, `dist/`, `.vite/`, and `out/` are ignored.

When touching the embedded web server, remember it is exposed on `0.0.0.0` by default. Anything new that mutates state must be admin-gated (`requireAdmin`) or host-gated (`isHostConnection`) and rate-limited if it is on an unauthenticated path. Do not bypass `safeFetchBuffer` for outbound HTTP.
