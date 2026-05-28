# CB8 shadcn Rewrite — Design

> See `context.md` for: build-pipeline changes required, exact API response shapes,
> hash-routing order, sentinel constants, per-user vs shared state, host bridge contract,
> CSS variable → shadcn token mapping, and the "mixed series" decision tree the library
> view depends on.

## Tech stack

| Layer | Choice | Reason |
|---|---|---|
| UI framework | React 18 | shadcn is React-native; hooks model suits the reader/gesture logic |
| Language | TypeScript (.tsx/.ts) | Backend already TS; shared types; better refactor safety |
| Build | Vite (existing) | Already present; add `@vitejs/plugin-react` |
| Styling | Tailwind CSS v3 + shadcn CSS vars | v4 not fully stable with shadcn at writing time |
| Components | shadcn/ui (Radix UI primitives) | Accessible by default, copy-into-repo model |
| Routing | React Router v6 `HashRouter` | Keeps `#/…` URLs identical; no server config needed |
| Server state | TanStack Query v5 | Caching, loading/error states, auto-refetch |
| Client state | Zustand | Tiny; no boilerplate; replaces the mutable `state.js` object |
| API client | `api.ts` (port of `api.js`) | Zero logic change; add TypeScript types |

---

## File structure

```
src/web/
  components/
    ui/                 ← shadcn CLI output (Button, Input, Sheet, Dialog, …)
    layout/
      AppShell.tsx      ← nav + sidebar + main area
      Navbar.tsx
      Sidebar.tsx
      TabBar.tsx        ← mobile bottom nav
      TabPanel.tsx      ← slide-up sheet for Folders/Collections/Tags
      SortSheet.tsx     ← mobile bottom sheet sort picker
      ReaderOverlay.tsx ← fullscreen overlay that hosts the reader
    library/
      LibraryGrid.tsx   ← infinite-scroll grid + sentinel
      ComicCard.tsx
      GroupCard.tsx     ← series/volume/folder group card
      FolderCard.tsx
      ContinueShelf.tsx ← horizontal scroll strip
      FilterStrips.tsx  ← media type / file ext / read status strips
      ContextMenu.tsx   ← right-click / long-press card menu
      SelectionBar.tsx  ← bulk-action toolbar
    reader/
      ReaderToolbar.tsx ← shared toolbar (back, title, slider, extra buttons)
      ComicReader.tsx   ← image stage, tap zones, spread layout
      EpubReader.tsx    ← epubjs container
      PdfReader.tsx     ← pdf.js canvas
    admin/
      AdminModal.tsx    ← dialog shell
      AddPathPanel.tsx
      UploadPanel.tsx
      UsersPanel.tsx
      SettingsPanel.tsx
      LoginPanel.tsx
  hooks/
    useInfiniteComics.ts   ← TanStack Query infinite scroll
    useSidebar.ts          ← folders + libraries + tags
    useReader.ts           ← reader prefs, progress, bookmarks
    useComicGestures.ts    ← pinch-zoom / pan / swipe (no React dep, pure refs)
    useWakeLock.ts
  lib/
    api.ts              ← port of api.js with TypeScript types
    queryClient.ts      ← TanStack QueryClient singleton
    utils.ts            ← cn(), format helpers
  store/
    uiStore.ts          ← Zustand: mediaType, sortBy, search, tabPanel, route
    readerStore.ts      ← Zustand: currentPage, prefs, pdfDoc, comicState
  pages/
    AllPage.tsx
    ContinuePage.tsx
    RecentPage.tsx
    FolderPage.tsx
    FolderSeriesPage.tsx
    FolderVolumePage.tsx
    FolderChapterPage.tsx
    LibraryPage.tsx
    TagPage.tsx
    BrowseSeriesPage.tsx
    BrowseVolumePage.tsx
    BrowseChapterPage.tsx
    ReaderPage.tsx
  app.tsx             ← QueryClientProvider + Router + AppShell + routes
  main.tsx            ← ReactDOM.createRoot entry
  globals.css         ← Tailwind directives + shadcn CSS vars + reader overrides
```

The backend entry point (`src/web/index.html`) changes minimally: swap
`<script type="module" src="/app.js">` → `<script type="module" src="/main.tsx">`.

**But note**: the renderer source can also live under `src/renderer/` (recommended in
`context.md` §1) with its own `index.html` as the Vite entry. The Vite build then outputs
to `dist/web/` and the Forge/Docker copy hooks pull from there. The choice between
"build in place under `src/web/`" vs "move source to `src/renderer/` and build to
`dist/web/`" is the implementer's call; the latter is cleaner.

