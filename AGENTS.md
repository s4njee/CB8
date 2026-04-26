# AGENTS.md

Guidance for coding agents working in this repository.

## Project Shape

This is an Electron + TypeScript comic reader. The frontend is a vanilla-JS SPA under `src/web/`, served by the embedded HTTP server and loaded by the Electron window; remote browser clients hit the same server. The active implementation is TypeScript under `src/`; the root `CMakeLists.txt` is stale Qt/C++ prototype configuration and should not be used for current work.

Specs live in `.kiro/specs/comic-book-reader/`:
- `requirements.md` is the product contract.
- `design.md` describes the intended architecture.
- `tasks.md` tracks implementation status and test expectations.

Active feature inventory lives in `FEATURES.md` — every implemented feature there carries the file paths that own it. Treat that file as the source of truth when looking for "where does X live?". Backlog ideas live at the bottom of the same file, tiered by impact.

Large follow-up work that should not be mixed into small fixes is tracked in `REFACTOR.md`.

## Frontend Direction

`src/web/` is the only frontend. PLAN10 collapsed the former
`src/renderer/` React app onto this SPA; Electron now loads the SPA via
the embedded HTTP server. New product features land in `src/web/`.

`src/web-next/` (an abandoned SvelteKit scaffold) is **not** the target
and should not exist in the working tree on this branch.

## Useful Commands

Run these from the repo root:

```sh
pnpm run typecheck
pnpm test
pnpm start
pnpm run package
```

Use `pnpm run typecheck` before trusting a main-process or IPC change. The test suite currently focuses on shared utilities, so TypeScript catches many integration mistakes that tests do not. (Note: `src/web/` is plain JS — typecheck does not cover it.)

For DB-backed perf work, the search benchmark is:

```sh
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/bench-search.mjs --rows 100000 --runs 5
```

