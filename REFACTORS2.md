# Refactor Notes — Round 2

Follow-up to `REFACTOR.md`. The big-ticket items from that document (library virtualization, JXL decode pipeline, bounded CBR cache, FTS5 search) have all shipped. This file tracks the next batch — surfaces that have started to drift, duplicated code that wasn't worth fighting before but is now visible enough to be worth removing, and structural opportunities that would meaningfully shrink active files.

Items are ordered top-down by leverage, not by difficulty. "Leverage" here means how many future changes get easier per hour spent.

---

## Tier 1 — Cross-cutting structural wins

### Single renderer for both Electron and the embedded web UI

`src/renderer/` (React) and `src/web/` (vanilla ES modules) are roughly parallel implementations of the same product. Each ships its own:

- comic / EPUB / PDF readers (`EpubReaderView.tsx` ↔ `epubReader.js`, `PdfReaderView.tsx` ↔ `pdfReader.js`, `ReaderView.tsx` ↔ `comicReader.js`),
- library grid + cards + sort/filter UI (`LibraryView.tsx` ↔ `views/library/*`),
- sidebar + context menus,
- auth flows (`SettingsDialog.tsx` is Electron-only, but the multi-user login/signup/forgot/reset is all on the web side).

Every feature gets implemented twice and tends to drift — the EPUB theme-toggle bug, the iPadOS touch routing, the inline-style font enforcement were all bugs paid for once per side. The fix is to ship one SPA bundle:

- Render React in both contexts: Electron loads the same Vite dev server URL in dev and the same packaged HTML in prod that the embedded HTTP server serves.
- A tiny preload bridge keeps Electron-only affordances (file dialog, native menu, IPC) addressable from the SPA via feature-detection.
- The `src/web/admin/*` and `src/web/views/*` modules become React components living under `src/renderer/`.

**Files to retire eventually**: everything under `src/web/`. Replace with a `src/web-server/` that just serves the built renderer bundle plus the `/api/*` REST layer.

This is the biggest single refactor available and would reclaim several thousand lines. Worth doing, but it's a multi-day effort — slot it as a focused project, not an incidental cleanup.

### Extract `buildBaseWhere(options)` from the two query builders

`src/main/db/comics.ts` has `queryComics` (~80 lines) and `queryComicsForUser` (~100 lines). The mediaType / FTS-search / tag / excludeFoldered / fileExt branches are copy-pasted between them. Only the user-overlay (joins to `user_progress` + `user_favorites`, plus the read-status branches that depend on `up.*`) differs.

Refactor: pull a `buildBaseWhere(options): { where: string[]; params: SqlParam[] }` helper. Both query functions append their own user-specific predicates afterwards. Saves ~60 lines and prevents the two branches from drifting again — last week it took two edits to land FTS in both.

### Move the EPUB theme primitives into `src/shared/epubTheme.ts`

Both `src/renderer/components/EpubReaderView.tsx` and `src/web/views/reader/epubReader.js` define their own copies of:

- `FONT_FAMILIES`, `FONT_SIZES`, `EPUB_BASE_FONT_SCALE`,
- `getThemeColors(mode)`, `buildEpubTheme(mode, fontFamily)`, `toEpubFontSizePercent(size)`,
- `forceThemeOnContent(contents, mode, fontFamily)` — the inline-`!important` walker.

These are pure functions of strings and DOM nodes; they don't need to be re-implemented per host. Hoist them to `src/shared/epubTheme.ts` and import from both sides. Pre-requisite for the bigger UI unification above; cheap to land independently.

---

## Tier 2 — File-level shrinking

### `LibraryView.tsx` (841 lines → 639 lines, partially done)

The earlier hooks pass extracted query / filters / selection / folder-context-menu / details-modal. The remaining clusters:

