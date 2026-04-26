# PLAN6 — Monolithic File Refactors

Four large files have grown past the point where navigation and review are easy. This plan splits each into focused modules with no behavior change. Each refactor lands as its own commit; type-check and manual smoke-test must be green between commits.

Order below is by risk (lowest first). Lines counts are current at time of writing.

---

## 1. `src/main/webServer.ts` (1634 lines)

### Current shape
A single `startWebServer` function holds every HTTP route as a chain of `if (method === … && pathname === …)` branches, plus route-local helpers (`addSingleFile`, `ingestPathStreaming`, `toWebRecord`, `parseQueryOptions`, auth predicates, etc.).

### Target layout
```
src/main/webServer/
  index.ts              // startWebServer, closeAllHandles — public surface
  context.ts            // RequestContext type (db, user, handleCache, etc.)
  middleware.ts         // isAuthenticated, isAdmin, sendJson, sendError, readBody, parseQueryOptions
  ingest.ts             // addSingleFile, ingestPathStreaming, IngestEvent
  mapping.ts            // toWebRecord, overlayUserState
  routes/
    auth.ts             // /api/login, /api/logout, /api/me, /api/register
    users.ts            // /api/admin/users*, /api/admin/invite*
    comics.ts           // /api/comics, /api/comics/:id (GET, DELETE), pages, thumbnail
    progress.ts         // /api/comics/:id/progress, /api/comics/:id/favorite, bookmarks
    libraries.ts        // /api/libraries*
    folders.ts          // /api/folders*
    tags.ts             // /api/tags*
    upload.ts           // /api/admin/upload, /api/admin/add-path, /api/admin/list-dir
    webserver.ts        // /api/webserver/settings
    staticFiles.ts      // fallback to /src/web/** and index.html
```

Each route module exports `handle(req, res, ctx): Promise<boolean>` — returns `true` if it handled the request. `index.ts` runs them in order and 404s if none match.

### Approach
1. Extract helpers (`middleware.ts`, `mapping.ts`, `context.ts`) — pure moves, no callers change.
2. Extract `ingest.ts` — `addSingleFile` and `ingestPathStreaming` are self-contained.
3. Extract routes one group at a time. Comics first (biggest). Verify in the browser after each group.
4. Delete the old monolith last.

### Risks
- `handleCache` is shared state; it must live in the context object, not per-module.
- Route order currently matters (specific paths before generic matches); preserve the same ordering in `index.ts`.
- The static fallback must remain the last handler.

---

## 2. `src/main/libraryDatabase.ts` (1079 lines)

### Current shape
One `LibraryDatabase` class with ~60 methods spanning comics, libraries, folders, users, progress, tags, bookmarks, favorites, and app-meta. The SQL schema string lives at the top.

### Target layout
```
src/main/db/
  index.ts              // LibraryDatabase facade — re-exports everything
  schema.ts             // SCHEMA constant + initialize()
  types.ts              // ComicRow, LibraryRow, etc. (internal row shapes)
  comics.ts             // addComic, getComic, removeComics, queryComics, isDismissed…
  libraries.ts          // createLibrary, getAllLibraries, addComicsToLibrary…
  folders.ts            // createFolder, getAllFolders, getFolderComics…
  users.ts              // createUser, authenticateUser, getUserById…
  progress.ts           // updateProgress, updateLocation, queryComicsForUser…
  tags.ts               // addTag, removeTag, getAllTags, renameTag…
  bookmarks.ts          // addBookmark, listBookmarks…
  favorites.ts          // addFavorite, removeFavorite…
  appMeta.ts            // getAppMeta, setAppMeta
```

### Approach
Two viable shapes:

**A. Repository pattern.** `LibraryDatabase` owns a `Database` instance, then exposes `comics: ComicsRepo`, `libraries: LibrariesRepo`, etc. Callers change from `db.addComic(...)` to `db.comics.add(...)`. Cleaner, but ~200 call sites to update.

**B. Facade with internal module delegation.** Each module exports free functions that take `db: Database` as the first arg. `LibraryDatabase` keeps its current method surface and delegates: `addComic(r) { return comics.add(this.db, r); }`. No call-site changes.

**Pick B.** Zero caller churn, same win on file size, easier to revert partially.

### Approach (ordered)
1. Extract `schema.ts` + `types.ts` first.
2. Move `appMeta`, `tags`, `bookmarks`, `favorites` — smallest modules, exercise the pattern.
3. Move `users`, `progress` — medium complexity.
4. Move `folders`, `libraries` — more cross-references.
5. Move `comics` last — largest surface, most query-building.

### Risks
- Transactions that span multiple domains (e.g., `removeComics` now tombstones to `dismissed_paths`) must stay in one place; pick the owning module.
- Prepared-statement reuse: currently some statements are built lazily inside methods. Passing `db` through means each call rebuilds — SQLite's parser is fast, but if any hot path regresses, cache statements on the `LibraryDatabase` instance.

---

## 3. `src/renderer/components/LibraryView.tsx` (1470 lines)