(`ELECTRON_RUN_AS_NODE=1` is required because `better-sqlite3` is built against Electron's Node ABI, not system Node.)

## Code Map (high-level)

- `src/main/`: Electron main process, archive loading, SQLite library database, file scanning, IPC handlers, preload bridge.
  - `src/main/db/`: per-domain DB modules + `schema/` for DDL/migrations/repairs.
  - `src/main/ipc/`: IPC handler modules, registered through `ipc/index.ts` (re-exported via `src/main/ipcHandlers.ts`). Surface is now host-only — dialogs, fullscreen, shell-open, web server settings.
  - `src/main/webServer/`: embedded HTTP server, REST routes (`routes/`), middleware, auth, archive cache, rate limiter, SSRF-safe fetch.
- `src/shared/`: code and types shared by main and the SPA build.
  - `src/shared/ipcTypes.ts`: canonical IPC channel names, argument tuples, result types, event payloads, send-only channels.
  - `src/shared/mediaTypes.ts`: extension allowlist + media-type classification.
  - `src/shared/types.ts`: `MediaRecord`, `QueryOptions`, `FilterPreset`, `ScanProgress`, etc.
- `src/web/`: the only frontend. Vanilla ES modules, no React. Served by the embedded HTTP server for browser clients and loaded by Electron via `http://127.0.0.1:<port>`.
  - `src/web/views/library/`: card builders, strip filters, selection, empty states.
  - `src/web/views/reader/`: reader entry + per-format submodules + comic-reader gestures/keyboard.
  - `src/web/admin/`: auth flows + admin UI (login, signup, forgot/reset password, upload, add-path, context menu, modal, settings).
  - `src/web/app/`: routing, sidebar, toast, sort sheet, tab panel, drop, state.
  - `src/web/host/`: desktop-host capability boundary (`isElectron`, `onComicOpened`, `onOpenSettings`, native pickers, web-server settings, `openExternalPath`). Browser callers degrade to no-ops. Domain operations belong on the HTTP API, not here.

## IPC Rules

IPC is now host-only — domain operations (library / reader / admin) go over the HTTP API in `src/main/webServer/routes/`, not IPC. Add a new IPC channel only for genuine shell concerns (file dialogs, native menu plumbing, window chrome, web-server toggles).

When adding or changing an IPC channel:

1. Update `src/shared/ipcTypes.ts` (`IpcInvokeMap`, `IpcEventMap`, or `IpcSendMap`).
2. Register the handler in the matching `src/main/ipc/*Handlers.ts` module (library / reading / webServer / app). The barrel `src/main/ipcHandlers.ts` re-exports `registerIpcHandlers`.
3. Expose a helper in `src/web/host/index.js` with a browser fallback (no-op or null) so non-Electron clients degrade cleanly.
4. Run `pnpm run typecheck`.

The preload bridge whitelists channels from `IPC_INVOKE_CHANNELS`, `IPC_EVENT_CHANNELS`, and `IPC_SEND_CHANNELS` (codegen'd from the type maps). If a channel is missing, calls fail at runtime.

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

### Library UI

| Concern | Files |
|---|---|
| Entry / paging / continue shelf / empty | `src/web/views/library.js` |
| Cards (comic + folder) | `src/web/views/library/cards.js` |
| Filter strips, header chrome | `src/web/views/library/strips.js` |
| Selection + bulk bar | `src/web/views/library/selection.js` |
| Empty state SVGs | `src/web/views/library/empty.js` |
| Sidebar / routing / sort / tabs | `src/web/app/{sidebar,sideContextMenu,router,sort,tabPanel,state,toast,drop}.js` |
| API client | `src/web/api.js` (single `request()` helper underneath) |
| Admin flows | `src/web/admin/{login,signup,forgotPassword,resetPassword,session,menu,modal,settings,upload,addPath,drop,bulkDelete,contextMenu}.js` |
| Layout / styles | `src/web/style.css`, `src/web/index.html`, `src/web/manifest.json` |

### Readers

| Format | Files |
|---|---|
| Comic (CBZ / CBR) | `src/web/views/reader/comicReader.js`, `src/web/views/reader/comicReader/{gestures,keyboard}.js` |
| EPUB | `src/web/views/reader/epubReader.js` |
| PDF | `src/web/views/reader/pdfReader.js` |
| Shared | `src/web/views/reader/{state,prefs,utils}.js`, `src/shared/{scaleFit,statusFormat,windowTitle,naturalSort,imageFilter,coverSelection}.ts` |

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
| Settings dialog (web-server toggle / port) | `src/web/admin/settings.js` |
| Preload bridge | `src/main/preload.ts` |

### Resource / perf primitives

| Concern | Files |
|---|---|
| Refcounted archive cache (web) | `src/main/webServer/archiveCache.ts` |
| CBR per-handle LRU page cache | `src/main/archiveLoader.ts` |
| On-disk image-resize cache | `src/main/imageResizer.ts` |
| Sharp-based thumbnail generation | `src/main/thumbnailGenerator.ts` |
| `withTimeout` util | `src/main/utils/timeout.ts` |

### Build / tooling

| Concern | Files |
|---|---|
| Electron Forge | `forge.config.ts` (+ Vite configs) |
| Vite (main / preload only — no renderer target) | `vite.main.config.ts`, `vite.preload.config.ts` |
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
- Library grid uses `IntersectionObserver` infinite scroll (`src/web/views/library.js`). The 100 K-record search target is met by the FTS5 index — see the bench script for proof.
- Web UI fetch wrappers route through a single `request()` helper in `src/web/api.js`. New endpoints should call that helper, not duplicate fetch boilerplate.
- IPC handler registration is split per-domain under `src/main/ipc/`. The barrel `src/main/ipcHandlers.ts` exists only for backwards-compatible imports.
- `src/main/webServer/archiveCache.ts` exposes `withArchive(comicId, path, fn)` rather than handing out raw handles. This is intentional — it ensures the refcount-aware close path runs even on exceptions.

## Safety Notes

Do not delete underlying comic files when removing library records. The requirements explicitly say library removal must only update the database.

Do not introduce new raw `any` casts. The SPA should call IPC through `src/web/host/index.js` helpers, not `window.electronAPI.invoke` directly — host helpers carry the browser-fallback behavior.

Keep generated/build output out of commits: `node_modules/`, `dist/`, `.vite/`, and `out/` are ignored.

When touching the embedded web server, remember it is exposed on `0.0.0.0` by default. Anything new that mutates state must be admin-gated (`requireAdmin`) or host-gated (`isHostConnection`) and rate-limited if it is on an unauthenticated path. Do not bypass `safeFetchBuffer` for outbound HTTP.