1. ~~**`useDragDropFiles`**~~ — extracted to `library/hooks/useDragDropFiles.ts`. ✓
2. ~~**`useComicContextMenu`**~~ — extracted to `library/hooks/useComicContextMenu.ts`. ✓
3. **JSX subcomponents** — `<LibraryHeader>` (search + scan + breadcrumbs), `<LibraryGrid>` (the virtualized renderer), `<LibraryDropOverlay>` (drag-over state). These each bring 30–80 lines out of the parent.

Target after split: ~400 lines in `LibraryView.tsx`, with each new hook in `library/hooks/`.

### `App.tsx` (350 lines → 270 lines, partially done)

App.tsx is the comic-reader page-cache + the file-open dispatcher + the view-router + the keyboard handler in one component.

- ~~**`useReaderPageCache(pageCount)`**~~ — extracted to `library/hooks/useReaderPageCache.ts`. ✓
- **`prepareBookReaderState(filePath, comic)`** — the chunk inside `openFile` that sniffs ext + builds the `bookReader` object can move out as a pure helper.
- **`useFileOpener({ ... })`** — bundles `openFile`, `backToLibrary`, `nextPage`, `previousPage`, the IPC subscriptions for `file-opened` and `open-settings`, and the keyboard binding.

Target after split: ~150 lines in `App.tsx`, mostly JSX wiring.

### `comicReader.js` (363 lines)

After the gestures + keyboard split, the remaining bulk is the toolbar wiring — six button-click handlers (zoom, direction, spread, orientation, fullscreen, bookmark, favorite) plus their initial state.

- Extract `setupExtraControls(toolbar, prefs, ctx)` into `comicReader/controls.js` returning the button refs.
- Extract `setupBookmarks(ctx, recordId)` and `setupFavorite(ctx, record)` — they're each ~20 lines and self-contained.

Target: `comicReader.js` shrinks to the page-load + render loop (~200 lines).

### `web/app/tabPanel.js` (348 lines)

The mobile tab-panel pivots on `kind: 'libraries' | 'folders' | 'tags'`. Three independent renderers in one function. Split into `web/app/tabPanel/{libraries,folders,tags}.js`, each owning its own list builder and create/edit/delete flow. Parent file becomes the shell + open/close machinery (~80 lines).

### `web/admin/contextMenu.js` (359 lines)

Mixes the right-click card context menu with the in-place tag editor modal. The tag editor is its own coherent UI; lift it to `web/admin/tagEditor.js`. Drops `contextMenu.js` to ~200 lines.

---

## Tier 3 — Targeted deduplication / hygiene

### ~~One LRU primitive instead of four~~ ✓

~~Four places implement their own LRU~~ — unified into `src/shared/lru.ts` with `LruByCount<K, V>` and `LruByBytes<K, V>`. The archive-handle cache (refcount + TTL) remains bespoke but uses these primitives for bookkeeping.

### ~~Codegen the preload whitelist from the IPC type map~~ ✓

Done via `Object.keys(IpcInvokeMap)` / `Object.keys(IpcEventMap)` / `Object.keys(IpcSendMap)` in `src/shared/ipcTypes.ts:117-119`. Adding a channel now only touches the type map + handler + client.

### ~~Drop the `ComicRecord = MediaRecord` alias~~ ✓

Alias removed from `src/shared/types.ts`; all callers migrated to `MediaRecord`. (`WebComicRecord` in `webServer/mapping.ts` is a separate web-facing interface, not the old alias.)

### ~~Replace `SettingsDialog.tsx` 7 useStates with a reducer~~ ✓

Converted to `useReducer` — `idle | dirty | saving | error` state machine in place.

### `web/views/reader/state.js` global mutable bag

`state.readerEl`, `state.epubBook`, `state.epubRendition`, `state.comicState`, `state.touchStartX`, `state.pdfDoc`. Grab-bag globals shared across all reader entry points. Cleaner: each reader's `render(el, record)` returns a session object (`{ destroy(), …}`) that owns its own state. The shared file becomes just the wake-lock helpers.

### `LibrarySidebar.tsx` — extract `useSidebarFolderContextMenu`