### Current shape
One function component plus two memoized card components. Internally handles:
- Grid + virtualizer state
- Comic query/pagination (`loadInitial`, `loadMore`, filter presets)
- Folder view state (active folder, folder comics)
- Two context menus (comic, folder) with library/folder submenus
- Drag/drop (drop into grid, drop onto folder cards)
- Scan progress listener
- Inline folder rename
- Keyboard shortcuts
- Selection / shift-click / ctrl-click

### Target layout
```
src/renderer/components/library/
  LibraryView.tsx           // orchestration only — wires the hooks and renders the grid
  ComicCard.tsx             // memoized card (exists inline today)
  FolderCard.tsx            // memoized card (exists inline today)
  ComicContextMenu.tsx      // right-click menu + its submenus
  FolderContextMenu.tsx     // right-click menu + inline rename
  ContinueReadingShelf.tsx  // already a separate file
  hooks/
    useComicQuery.ts        // comics state, loadInitial/loadMore, filter/sort
    useFolderView.ts        // active folder + folder comics fetching
    useDropHandler.ts       // handleDragOver/handleDrop (the classifyPaths flow)
    useSelection.ts         // selectedIds + shift/ctrl logic + lastClickedIndex
    useScanProgress.ts      // onScanProgress subscription → toast/overlay state
```

### Approach
1. Pull out `ComicCard` and `FolderCard` into their own files (already memoized — zero-risk move).
2. Extract `useSelection` — self-contained, easy test case.
3. Extract `useDropHandler` — isolated; takes `activeLibraryId`, `activeView`, and callbacks.
4. Extract `useScanProgress`.
5. Extract `ComicContextMenu` + `FolderContextMenu` components. These need props passthrough for the many actions.
6. Extract `useComicQuery` and `useFolderView` last — they own the bulk of state.

### Risks
- The virtualizer's measurement depends on a stable row-height function; don't move that into a hook that re-creates it each render.
- `lastClickedIndex` uses a ref — preserve ref identity across the extraction.
- The two context menus share some actions (move to folder, add tag); factor shared items into a `contextMenuItems.tsx` helper rather than duplicating.

---

## 4. `src/web/admin.js` (1087) + `src/web/app.js` (874) + `src/web/views/reader.js` (918)

### Current shape
Three flat ES modules with many responsibilities each:
- `app.js` — sidebar, routing, tab panel, context menus, drop overlay, state store.
- `admin.js` — login, user management, upload, add-path ingest, dropzone, modals.
- `reader.js` — pager, gestures, controls, preloading, keyboard handlers, settings menu.

### Target layout
```
src/web/
  app/
    index.js            // entry — boots state, wires router, populates sidebar
    state.js            // global `state` + `sidebarCache`
    router.js           // hashchange handling + route parsing
    sidebar.js          // populateSidebar, context menus on sidebar items
    tabPanel.js         // openTabPanel, tabPanelItems, inline rename
    contextMenu.js      // openSideContextMenu, attachLongPress
    drop.js             // wireDrop + drop overlay
  admin/
    index.js            // openAddComic, refreshSession, isAuthenticated, isAdmin, gatherFromDrop
    modal.js            // shared admin modal scaffolding
    auth.js             // login/register/change-password flows
    users.js            // user list/invite/delete
    upload.js           // upload dropzone, file streaming
    ingest.js           // add-path (NDJSON streaming), progress UI
    pathInput.js        // /api/admin/list-dir autocomplete
  views/
    reader/
      index.js          // entry — exposes openReader(comicId)
      pager.js          // page fetch + preload cache
      gestures.js       // touch swipe, pinch-zoom
      controls.js       // top/bottom bars, settings menu
      keyboard.js       // arrow/space/home/end handlers
      reflow.js         // EPUB-specific reflow path
```

### Approach
Each file is independent — do them in parallel commits:

1. **`reader.js`** first. Self-contained (no imports from app/admin). Extract `pager` → `gestures` → `controls` → `keyboard` → `reflow`. Index re-exports `openReader`.
2. **`admin.js`** second. Extract `modal` (shared), then `auth`, `users`, `upload`, `ingest`, `pathInput`. Each export stays the same so `app.js` imports are unchanged.
3. **`app.js`** last. State and router are intertwined; pull `state` + `contextMenu` first (pure), then `sidebar`, `tabPanel`, `drop`, finally `router`.

### Risks
- Browser module graph: every split adds an extra fetch in dev. If latency matters, consider a tiny bundler step (esbuild) — but out of scope for this refactor.
- Event listeners currently rely on top-level script execution order; ensure each new module either self-registers in its own `init()` called from the index, or exports a register function.
- Circular imports between `sidebar.js` ↔ `tabPanel.js` are likely (both call `startInlineRename`) — put `startInlineRename` in `tabPanel.js` and import it into sidebar.

---

## Rollout

- One PR per numbered section above. Ship #1 and #2 before starting #3 (they touch unrelated trees).
- After each PR, run: `npx tsc --noEmit`, start the Electron app, drop a folder, open a comic, open the web UI, upload a comic, rename a collection. Those five flows cover ~90% of the code being moved.
- If a refactor reveals a latent bug, fix it in a separate commit on the same branch — don't mix bug fixes into pure-move commits.

## Out of scope

- No API changes (IPC channels, HTTP routes, DB schema stay identical).
- No new features. If a "while we're here" improvement surfaces, file it instead.
- No dependency changes.
