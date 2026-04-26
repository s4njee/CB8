# Refactor Notes — Round 2

Follow-up to `REFACTOR.md`. The big-ticket items from that document (library virtualization, JXL decode pipeline, bounded CBR cache, FTS5 search) have all shipped. This file tracks the next batch — surfaces that have started to drift, duplicated code that wasn't worth fighting before but is now visible enough to be worth removing, and structural opportunities that would meaningfully shrink active files.

Items are ordered top-down by leverage, not by difficulty. "Leverage" here means how many future changes get easier per hour spent.

---

## Tier 1 — Cross-cutting structural wins

### ~~Single renderer for both Electron and the embedded web UI~~ ✓ (PLAN10)

Done. `src/renderer/` was deleted and Electron now loads `src/web/` via
the embedded HTTP server. Roughly 5,700 lines of duplicated React UI
came out and IPC was narrowed to host-only channels. See `PLAN10.md` for
the migration history.

### Extract `buildBaseWhere(options)` from the two query builders

`src/main/db/comics.ts` has `queryComics` (~80 lines) and `queryComicsForUser` (~100 lines). The mediaType / FTS-search / tag / excludeFoldered / fileExt branches are copy-pasted between them. Only the user-overlay (joins to `user_progress` + `user_favorites`, plus the read-status branches that depend on `up.*`) differs.

Refactor: pull a `buildBaseWhere(options): { where: string[]; params: SqlParam[] }` helper. Both query functions append their own user-specific predicates afterwards. Saves ~60 lines and prevents the two branches from drifting again — last week it took two edits to land FTS in both.

### ~~Move the EPUB theme primitives into `src/shared/epubTheme.ts`~~ ✓ (obsoleted by PLAN10)

Only `src/web/views/reader/epubReader.js` defines these now; the React
copy was deleted with the rest of `src/renderer/`. No duplication left
to extract.

---

## Tier 2 — File-level shrinking

### ~~`LibraryView.tsx` shrinking~~ ✓ (file deleted by PLAN10)

### ~~`App.tsx` shrinking~~ ✓ (file deleted by PLAN10)

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

### ~~`LibrarySidebar.tsx` hook split~~ ✓ (file deleted by PLAN10)

### ~~Single-source filter state~~ ✓ (obsoleted by PLAN10)

Only `src/web/app/state.js` carries filter state now; the React hook that
mirrored it is gone.

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

- **Declarative endpoint registry for `web/api.js`**. The `request()` helper already collapsed the boilerplate. A registry would be tidier but `pnpm tsc` doesn't catch web-side mistakes anyway, so the typing payoff is small.
- **Inline `dropValidator.ts`** into `mediaTypes.ts`. The thin wrapper exists for backwards compat; not worth the churn.
- **CMakeLists.txt removal**. Still mentioned in the original `REFACTOR.md` — can be deleted in passing.

---

## Suggested order if executing as a campaign

1. **Tier 1** `buildBaseWhere` extraction — clear win, isolated.
2. **Tier 2** `comicReader.js` controls / `tabPanel.js` / `contextMenu.js` splits — finite, daily-touched.
3. **Tier 3** `state.js` session-object refactor.
4. **Tier 4** opportunistic server-side cleanups.