The library context menu was already pulled out into `useSidebarLibraryContextMenu`. The folder-side has the same shape: rename in place, delete with confirm, drop-target highlighting. Mirror the hook for folders so the sidebar component stops being a state-bag for two parallel context menus.

### Single-source filter state

`src/web/app/state.js` and `src/renderer/components/library/hooks/useLibraryFilters.ts` track the same fields (`mediaType`, `fileExt`, `readStatus`, `favoritesOnly`). When the unified-renderer refactor in Tier 1 happens this duplication goes away, but as an interim improvement, type the shape in `src/shared/filterState.ts` so both sides agree on the keys.

---

## Tier 4 — Server-side cleanups

### Compose `webServer.ts` dispatcher as middleware

`src/main/webServer.ts` `handleRequest` has rate limiting, better-auth routing, the API_ROUTES loop, and static-file fallback all inline. Lifting to `applyMiddleware([cors, rateLimit, betterAuthRouter, apiRouter, staticFiles])` makes the order legible and lets each piece be unit-tested independently. Doesn't require swapping in Hono/Fastify; just a small chaining helper.

### Extract `confirmDestructive(win, opts)` helper for the menu

`src/main/menu.ts` has near-identical confirm dialogs for "Clear Database" and "Reset Admin Password" — same shape (warning, two buttons, detail block, response check). Extract once. Trivial DRY.

### `archiveLoader.getCbrPage` — split mode branches

The new file-mode / data-mode CBR support put the branch inside the cache-miss path. Cleaner:

```ts
async function extractCbrPage(handle: CbrHandle, name: string): Promise<Buffer> {
  return handle._mode === 'data'
    ? extractFromData(handle, name)
    : extractFromFile(handle, name);
}
```

…and `getCbrPage` becomes a thin cache-or-load wrapper. Same shape as `imageResizer.getCachedOrResize`, which makes the pattern recognizable.

### Auto-derive `vite.main.config.ts` externals from `package.json`

The hand-curated externals list drifts. Every new native dep + every CDN-loaded library has to be added by hand, and forgetting it produces obscure bundling errors. A small script could read `dependencies` and write the externals list, with a small `bundleable` allowlist for the few packages that genuinely need to be bundled.

---

## Tier 5 — "Probably not worth it yet"

Listed for completeness; revisit only if the surrounding code starts changing often.

- **Group `ipcClient.ts` exports under namespaces** (`api.archive.open(…)`, `api.library.query(…)`). Helps discoverability slightly; flat is also fine.
- **Declarative endpoint registry for `web/api.js`**. The `request()` helper already collapsed the boilerplate. A registry would be tidier but `pnpm tsc` doesn't catch web-side mistakes anyway, so the typing payoff is small.
- **Inline `dropValidator.ts`** into `mediaTypes.ts`. The thin wrapper exists for backwards compat; not worth the churn.
- **CMakeLists.txt removal**. Still mentioned in the original `REFACTOR.md` — can be deleted in passing.

---

## Suggested order if executing as a campaign

1. **Tier 1.3** (move EPUB theme to `src/shared/`) — small, no behavior risk, prerequisite for the bigger UI unification.
2. **Tier 1.2** (extract `buildBaseWhere`) — clear win, isolated.
3. **Tier 2.1** (`LibraryView.tsx` hooks) — daily-touched file, finite work.
4. **Tier 2.2** (`App.tsx` page cache hook) — daily-touched, finite.
5. **Tier 3.1** (one LRU primitive) — small file count, eliminates a recurring pattern.
6. **Tier 3.2** (codegen IPC whitelist) — eliminates a recurring footgun.
7. **Tier 3.4** (`SettingsDialog` reducer) — small, removes a state-bug class.
8. **Tier 4** items — opportunistic.
9. **Tier 1.1** (one renderer for both UIs) — only when a multi-day slot opens up. This is the largest single payoff in the document and the most disruptive.
