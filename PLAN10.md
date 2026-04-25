# PLAN10 — Port Legacy Web UI to SvelteKit

## Context

The legacy SPA in `src/web/` (vanilla JS, hash router, ~1790 LOC of CSS, ~25 view modules) is the sole frontend after the Electron shell was dropped (commit `2144fdd`). A SvelteKit scaffold already exists at `src/web-next/` with Tailwind v4, shadcn-svelte, and a partial route tree (`/`, `/login`, `/read/[id]/[page]`, `/add-comics`, `/users/new`, `/forgot-password`). The API client modules are stubbed in `src/web-next/src/lib/api/` but most views are empty shells.

Goal: bring `src/web-next/` to feature parity with `src/web/`, **matching the legacy dark visual design** (not introducing shadcn's defaults), while running it under the Vite dev server (`pnpm web:dev` → port 5173, proxying `/api` → 8008) for live progress monitoring.

Backend (`src/server/`) is **not changing** — Svelte just consumes the existing API.

---

## Pre-flight

1. Start the Vite dev server in one terminal: `pnpm web:dev` (host: localhost:5173, proxies `/api` → :8008).
2. Start the Fastify API in another: `pnpm build && pnpm start` (or run dev TS directly), serving on :8008.
3. Confirm `src/web-next/src/lib/api/index.ts` re-exports compile cleanly: `pnpm web:check`.

---

## Phase 1 — Design system port (match legacy look)

The legacy palette and tokens live in `src/web/style.css:6–49`. Tailwind v4 uses `@theme` in CSS — port tokens once, then everything cascades.

1. **Edit `src/web-next/src/app.css`** — add `@theme` block with legacy tokens:
   - Colors: `--color-bg: #0a0a0a`, `--color-surface: #141414`, `--color-surface-2: #1c1c1c`, `--color-border: #2a2a2a`, `--color-accent: #4a9eff`, `--color-text: #e8e8e8`, `--color-danger: #e05252`.
   - Layout: `--nav-h`, `--tab-bar-h`, `--sidebar-w`, `--card-w`.
   - Radius: `--radius-DEFAULT: 6px`, `--radius-lg: 10px`.
2. Set `<body>` background/text in `app.html` or `+layout.svelte` to `bg-bg text-text` so the dark theme is global, not per-page.
3. **Override shadcn defaults**: edit `src/web-next/src/lib/components/ui/button/button.svelte` and `card/*.svelte` variants so primary uses `--color-accent`, surfaces use `--color-surface`, borders use `--color-border`. Keep shadcn structure; just retheme.
4. Port the card grid pattern (`src/web/style.css:268–476`) to a reusable `lib/components/ComicCard.svelte` — 2:3 aspect thumb, hover lift, favorite heart, progress bar, badge.
5. Port nav bar (`style.css:54–110`) and sidebar (`style.css:155–244`) to `lib/components/NavBar.svelte` and `Sidebar.svelte`. Update `+layout.svelte` to use them.

**Verify:** load `http://localhost:5173/`, visually compare to legacy at `http://localhost:8008/`. Cards, nav, and sidebar should match.

---

## Phase 2 — Core library views

Reuse existing API client modules in `src/web-next/src/lib/api/` (`comics.ts`, `libraries.ts`, `folders.ts`, `tags.ts`).

6. **`/` (library root)** — fill in `src/web-next/src/routes/+page.svelte`:
   - Filters bar (mediaType, fileExt, readStatus, favoritesOnly, sort, search) → bind to a `lib/stores/filters.ts` writable store.
   - Continue-reading shelf (authenticated only) via `fetchContinueReading`.
   - Infinite-scroll grid via `fetchComics` with `IntersectionObserver` sentinel (PAGE_SIZE=48 to match legacy).
7. **`/library/[id]`** — new route mirroring `/` but scoped via `fetchLibraryComics(id, …)`.
8. **`/folder/[id]`** — new route, uses `fetchFolderComics`.
9. **`/tag/[name]`** — new route, filters comics by tag.
10. **`/recent`** and **`/continue`** — full-page versions of the shelves (`fetchRecentlyRead`, `fetchContinueReading`).
11. Sidebar (built in Phase 1) hydrates from `fetchLibraries`, `fetchFolders`, `fetchTags` in `+layout.ts` and links to the routes above.

**Verify:** click each sidebar entry; grid loads with correct scope; scroll triggers more pages; filter changes refetch.

---

## Phase 3 — Reader

The legacy reader is the largest module (~700 LOC for comic alone, plus epub.js + pdf.js wrappers).

12. **Comic reader** (`/read/[comicId]/[page]/+page.svelte`): port `src/web/views/reader/comicReader.js`:
    - Tap zones (left=prev, right=next, center=toggle UI).
    - Pinch-zoom + pan (Pointer Events; reuse the legacy gesture math directly — copy into `lib/reader/gestures.ts`).
    - Zoom modes (fit-width / fit-height / original), spread (single/double), direction (LTR/RTL), transition (slide/fade), fullscreen, wake-lock.
    - Page slider, bookmarks panel, favorite toggle.
    - Persist prefs in `localStorage` under same keys the legacy code uses (so users don't reset).
    - On page change: `updateProgress(comicId, page)`; on open: `logHistory`.
13. **EPUB reader**: dynamic-import `epubjs` from CDN inside `onMount` (matching legacy CDN load); component at `lib/reader/EpubReader.svelte`. Font size, family, theme toggle, spread.
14. **PDF reader**: dynamic-import `pdfjs-dist` from CDN; component at `lib/reader/PdfReader.svelte`.
15. **Reader dispatcher**: in `/read/[comicId]/+page.svelte`, fetch comic, branch on `mediaType`/`fileExt` to mount the right reader (mirrors `src/web/views/reader.js`).

**Verify:** open a CBZ, EPUB, and PDF each. Test pinch-zoom on touch, page nav, bookmark create/edit/delete, progress survives reload.

---

## Phase 4 — Auth & session

16. **`/login`**: complete `src/web-next/src/routes/login/+page.svelte` — username/password, calls `login()`, redirects to returnTo.
17. Session probe in `+layout.ts` via `getSession()`; expose `{ user, isAdmin, guestAccess }` via context or a `lib/stores/session.ts` store.
18. Gate admin UI with `{#if $session.isAdmin}` (replaces legacy `.admin-authenticated` class).
19. **`/forgot-password`** + **`/reset-password/[token]`**: complete using `requestPasswordReset` / `resetPassword` API calls.

**Verify:** login persists across reload, logout clears session, admin-only buttons appear/disappear correctly.

---

## Phase 5 — Admin features

20. **`/add-comics`** (already scaffolded): port `src/web/admin/upload.js`:
    - Drag-drop + file picker, accepts `.cbz .cbr .epub .pdf .mobi`.
    - **Use XHR (not fetch)** to get per-file progress events; POST to `/api/admin/upload` with headers `X-CB8-Filename`, `X-CB8-Relpath`.
    - Per-file + overall progress bars matching legacy styling (`style.css:1300+`).
21. **`/users`** (admin): list (`getUsers`), create form (already at `/users/new`), delete, toggle admin role. Block self-delete and last-admin delete (server already enforces; just surface errors).
22. **Library/folder/tag management** — modal-based, mirroring `src/web/admin/menu.js`:
    - Build a generic `lib/components/Modal.svelte` matching `style.css:1081–1300`.
    - Sidebar "+" buttons (admin-only) open create modals → `createLibrary`, `createFolder`.
    - Right-click / long-press on sidebar items → rename/delete via context menu.
23. **Card context menu** (`src/web/admin/contextMenu.js`): `lib/components/CardContextMenu.svelte` — open reader, edit metadata, add to library/folder, mark read/unread, delete.
24. **Bulk select**: shift-click selection state in a `lib/stores/selection.ts` store; floating action bar for bulk delete / add to library.
25. **Add-path streaming** (`src/web/admin/addPath.js`): use `fetch` + `response.body.getReader()` to consume NDJSON ingest events from `POST /api/admin/add-path`; render progress in modal.
26. **Metadata editor**: modal calling `metadata-search` + `PUT /metadata` (used from the card context menu).

**Verify:** upload a small CBZ end-to-end; create/rename/delete a library; bulk-delete two items; ingest a host directory and watch the stream.

---

## Phase 6 — Mobile responsive & polish

27. Port mobile breakpoints from `style.css:1531–1790`:
    - Bottom tab bar (`lib/components/TabBar.svelte`) below 768px.
    - Side drawer (`TabPanel.svelte`) for collections/folders/tags.
    - Sort sheet modal replacing the desktop sort `<select>`.
    - Filter pill strips for mediaType/fileExt/readStatus.
28. Toast component (`lib/ui/toast.ts` already exists) — confirm visual parity with legacy `src/web/app/toast.js`.
29. Pull-to-refresh in reader (legacy has it; optional but listed for parity).
30. Replace any remaining default Tailwind/shadcn neutral colors with legacy tokens — sweep `lib/components/ui/*`.

**Verify:** Chrome devtools → mobile viewport (375px). Tab bar appears, drawer opens, reader gestures work.

---

## Phase 7 — Production wiring

31. `pnpm web:build` produces `src/web-next/build/`.
32. Either set `CB8_STATIC_ROOT=src/web-next/build` at server startup, or copy the build output into `src/web/` (replacing legacy). Update `docker/Dockerfile` to run `pnpm web:build` before copying.
33. Once Svelte UI is at parity and shipped, delete `src/web/` (legacy) in a separate commit.

---

## Critical files

**To create:**
- `src/web-next/src/lib/components/{NavBar,Sidebar,ComicCard,Modal,TabBar,TabPanel,CardContextMenu}.svelte`
- `src/web-next/src/lib/reader/{ComicReader,EpubReader,PdfReader,gestures}.{svelte,ts}`
- `src/web-next/src/lib/stores/{filters,session,selection}.ts`
- `src/web-next/src/routes/{library/[id],folder/[id],tag/[name],recent,continue,users,reset-password/[token]}/+page.svelte`

**To edit:**
- `src/web-next/src/app.css` (theme tokens)
- `src/web-next/src/routes/+layout.svelte`, `+layout.ts` (nav, sidebar, session)
- `src/web-next/src/routes/+page.svelte` (library root)
- `src/web-next/src/routes/{login,add-comics,forgot-password,read/[comicId]/[page],users/new}/+page.svelte`
- `src/web-next/src/lib/components/ui/button/button.svelte` and `card/*.svelte` (retheme)

**To reference (do not modify):**
- `src/web/style.css` — design source of truth.
- `src/web/views/reader/comicReader.js` — gesture/zoom math to port verbatim.
- `src/web/admin/upload.js` — XHR progress pattern.
- `src/web/admin/addPath.js` — NDJSON stream consumer pattern.
- `src/web-next/src/lib/api/*` — already-stubbed API client.

---

## End-to-end verification

After each phase, with both servers running:
- Open `http://localhost:5173` in a browser.
- Compare side-by-side against `http://localhost:8008` (legacy).
- Test on a touch device or Chrome devtools mobile emulation.
- `pnpm web:check` for type/svelte errors after each phase.
- Final: `pnpm web:build` succeeds; production server with `CB8_STATIC_ROOT=src/web-next/build` serves a working app indistinguishable from legacy.
