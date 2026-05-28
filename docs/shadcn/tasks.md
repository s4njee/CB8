# CB8 shadcn Rewrite — Tasks

Phases are ordered by dependency. Each task is atomic enough to commit separately.
Check off tasks as completed.

> **Before starting any task, skim `context.md`.** It catalogs the build-topology change
> (the existing pipeline doesn't compile the renderer — see §1), exact API shapes (§4),
> initial auto-login flow (§6), the `cb8:library-changed` event-bus → TanStack Query
> invalidation map (§7), sentinel constants and localStorage keys not to break (§8), the
> hash-route order (§9), why the reader is an overlay rather than a route (§10), and a
> smoke-test checklist (§27).

---

## Phase 0 — Scaffolding

> **Read context.md §1 first.** The existing pipeline does not compile the renderer at
> all. This phase introduces a renderer build target and rewires Forge + Docker copies.

- [ ] **0.1** Decide source layout. Recommended: move new source to `src/renderer/`, keep
  legacy `src/web/` until everything is ported (then delete in Phase 15).
  Add `src/renderer/index.html` as the Vite entry, with `<div id="root"></div>` and the
  inline `data-theme` script (see context.md §11).

- [ ] **0.2** Install React 18 + JSX tooling  
  `pnpm add react react-dom`  
  `pnpm add -D @vitejs/plugin-react @types/react @types/react-dom`

- [ ] **0.3** Install Tailwind CSS v3 + PostCSS  
  `pnpm add -D tailwindcss postcss autoprefixer`  
  `pnpm dlx tailwindcss init -p`  
  Configure `tailwind.config.js` with `content: ['src/renderer/**/*.{tsx,ts,html}']`.

- [ ] **0.4** Install shadcn/ui CLI and initialise (run from `src/renderer/`)  
  `pnpm dlx shadcn-ui@latest init`  
  Accept defaults; output to `src/renderer/components/ui/`; use CSS variables.

- [ ] **0.5** Install runtime libs  
  `pnpm add react-router-dom @tanstack/react-query zustand clsx tailwind-merge`

- [ ] **0.6** Create `vite.renderer.config.ts`  
  ```ts
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';
  import path from 'node:path';
  export default defineConfig({
    root: 'src/renderer',
    plugins: [react()],
    build: { outDir: path.resolve(__dirname, 'dist/web'), emptyOutDir: true },
    server: {
      port: 5173,
      proxy: { '/api': 'http://localhost:8008' },  // dev: proxy API to standalone server
    },
    resolve: { alias: { '@': path.resolve(__dirname, 'src/renderer') } },
  });
  ```

- [ ] **0.7** Add npm scripts to `package.json`  
  `"dev:renderer": "vite --config vite.renderer.config.ts"`  
  `"build:renderer": "vite build --config vite.renderer.config.ts"`  
  Update `build:standalone` to depend on `build:renderer` (or add a `prebuild:standalone`
  alias) so the Dockerfile picks up the built SPA.

- [ ] **0.8** Update `src/main/webServer/server.ts:resolveStaticRoot()`  
  Prepend `path.join(__dirname, '../../dist/web')` to the candidates list so the Electron
  dev run and standalone server find the new bundle first. Keep the existing fallbacks
  for the brief window where both `src/web/` and `dist/web/` coexist.

- [ ] **0.9** Update `forge.config.ts` `packageAfterCopy` hook  
  Change `path.join(__dirname, 'src', 'web')` to `path.join(__dirname, 'dist', 'web')`.  
  The destination (`appDir/web`) stays the same.

- [ ] **0.10** Update `packaging/docker/Dockerfile`  
  Add `RUN pnpm build:renderer` before `RUN pnpm build:standalone`.  
  Change `COPY --from=builder /src/src/web/ /app/web/` → `COPY --from=builder /src/dist/web/ /app/web/`.

- [ ] **0.11** Create `src/renderer/main.tsx`  
  `ReactDOM.createRoot(document.getElementById('root')!).render(<App />)`

- [ ] **0.12** Create `src/renderer/globals.css`  
  Tailwind `@tailwind base` / `@tailwind components` / `@tailwind utilities` directives.  
  Paste shadcn CSS variable block.  
  Add six `data-theme` overrides (red/blue/green/purple/orange/teal) — see context.md §23
  for the value-mapping table.  
  Reader-specific CSS (`.comic-reader`, `.comic-stage`, `overscroll-behavior` rules) lives
  here too — copy from `src/web/style.css` lines 816+ verbatim until Phase 7 ports them.

- [ ] **0.13** Move `src/web/manifest.json` and `src/web/favicon.svg` into
  `src/renderer/public/` so Vite copies them to the build output.

- [ ] **0.14** Verify cold start  
  - `pnpm dev:renderer` runs Vite, opens browser at `:5173`, blank React app renders with
    Tailwind classes applied.  
  - `pnpm build:renderer` produces `dist/web/index.html` + JS chunks.  
  - `pnpm start:standalone` (after building both) serves the new SPA at `:8008`.

---

## Phase 1 — API & types

- [ ] **1.1** Copy `src/web/api.js` → `src/web/lib/api.ts`  
  Add TypeScript interfaces for all return shapes:  
  `Comic`, `Folder`, `Library`, `Tag`, `Bookmark`, `SeriesGroup`, `VolumeGroup`, `ChapterGroup`,  
  `Progress`, `Session`, `User`, `IngestProgress`, `HostInfo`.

- [ ] **1.2** Create `src/web/lib/queryClient.ts`  
  Singleton `QueryClient` with sensible defaults (`staleTime: 30_000`, `retry: 1`).

- [ ] **1.3** Create `src/web/lib/utils.ts`  
  Port `cn()` helper (Tailwind class merge via `clsx` + `tailwind-merge`).  
  Port `itemCountLabel`, `numberLabel`, format helpers from `strips.js` and `cards.js`.

- [ ] **1.4** Create `src/web/store/uiStore.ts`  
  Zustand store replacing `app/state.js`:  
  `mediaType`, `sortBy`, `search`, `fileExt`, `readStatus`, `favoritesOnly`, `tabPanel`, `theme`.  
  Include actions `setSearch`, `setMediaType`, `setSortBy`, `setTheme`, etc.

- [ ] **1.5** Create `src/web/store/readerStore.ts`  
  Zustand store: `prefs` (zoom/direction/spread/transition), `currentPage`, `pdfDoc`, `comicState`.  
  Include `setPrefs`, `gotoPage`, `reset`.

---

## Phase 2 — shadcn components

Add shadcn components as they are needed. Install all up-front to avoid partial states.

- [ ] **2.1** `pnpm dlx shadcn-ui@latest add button input select slider sheet dialog dropdown-menu badge progress scroll-area separator tooltip tabs checkbox switch label sonner`

- [ ] **2.2** Verify each generated component file exists in `src/web/components/ui/`.

- [ ] **2.3** Wire `<Toaster />` (Sonner) into `app.tsx`.  
  Create `src/web/hooks/useToast.ts` re-exporting `toast` from `sonner`  
  (replaces `showToast` from `app/toast.js`).

---

## Phase 3 — App shell

- [ ] **3.1** Create `src/web/app.tsx`  
  `QueryClientProvider` → `HashRouter` → `AppShell` → `<Routes>` (stubs returning `<div>` for now).

- [ ] **3.2** Create `src/web/components/layout/Navbar.tsx`  
  shadcn `Input` (search, debounced → `uiStore.setSearch`).  
  Media type toggle buttons (shadcn `Button` variant="ghost" with active styling).  
  Sort `Select` (desktop).  
  Admin `Button` + add-comic `Button`.  
  Theme: reads `uiStore.theme`; applies `data-theme` to `<html>` on change.

- [ ] **3.3** Create `src/web/components/layout/Sidebar.tsx`  
  `ScrollArea` wrapper. Three sections: Library links, Folders, Collections, Tags.  
  Each populated via `useQuery(['folders'])` / `useQuery(['libraries'])` / `useQuery(['tags'])`.  
  Active link driven by `useLocation`.  
  Add-folder / add-collection buttons trigger admin modal.

- [ ] **3.4** Create `src/web/components/layout/SortSheet.tsx`  
  shadcn `Sheet` (side="bottom").  
  Five sort options as `Button` rows. Closes on selection; updates `uiStore.setSortBy`.

- [ ] **3.5** Create `src/web/components/layout/TabBar.tsx`  
  Mobile-only bottom bar (hidden at `md:` breakpoint).  
  Five tabs: All, Recent, Collections, Folders, Tags.  
  All / Recent navigate; Collections / Folders / Tags open `TabPanel`.

- [ ] **3.6** Create `src/web/components/layout/TabPanel.tsx`  
  shadcn `Sheet` (side="bottom") listing the active panel's items.  
  Driven by `uiStore.tabPanel`.

- [ ] **3.7** Create `src/web/components/layout/AppShell.tsx`  
  Compose Navbar + Sidebar (desktop) + `<main>` outlet + TabBar + SortSheet + TabPanel.  
  Reader overlay logic: if path matches `/read/*`, render `ReaderOverlay`; else render page outlet.

- [ ] **3.8** Smoke test: navigation between stub pages works; sidebar populates; sort sheet opens.

---

## Phase 4 — Library grid

- [ ] **4.1** Create `src/web/hooks/useInfiniteComics.ts`  
  `useInfiniteQuery` wrapping `api.fetchComics`. Handles `offset`/`limit` pagination.  
  Returns `{ comics, fetchNextPage, hasNextPage, isFetching }`.

- [ ] **4.2** Create `src/web/components/library/ComicCard.tsx`  
  Thumbnail `<img>` with fallback SVG placeholder.  
  Format `Badge`. Progress bar. Title. Completed overlay.  
  Links to `#/read/:id`.

- [ ] **4.3** Create `src/web/components/library/GroupCard.tsx`  
  Used for series, volume, folder groups.  
  Thumbnail, badge label, count subtitle, href.

- [ ] **4.4** Create `src/web/components/library/FolderCard.tsx`  
  Folder-specific card variant (folder icon when no thumbnail).

- [ ] **4.5** Create `src/web/components/library/ContextMenu.tsx`  
  shadcn `DropdownMenu` with items: Open, Mark read/unread, Add to collection, Add to folder,  
  Set tags, Delete. Triggered by right-click on desktop, long-press on mobile.

- [ ] **4.6** Create `src/web/components/library/SelectionBar.tsx`  
  Shown when one or more cards are selected.  
  shadcn `Button` actions: Add to collection, Add to folder, Delete, Clear.

- [ ] **4.7** Create `src/web/components/library/FilterStrips.tsx`  
  Media type strip (All / Comics / Books).  
  File extension strip (epub / pdf / cbz / cbr).  
  Read status strip (All / Unread / In Progress / Completed).  
  Favorites toggle.  
  All read from / write to `uiStore`.

- [ ] **4.8** Create `src/web/components/library/LibraryGrid.tsx`  
  Renders cards from `useInfiniteComics`.  
  Sentinel `<div ref>` at bottom; `IntersectionObserver` triggers `fetchNextPage`.  
  Shows skeleton cards while loading; empty state when no results.

- [ ] **4.9** Create `src/web/components/library/ContinueShelf.tsx`  
  Horizontal `ScrollArea`. `useQuery(['continue-reading'])`.  
  Shown only on `AllPage` when there are in-progress items.

- [ ] **4.10** Create `src/web/pages/AllPage.tsx`  
  `ContinueShelf` + `FilterStrips` + `LibraryGrid`.  
  Passes filters from `uiStore` to `LibraryGrid`.  
  When `uiStore.search` is non-empty, switches to series-grouped browse view.

- [ ] **4.11** Create `src/web/pages/RecentPage.tsx`  
  `useQuery(['recently-read'])`. Simple `LibraryGrid` with no filters.

- [ ] **4.12** Create `src/web/pages/ContinuePage.tsx`  
  `useQuery(['continue-reading'])`. Flat grid view (not shelf).

- [ ] **4.13** Create `src/web/pages/LibraryPage.tsx`  
  `useParams({ id })`. `useInfiniteQuery` for library comics.  
  Collection action buttons (rename, delete, manage items).

- [ ] **4.14** Create `src/web/pages/TagPage.tsx`  
  `useParams({ tag })`. `useInfiniteQuery` filtered by tag.

---

## Phase 5 — Folder & browse hierarchy

- [ ] **5.1** Create `src/web/pages/FolderPage.tsx`  
  `useParams({ id })`. Fetches series groups. Mixed series view (named volumes + unnumbered comics).

- [ ] **5.2** Create `src/web/pages/FolderSeriesPage.tsx`  
  Volume groups + unnumbered comics inline. `isSingleUnnumberedVolume` shortcut.

- [ ] **5.3** Create `src/web/pages/FolderVolumePage.tsx`  
  Chapter groups or fall-through to comics.

- [ ] **5.4** Create `src/web/pages/FolderChapterPage.tsx`  
  Flat comic grid.

- [ ] **5.5** Create `src/web/pages/BrowseSeriesPage.tsx`  
  Global browse (no folder scope). Volume groups + unnumbered comics.

- [ ] **5.6** Create `src/web/pages/BrowseVolumePage.tsx`  
  Chapter groups or flat comics.

- [ ] **5.7** Create `src/web/pages/BrowseChapterPage.tsx`  
  Flat comic grid.

- [ ] **5.8** Implement breadcrumb strip component (`src/web/components/library/Breadcrumb.tsx`)  
  Replaces `routeTitle()` from `strips.js`. Renders the hierarchy path as clickable links.

---

## Phase 6 — Reader shell

- [ ] **6.1** Create `src/web/components/layout/ReaderOverlay.tsx`  
  Full-viewport `<div>` overlay rendered when path matches `/read/*`.  
  Rendered on top of the library view (no route swap) so library is preserved on back.  
  Mounts/unmounts reader content; calls `destroyReader` cleanup on unmount.

- [ ] **6.2** Create `src/web/pages/ReaderPage.tsx`  
  `useParams({ id, page })`. Fetches `api.fetchComic(id)`. Dispatches to the right reader
  component based on `record.mediaType` / `record.fileExt`.

- [ ] **6.3** Create `src/web/components/reader/ReaderToolbar.tsx`  
  shadcn `Button` for back (calls `navigate(-1)`), plus action slots filled by each reader.  
  shadcn `Slider` for page position.  
  Auto-hide logic via `useEffect` + `setTimeout`.

---

## Phase 7 — Comic reader

- [ ] **7.1** Create `src/web/hooks/useComicGestures.ts`  
  Port `gestures.js` pinch-zoom / pan / swipe to a hook.  
  Accepts `{ stageRef, readerRef, pan, applyTransform, resetTransform, onSwipe }`.  
  Pure imperative: attaches/detaches event listeners in `useEffect`.

- [ ] **7.2** Create `src/web/hooks/useWakeLock.ts`  
  Wraps `navigator.wakeLock.request('screen')`. Acquires on mount, releases on unmount.

- [ ] **7.3** Create `src/web/components/reader/ComicReader.tsx`  
  Port `comicReader.js`.  
  Two `<img ref>` for spread mode. Tap zones. Page preload cache (`useRef<Map>`).  
  `useComicGestures` for pinch/swipe.  
  Keyboard handler via `useEffect` + `document.addEventListener`.  
  All toolbar extra buttons (zoom, direction, spread, orient, bookmark, favorite, fullscreen) passed
  as `actions` prop to `ReaderToolbar`.

- [ ] **7.4** Port `comicReader/keyboard.js` → `src/web/hooks/useComicKeyboard.ts`  
  Same key bindings; expressed as a `useEffect`.

- [ ] **7.5** Wire `readerStore` prefs (zoom, direction, spread, transition) and `gotoPage`.

- [ ] **7.6** Test comic reader on desktop and iPad (pinch, swipe, keyboard, spread, fullscreen).

---

## Phase 8 — Epub reader

- [ ] **8.1** Create `src/web/components/reader/EpubReader.tsx`  
  Port `epubReader.js`.  
  `<div ref>` that epubjs renders into; lifecycle managed via `useEffect`.  
  `useLayoutEffect` to re-render epubjs when container size changes.  
  Location persistence via `api.updateLocation`.

- [ ] **8.2** Epub toolbar actions: font-size up/down, theme select, chapter list (shadcn `Sheet`).

- [ ] **8.3** Test epub reader navigation, progress resume, theme switching.

---

## Phase 9 — PDF reader

- [ ] **9.1** Create `src/web/components/reader/PdfReader.tsx`  
  Port `pdfReader.js`.  
  `<canvas ref>`. Load pdf.js from CDN via `useEffect` (`loadScript`).  
  Page render in `useEffect` when `currentPage` changes.  
  Touch swipe and click-zone navigation.

- [ ] **9.2** Test PDF render, page navigation, progress resume.

---

## Phase 10 — Admin & auth

- [ ] **10.1** Create `src/web/components/admin/AdminModal.tsx`  
  shadcn `Dialog`. Renders the active panel component. Opens/closes via Zustand or React state.

- [ ] **10.2** Create `src/web/components/admin/LoginPanel.tsx`  
  Port `admin/login.js`. shadcn `Input` + `Button`. Calls `api.login`.

- [ ] **10.3** Create `src/web/components/admin/SignupPanel.tsx`  
  Port `admin/signup.js`.

- [ ] **10.4** Create `src/web/components/admin/ForgotPasswordPanel.tsx` + `ResetPasswordPanel.tsx`  
  Port `admin/forgotPassword.js` / `admin/resetPassword.js`.

- [ ] **10.5** Create `src/web/components/admin/AddPathPanel.tsx`  
  Port `admin/addPath.js`. Streaming NDJSON progress handled with `ReadableStream`.  
  shadcn `Progress` bar. Path autocomplete list.

- [ ] **10.6** Create `src/web/components/admin/UploadPanel.tsx`  
  Port `admin/upload.js`. Drag-and-drop zone + file input. XHR progress.  
  shadcn `Progress` per file.

- [ ] **10.7** Create `src/web/components/admin/UsersPanel.tsx`  
  Port user management from `admin/settings.js`. Table of users, role toggle `Switch`, delete.

- [ ] **10.8** Create `src/web/components/admin/SettingsPanel.tsx`  
  Port `admin/settings.js`: guest access `Switch`, temporary password section, library wipe,
  metadata search, theme picker, web server port (Electron only).

- [ ] **10.9** Create `src/web/components/admin/ContextMenuPanel.tsx`  
  Port `admin/contextMenu.js` (tag editor, metadata panel, etc.).

- [ ] **10.10** Wire admin session: `useQuery(['session'])` at app root. Auth state exposed via
  React context or Zustand. Protect admin actions with role checks.

---

## Phase 11 — Auth routes

- [ ] **11.1** Render `ResetPasswordPanel` inside `AdminModal` when route is `/reset-password`.

- [ ] **11.2** Show toast and redirect to `/` when route is `/verified`.

---

## Phase 12 — Drag and drop

- [ ] **12.1** Port `app/drop.js` global file drop handler to a `useDrop` hook.  
  Opens `UploadPanel` and passes dropped files.

---

## Phase 13 — Electron host bridge

- [ ] **13.1** Create typed wrapper `src/web/lib/hostBridge.ts`  
  Re-exports `onComicOpened`, `onOpenSettings`, `getWebServerSettings`, `setWebServerSettings`,
  `isElectron` from `src/web/host/index.js` with TypeScript types.

- [ ] **13.2** Wire `onComicOpened` at app root: navigates to `#/read/:id`.

- [ ] **13.3** Wire `onOpenSettings` at app root: opens `SettingsPanel` in `AdminModal`.

---

## Phase 14 — Theming

- [ ] **14.1** Implement all six themes as Tailwind / shadcn CSS variable overrides in `globals.css`.  
  Map current CSS custom properties (`--accent`, `--primary`, progress bar color, etc.) to
  shadcn's `--primary`, `--primary-foreground`, `--ring`, etc.

- [ ] **14.2** Theme picker in `SettingsPanel`: six swatches, clicks set `uiStore.setTheme`,
  persists to `localStorage`, applies `data-theme` to `<html>`.

- [ ] **14.3** Keep the inline `<script>` in `index.html` that reads `localStorage` before CSS
  loads (prevents flash). No change needed.

---

## Phase 15 — Polish & cleanup

- [ ] **15.1** Remove all legacy vanilla-JS source files from `src/web/` that have been fully ported.

- [ ] **15.2** Remove the old `style.css` (or keep only the non-ported reader canvas overrides until
  Phase 7 is complete, then delete).

- [ ] **15.3** Accessibility audit: tab order, ARIA labels, keyboard navigation throughout.

- [ ] **15.4** Responsive QA: desktop (1440px), tablet (1024px), iPad (768px), mobile (375px).

- [ ] **15.5** iOS overscroll: confirm `overscroll-behavior: none` on comic reader containers
  (already done on `7z` branch; verify it's preserved in the ported CSS / Tailwind).

- [ ] **15.6** Bundle size check: `vite build --report`. Split reader chunks so pdf.js / epub.js
  don't bloat the main bundle.

- [ ] **15.7** Verify `build:standalone` still produces a working Docker image.

- [ ] **15.8** Verify Electron `start` still works with the new entry point.

- [ ] **15.9** Update `README.md` to reflect the new stack.

---

## Milestones

| Milestone | Phases complete | Deliverable |
|---|---|---|
| M1 — Scaffolding | 0, 1, 2 | Blank React app with Tailwind + shadcn running in Vite |
| M2 — Shell | 3 | Navbar, sidebar, routing, theme, mobile tab bar all working |
| M3 — Library | 4, 5 | Full library browse with infinite scroll, filters, hierarchy |
| M4 — Readers | 6, 7, 8, 9 | Comic, epub, and PDF readers functional |
| M5 — Admin | 10, 11, 12 | All admin flows, auth, drag-and-drop |
| M6 — Ship | 13, 14, 15 | Host bridge, theming, cleanup, Docker build green |