---

## Routing

`HashRouter` from React Router v6. All existing hash routes are preserved as `<Route>` entries
so deep links and bookmarks continue to work.

```tsx
<Routes>
  <Route path="/"                                             element={<AllPage />} />
  <Route path="/continue"                                     element={<ContinuePage />} />
  <Route path="/recent"                                       element={<RecentPage />} />
  <Route path="/library/:id"                                  element={<LibraryPage />} />
  <Route path="/folder/:id"                                   element={<FolderPage />} />
  <Route path="/folder/:id/series/:seriesKey"                 element={<FolderSeriesPage />} />
  <Route path="/folder/:id/series/:seriesKey/volume/:volKey"  element={<FolderVolumePage />} />
  <Route path="/folder/:id/series/:seriesKey/volume/:volKey/chapter/:chKey"
                                                              element={<FolderChapterPage />} />
  <Route path="/browse/series/:seriesKey"                     element={<BrowseSeriesPage />} />
  <Route path="/browse/series/:seriesKey/volume/:volKey"      element={<BrowseVolumePage />} />
  <Route path="/browse/series/:seriesKey/volume/:volKey/chapter/:chKey"
                                                              element={<BrowseChapterPage />} />
  <Route path="/tag/:tag"                                     element={<TagPage />} />
  <Route path="/read/:id"                                     element={<ReaderPage />} />
  <Route path="/read/:id/:page"                               element={<ReaderPage />} />
  <Route path="/reset-password"                               element={<AllPage modal="reset-password" />} />
  <Route path="/verified"                                     element={<AllPage toast="verified" />} />
  <Route path="*"                                             element={<AllPage />} />
</Routes>
```

The reader (`/read/:id`) renders inside `ReaderOverlay` which overlays the entire viewport — not
a true route swap — so the library view underneath is preserved on the back-navigation without
a re-fetch. The overlay is shown/hidden based on whether the current path matches `/read/*`.

**Back button**: React Router's `useNavigate(-1)` replaces the `previousLibraryHash` variable.
The reader back button calls `navigate(-1)`.

---

## State management

### Zustand UI store (`uiStore.ts`)
```ts
interface UIState {
  mediaType: '' | 'comic' | 'book';
  sortBy: SortKey;
  search: string;
  fileExt: string;
  readStatus: '' | 'unread' | 'in-progress' | 'completed';
  favoritesOnly: boolean;
  tabPanel: null | 'collections' | 'folders' | 'tags';
  theme: ThemeId;
  // actions
  setMediaType(t: UIState['mediaType']): void;
  setSortBy(s: SortKey): void;
  setSearch(q: string): void;
  // ...
}
```

### Zustand reader store (`readerStore.ts`)
```ts
interface ReaderState {
  prefs: ReaderPrefs;       // zoom, direction, spread, transition
  currentPage: number;
  pdfDoc: PDFDocumentProxy | null;
  pan: { scale: number; tx: number; ty: number };
  // actions
  setPrefs(p: Partial<ReaderPrefs>): void;
  gotoPage(n: number): void;
}
```

### TanStack Query
Every API call becomes a query or mutation:
- `useQuery(['comics', filters], () => api.fetchComics(filters))` — paginated via `useInfiniteQuery`
- `useQuery(['folders'])`, `useQuery(['libraries'])`, `useQuery(['tags'])`
- `useMutation(api.createFolder, { onSuccess: () => qc.invalidateQueries(['folders']) })`

Infinite scroll: `useInfiniteQuery` + `IntersectionObserver` sentinel ref. The sentinel hook lives
in `useInfiniteComics.ts` and is reused by every list page.

---

## Component breakdown

### AppShell
Renders `<Navbar>`, `<Sidebar>` (desktop), `<main>` (page outlet), `<TabBar>` (mobile),
`<TabPanel>` (mobile slide-up), `<ReaderOverlay>`. Listens to `useLocation` to show/hide the
overlay when path matches `/read/*`.

### Navbar
shadcn `Input` for search (debounced, syncs to `uiStore.search`). shadcn `Button` for admin,
add-comic. `Select` for sort (desktop). Custom `MediaToggle` (three shadcn `Button` variants).
Logo / brand link.

### Sidebar
`ScrollArea` wrapping sections. Each section header + `Button` add action. `NavigationMenu` or
plain `<nav>` + `<a>` links. Active link driven by `useLocation`.

### LibraryGrid
`useInfiniteComics` provides paginated records. Grid rendered with Tailwind `grid` classes.
`IntersectionObserver` on sentinel div triggers `fetchNextPage`. Selection state local to the
grid (or in Zustand if bulk-select spans views).

### ComicCard
Thumbnail `<img>`, format `Badge`, progress bar (Tailwind `div` fill), title. Long-press /
right-click opens `ContextMenu` (shadcn `DropdownMenu`).

### GroupCard
Used for series, volume, and folder group entries. Thumbnail, badge label ("Volume", "Series",
"Folder"), item-count subtitle.

### ContinueShelf
Horizontal `ScrollArea` of `ComicCard` entries from `/api/continue-reading`.

### ReaderToolbar
shadcn `Button` for back, zoom, direction, spread, orient, bookmark, favorite, fullscreen.
shadcn `Slider` for page position. Auto-hides after 3 s of inactivity (same logic as today but
expressed as a hook). Hidden state toggled via `opacity-0 pointer-events-none` transition.

### ComicReader
`useRef` for the stage div, image elements, pan state. Gesture logic extracted to
`useComicGestures(refs, options)` — a pure imperative hook using `addEventListener` inside
`useEffect`. No change to the actual gesture math. `useWakeLock()` called on mount.

### AdminModal
shadcn `Dialog` replacing the hand-rolled `admin-modal`. Renders whichever panel is active via
a `panel` prop. Accessible focus trapping comes for free from Radix.

### SortSheet / TabPanel
shadcn `Sheet` (side="bottom") replacing the current CSS-animated panels.

### Toast
shadcn's `Sonner` integration (or `useToast` + `Toaster`). Replaces the hand-rolled toast in
`app/toast.js`.

---

## shadcn components used

| Component | Used for |
|---|---|
| `Button` | All interactive buttons throughout |
| `Input` | Search bar, text fields in admin |
| `Select` | Desktop sort picker |
| `Slider` | Reader page slider |
| `Sheet` | Sort sheet, tab panel (mobile bottom sheets) |
| `Dialog` | Admin modal (add path, settings, user mgmt, login) |
| `DropdownMenu` | Card context menus, navbar admin menu |
| `Badge` | Format labels (CBZ, EPUB, PDF, …) |
| `Progress` | Upload progress bar, reading progress on cards |
| `ScrollArea` | Sidebar, continue shelf, tab panel list |
| `Separator` | Sidebar section dividers |
| `Tooltip` | Reader toolbar button labels |
| `Toast` / Sonner | Notification toasts |
| `NavigationMenu` | Sidebar navigation links |
| `Tabs` | Filter strips (media type) |
| `Checkbox` | Bulk-select card checkboxes |
| `Switch` | Guest access toggle, settings booleans |
| `Label` | Form labels in admin panels |
| `Avatar` | User avatar in navbar (optional) |

---

## What stays custom (not shadcn)

- **Pinch-zoom / pan gesture engine** — imperative pointer-event math in `useComicGestures.ts`.
- **Swipe detection** — touch-start/end delta logic.
- **epub.js container** — `<div ref>` that epubjs renders into; React just manages lifecycle.
- **pdf.js canvas** — `<canvas ref>` rendered by pdfjsLib; same pattern.
- **Wake lock** — browser API, wrapped in `useWakeLock`.
- **Orientation lock** — `screen.orientation.lock`, wrapped in reader component.
- **IntersectionObserver sentinel** — used for infinite scroll, wrapped in a hook.
- **Tailwind theming** — replaces `style.css` CSS custom properties; six themes implemented as
  Tailwind config `extend.colors` with CSS variable overrides on `[data-theme="…"]`.

---

## Tailwind theming

The current six themes (red, blue, green, purple, orange, teal) are implemented as Tailwind
`hsl` CSS variables on the `<html>` element via `data-theme` attribute, matching the pattern
shadcn already uses for its own `--primary`, `--accent`, etc. variables.

```css
/* globals.css */
:root[data-theme="red"]    { --primary: 0 72% 51%;  --primary-foreground: 0 0% 100%; … }
:root[data-theme="blue"]   { --primary: 217 91% 60%; … }
/* etc. */
```

The inline `<script>` in `index.html` that reads `localStorage` and sets `data-theme` before
CSS loads is kept as-is to prevent flash.

---

## Migration strategy

This is a **parallel full rewrite** on the `shadcn` branch, not an incremental swap.
The backend is untouched (zero changes to `src/main/**`). The Dockerfile and `forge.config.ts`
get one-line updates to copy from the new renderer build output instead of `src/web/` raw
source — see `context.md` §1.

Each phase is a self-contained unit that can be reviewed independently. Phases are detailed
in `tasks.md`.
