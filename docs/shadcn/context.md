# CB8 shadcn Rewrite — Implementation Context

Companion to `requirements.md` (the *what*), `design.md` (the *how*), and `tasks.md` (the
*when*). This file is the *don't trip over these* document: invariants the rewrite must
preserve, gotchas in the current code, exact API shapes, and architectural facts that
aren't obvious from reading the source in isolation.

---

## 1. Build topology (most important)

The existing build pipeline **does not compile the renderer**. The SPA is served *as raw source
files* by the embedded HTTP server.

- `forge.config.ts` declares `renderer: []` (line 139) — Electron Forge's Vite plugin only
  bundles main + preload.
- `packageAfterCopy` hook copies `src/web/` directly into the packaged app's resources.
- The Docker `Dockerfile` does the same: `COPY --from=builder /src/src/web/ /app/web/`.
- The Fastify server (`src/main/webServer/server.ts:64-77`) serves whatever it finds in
  `src/web/` (dev) or `/app/web/` (packaged) via `@fastify/static`.
- `resolveStaticRoot()` tries `../../src/web`, then `../../web`, then `../web`, then
  `process.resourcesPath/web` (in that order).

**Implication for the rewrite**: you must add a renderer build step. After it runs, the
output must land where `resolveStaticRoot()` can find it. The least-invasive option is
to build into `src/web/` itself (treating it as both source and dist) — but that pollutes
the source tree. Cleaner: build into `dist/web/` and update both the forge
`packageAfterCopy` hook and the Dockerfile to copy from `dist/web/` instead of `src/web/`,
plus extend `resolveStaticRoot()` to check `dist/web` first.

**Recommended approach**:
1. Move source to `src/renderer/` (TypeScript JSX, etc.).
2. Add `vite.renderer.config.ts` with `root: 'src/renderer'`, `build.outDir: '../../dist/web'`.
3. Update forge `packageAfterCopy` hook: copy `dist/web` → `appDir/web` (instead of
   `src/web` → `appDir/web`).
4. Update Dockerfile: `COPY --from=builder /src/dist/web/ /app/web/`.
5. Add `pnpm build:renderer` step before `pnpm build:standalone` in the Dockerfile.
6. Add a dev convenience: `pnpm dev:renderer` runs `vite` against `src/renderer/` on its own
   port, proxying `/api/*` to the embedded server.

**Don't break**: `pnpm build:standalone` (esbuild bundle of `src/main/standalone.ts`).
That stays untouched; it's only the renderer that's new.

---

## 2. Existing Vite externals (don't conflict)

`vite.main.config.ts` already lists `react`, `react-dom`, `scheduler`,
`@tanstack/react-virtual`, `@tanstack/virtual-core` in `extraExternals`. These are there
so the **main** process bundle doesn't accidentally pull React in through some transitive
import. Leave that list alone; the renderer build uses its own config.

---

## 3. Critical files that must keep working

| File | Role | Touch? |
|---|---|---|
| `src/main/**` | Backend (Fastify, SQLite, ingest) | **No** — zero changes |
| `src/shared/types.ts` | Shared backend↔frontend types | Read-only reference |
| `src/main/webServer/server.ts` | Static root resolution | Extend `resolveStaticRoot()` only |
| `forge.config.ts` | Electron packaging | Update `packageAfterCopy` hook target dir |
| `packaging/docker/Dockerfile` | Standalone container | Update SPA `COPY` line |
| `scripts/build-standalone.mjs` | esbuild main bundle | **No** changes |
| `vite.main.config.ts` | Main process bundle | **No** changes |
| `vite.preload.config.ts` | Preload bundle | **No** changes |
| `tsconfig.json` | Already has `"jsx": "react-jsx"` | Already set |

---

## 4. API response shapes (exhaustive)

These are the actual shapes the backend returns today. Source: `src/main/webServer/routes/*.ts`
and `src/main/webServer/mapping.ts`.

### `GET /api/comics` → `{ records: WebComicRecord[], totalCount: number }`

```ts
interface WebComicRecord {
  id: number;
  title: string;
  pageCount: number;          // 0 for books that haven't been counted
  fileSize: number;           // bytes
  dateAdded: string;          // ISO-ish, e.g. "2026-05-20 14:33:21"
  tags: string[];
  lastPage: number | null;    // 0-indexed; null = unread
  lastLocation: string | null; // EPUB CFI string when applicable
  lastRead: string | null;    // last reading timestamp
  mediaType: 'comic' | 'book';
  thumbnailUrl: string;       // already includes ?v= cache buster
  fileExt: string;            // 'epub' | 'pdf' | 'mobi' | 'cbz' | 'cbr' — no leading dot
  favorited: boolean;         // per-user when authenticated; always false for guests
}
```

Query params accepted by `GET /api/comics`:
```
search, tag, sortBy, sortOrder, offset, limit,
mediaType ('comic'|'book'), fileExt, readStatus ('unread'|'in-progress'|'completed'),
favorites=true   ← note: param is "favorites", not "favoritesOnly"
```

### `GET /api/comics/:id` → `WebComicRecord` (single, with per-user overlay)

### `GET /api/folders` → `Folder[]`

```ts
interface Folder {
  id: number;
  name: string;
  comicCount: number;
  mediaType: 'comic' | 'book' | 'mixed' | 'empty';  // 'empty' folders are hidden client-side
  thumbnailUrl: string | null;
}
```

### `GET /api/libraries[?mediaType=comic|book]` → `Library[]`

```ts
interface Library {
  id: number;
  name: string;
  comicCount: number;
  mediaType: 'comic' | 'book';
  // (no thumbnailUrl)
}
```

### `GET /api/tags` → `string[]`

### Group endpoints (`/api/folders/:id/series`, `/api/browse/series`, etc.)

All group endpoints return:
```ts
interface GroupResponse {
  groups: SeriesGroup[] | VolumeGroup[] | ChapterGroup[];
  totalCount: number;
}

interface SeriesGroup {
  key: string;              // series name OR '__none__' sentinel
  name: string;             // display name
  count: number;
  coverComicId: number | null;
  thumbnailUrl: string | null;
}

interface VolumeGroup {
  key: string;              // volume number as string OR '__none__'
  label: string;            // pre-formatted display label
  count: number;            // total comics in this volume
  chapterCount: number;     // distinct chapter buckets
  coverComicId: number | null;
  thumbnailUrl: string | null;
}

interface ChapterGroup {
  key: string;              // chapter number as string OR '__none__'
  label: string;
  count: number;
  coverComicId: number | null;
  thumbnailUrl: string | null;
  singleComicId?: number;   // when count===1 and chapter has a real number
}
```

### `GET /api/auth/session` → session shape

```ts
interface SessionResponse {
  authenticated: boolean;
  user: {
    id: number;
    username: string;
    isAdmin: boolean;
  } | null;
  host: boolean;            // request came from 127.0.0.1
  guestAccess: boolean;
}
```

### `GET /api/comics/:id/bookmarks` → `Bookmark[]` (soft-fails to `[]`)

```ts
interface Bookmark {
  id: number;
  page: number;             // 0-indexed
  note: string | null;
  createdAt: string;
}
```

### `GET /api/recently-read?limit&mediaType` → `WebComicRecord[]` (flat array — not paginated)
### `GET /api/continue-reading?limit&mediaType` → `WebComicRecord[]` (flat array — not paginated)

Note: these return a raw array, not a `{records, totalCount}` envelope. The current grid
code synthesizes pagination client-side by slicing the array.

### Streaming NDJSON: `POST /api/admin/add-path`

Server sends newline-delimited JSON events on a single long-lived response:
```ts
type IngestEvent =
  | { type: 'progress'; phase: 'discover'|'process'; discovered: number; processed: number; currentFile: string }
  | { type: 'error'; message: string }
  | { type: 'failures-summary'; total: number; categories: Record<string, number>; samples: Array<{path:string, errorClass:string, message:string}> }
  | { type: 'done'; added: number };
```

Must be parsed with a `ReadableStream` reader + line buffering (see `api.js:adminAddPath`).

### Raw-body upload: `POST /api/admin/upload`

```
Content-Type: application/octet-stream
X-CB8-Filename: <encodeURIComponent(file.name)>
X-CB8-Relpath:  <encodeURIComponent(relPath)>
Body: raw file bytes
```

Use `XMLHttpRequest` (not `fetch`) because the latter has no `upload.onprogress`.
Response: `{ added: number, skipped?: number, reason?: string, filePath: string }`.

---

## 5. better-auth quirks

Better-auth handles most `/api/auth/*` endpoints itself (CB8's server overrides only
`/api/auth/session`, `/login`, `/logout`, `/register`, plus the legacy `/admin/*` aliases).

The frontend must therefore:

- Hit `/api/auth/sign-in/email` when the identifier contains `@`.
- Hit `/api/auth/sign-in/username` otherwise.
  See `api.js:login()` for the sniff.
- Pass `credentials: 'same-origin'` on **every** sign-up/sign-in/sign-out/forget-password/
  reset-password call, otherwise the session cookie isn't set/cleared.
  See every call in `api.js` that uses `credentials: 'same-origin'`.
- The `signup()` callback URL is `${window.location.origin}/#/verified` — the route
  `#/verified` is the email-verification landing page that just shows a toast and bounces
  to `#/`.
- `requestPasswordReset` and `resetPassword` pass `parseError: 'soft'` because better-auth
  sometimes returns empty bodies on success.

---

## 6. Initial auto-login (critical to preserve)

On first boot, the backend generates a random initial admin password and stores it in
`app_meta.initial_password`. The frontend's `refreshSession()`
(`src/web/admin/session.js:61`) does this on every page load:

1. `GET /api/auth/session` to learn current auth state.
2. If unauthenticated, `GET /api/settings/initial-credentials` to grab the temp password.
3. If present, `POST /api/admin/login` with that password.
4. Re-fetch the session.

This means **a fresh container/install is admin-authenticated on first page load** without
any user action. The Settings panel shows the temp password (until admin clears it).

The rewrite must preserve this dance — recommended location: a `useEffect` at the app root
that runs once before children render, or a hydration-time bootstrap. TanStack Query's
`initialData` + a synchronous bootstrap call works.

---

## 7. The `cb8:library-changed` event bus

Mutations dispatch a window event that the app uses to re-fetch the sidebar and grid:
`window.dispatchEvent(new CustomEvent('cb8:library-changed'))`.

Fired from:
- `src/web/admin/contextMenu.js` (tag editor save)
- `src/web/admin/bulkDelete.js` (bulk delete)
- `src/web/admin/upload.js` (after upload completes)
- `src/web/admin/addPath.js` (after add-path completes)
- `src/web/app/drop.js` (after drop upload completes)
- `src/web/app/sidebar.js` (rename/delete library or folder)
- `src/web/app/tabPanel.js` (rename/delete via tab panel)
- `src/web/views/library/strips.js` (header Delete action)
- `src/web/views/library/selection.js` (folder picker add)

In React, replace with `queryClient.invalidateQueries({ predicate: ... })` calls inside
mutation `onSuccess` handlers. Suggested key prefixes:
- `['comics', ...]` — invalidate on delete, upload, add-path, tag change, folder add/remove
- `['folders']` — invalidate on folder create/rename/delete + comic-folder mutation
- `['libraries']` — invalidate on collection create/rename/delete
- `['tags']` — invalidate on tag change
- `['series', ...]`, `['browse', ...]` — invalidate on any comic mutation

Or, simpler: one big `queryClient.invalidateQueries()` per mutation. The grid is fast
enough that fine-grained invalidation isn't worth the complexity.

---

## 8. Sentinel constants & magic strings

| Constant | Value | Used for |
|---|---|---|
| `GROUP_NONE_KEY` | `'__none__'` | Empty series/volume/chapter key in URLs and group responses |
| `PAGE_SIZE` | `48` | Library grid page size |
| `SHELF_LIMIT` | `20` | Continue-reading shelf max items |
| Reader prefs key | `'cb8.reader.prefs.v2'` | Comic reader prefs (zoom, direction, spread, transition) |
| Epub prefs key | `'cb8.epub.prefs.v1'` | Epub reader prefs (fontSize, theme, fontFamily) |
| Theme key | `'cb8.theme'` | Selected color theme |

**Don't change these localStorage keys** — existing users have prefs persisted under them.

---

## 9. Hash routing — order matters

`parseRoute()` in `src/web/app/router.js:15` tries matchers in this order. A folder-chapter
URL also matches the folder-volume regex when sliced — but a less-specific regex matched
first would win. The order:

1. exact `/`, `/recent`, `/continue`, `/reset-password`, `/verified`
2. `/library/:id`
3. `/folder/:id/series/:k/volume/:v/chapter/:c` (most specific first)
4. `/folder/:id/series/:k/volume/:v`
5. `/folder/:id/series/:k`
6. `/folder/:id`
7. `/browse/series/:k/volume/:v/chapter/:c`
8. `/browse/series/:k/volume/:v`
9. `/browse/series/:k`
10. `/tag/:name`
11. `/read/:id(/:page)?`
12. fallthrough → `/`

React Router v6 sorts routes by specificity automatically, so order of `<Route>` declarations
doesn't matter — but the URL patterns themselves must mirror the above exactly. Keys are URL-
encoded (e.g. `__none__` is literal, but a series name like `Batman & Robin` becomes
`Batman%20%26%20Robin`).

---

## 10. The reader is an overlay, not a route

In the current app, `#/read/:id` does **not** unmount the library view. Look at
`index.html:163`: `#reader-overlay` is a sibling of `#view-container`, both inside `#layout`.
The router shows/hides the overlay based on whether the path matches `/read/*`.

This matters because:
- Going back from the reader to a deep folder view is **instant** (no re-fetch).
- The library underneath keeps its scroll position.
- The `previousLibraryHash` variable (`router.js:103`) saves the last non-reader hash so
  the reader back button knows where to navigate.

**React equivalent**: a sibling outlet pattern. Either:
- (a) Render both `<LibraryRouter />` and `<ReaderOverlay />` at the same level in `AppShell`.
  `<ReaderOverlay />` watches `useLocation()` and renders nothing when path doesn't match
  `/read/*`. This is the cleanest pattern.
- (b) Use React Router's parallel routes or a `useMatch('/read/:id')` hook in `AppShell`.

Either way, **do not** wrap the reader as a sibling `<Route>` at the same level as the
library pages — that would unmount the library.

The back button: `useNavigate()(-1)` works because the browser's session history is intact
when the overlay is shown (the hash did change, it just didn't unmount anything).

---

## 11. DOM scaffold in `index.html`

The current `index.html` ships a fully-rendered DOM (navbar, sidebar, tab bar, sort sheet,
reader overlay) and `app.js` mutates it in place. The rewrite should:

1. Replace the body content with just `<div id="root"></div>`.
2. Keep the inline `<script>` that pre-applies `data-theme` before CSS loads. This is the
   easy way to avoid the flash-of-default-red on page load. Don't move it into React — by
   the time React mounts, the unstyled flash is already over.
3. Keep `<link rel="manifest">` and `<link rel="icon">` — they reference real files in
   `src/web/` (or wherever the renderer build outputs).
4. The `<title>CB8</title>` stays.

The `favicon.svg` and `manifest.json` live under `src/web/` today. The renderer build must
either copy them to its output dir (Vite's `public/` convention) or the static server must
serve them from somewhere.

---

## 12. Reader libraries loaded from CDN

The PDF and EPUB readers **do not bundle pdf.js / epub.js / jszip**. They fetch them at
runtime from CDN URLs:

- `pdf.js`: `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js`
- `pdf.worker.js`: `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js`
- `jszip`: `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`
- `epub.js`: `https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js`

Loaded via the `loadScript()` helper (`src/web/views/reader/utils.js:43`). Why CDN: the
bundle is currently just raw `src/web/` files served as-is; there's no bundler, so npm
packages are unreachable.

**Decision needed for the rewrite**: keep CDN, or bundle now that Vite is in the picture?
- **CDN**: zero bundle bloat for users who never open a PDF/EPUB. Offline-hostile and
  brittle if the CDN goes down.
- **Bundle**: works offline, slower initial load. `pdfjs-dist` is already a runtime dep
  (see `package.json`). epub.js is not currently a dep.

Recommendation: bundle via Vite dynamic `import()` so the chunk is split out. The current
runtime cost (CDN fetch on first PDF/EPUB open) becomes a bundled lazy chunk. Same UX,
works offline, no new deps for PDF (already in package.json), one new dep for EPUB.

---

## 13. Per-user vs shared state

Some state is per-user (overlaid in `mapping.ts:overlayUserState`):
- `lastPage`, `lastLocation`, `lastRead` (reading progress)
- `favorited`

Some state is shared (in the `comics` table directly):
- `tags`
- `title`, `pageCount`, `fileSize`, `dateAdded`
- The folder/library associations
- The `lastPage` field on the shared row (also updated, but the per-user value is
  what gets shown for authenticated users — see `progress.ts:32-34`).

For guests (no auth), all per-user fields are blank. The grid shows no progress bars and
no heart icons for unauthenticated viewers.

The rewrite must call `useQuery(['session'])` early and key per-user query caches by user
id so a sign-out doesn't show the previous user's progress.

---

## 14. Per-route data-fetching matrix

Some hash routes have non-obvious data fetches:

| Route | Endpoint | Notes |
|---|---|---|
| `/` (all) | `GET /api/comics` | Plus optional `GET /api/continue-reading` shelf |
| `/` with search | `GET /api/browse/series?search=…` | Series-grouped browse |
| `/recent` | `GET /api/recently-read?limit=…` | Returns flat array (not paginated) |
| `/continue` | `GET /api/continue-reading?limit=…` | Returns flat array |
| `/library/:id` | `GET /api/libraries/:id/comics` | Paginated |
| `/folder/:id` | `GET /api/folders/:id/series` | Returns series groups |
| `/folder/:id/series/:k` | `GET /api/folders/:id/series/:k/volumes` | Decision tree (see §15) |
| `/folder/:id/series/:k/volume/:v` | `GET /api/folders/:id/series/:k/volumes/:v/chapters` | Decision tree |
| `/folder/:id/series/:k/volume/:v/chapter/:c` | `GET /api/folders/.../chapters/:c/comics` | Flat |
| `/browse/series/:k` | Same as folder series but `/browse/...` | |
| `/tag/:name` | `GET /api/comics?tag=…` | Paginated |
| `/read/:id` | `GET /api/comics/:id` then file/page endpoints | |

---

## 15. The "mixed series" decision tree

`renderMixedSeries` (`src/web/views/library.js:340`) implements a critical UX rule that
the rewrite must preserve:

```
fetch volume groups for series
├── if exactly one group AND its key === '__none__'  → skip volume level, render comics directly
└── else                                              → render named volumes as group cards
                                                       + inline unnumbered comics from '__none__' group
                                                       (fetched separately, limit=200)
```

Same logic recurses for volume → chapter:
```
fetch chapter groups for volume
├── if many chapters OR a chapter has count>1  → render chapter group cards
└── else                                        → fall through to flat comics
                                                  (or → reader if singleComicId)
```

`group.singleComicId` lets the chapter card link directly to `#/read/<id>` when a chapter
has exactly one comic.

---

## 16. Sort behavior gotchas

Looking at `library.js:388-393`:
- `sortBy='title'` → no `sortOrder` (server defaults to asc)
- `sortBy='dateAdded'` or `'lastRead'` → `sortOrder='desc'`
- Other → no explicit sortOrder

The rewrite should mirror this; don't pass `sortOrder` for title sorts.

---

## 17. Auto-hiding reader toolbar

`src/web/views/reader/comicReader.js:364-391`:
- Toolbar starts visible.
- After 3s of no `mousemove` or tap-without-swipe, it gets `.hidden` class.
- Toolbar hover keeps it visible; mouseleave triggers a 1s timeout.
- Swipes are deliberately *not* a wake event — only stationary taps and mouse moves.

The "is this a tap or a swipe" detection uses a 10px movement threshold on touchend.

---

## 18. Wake lock & visibility

`src/web/views/reader/state.js`:
- One module-level `wakeLockSentinel`.
- Acquired on comic-reader mount, released on unmount.
- A `visibilitychange` listener re-acquires when the tab becomes visible again *if* a
  comic reader is still active.

In the React rewrite, that visibility listener should live in `useWakeLock` — but be
careful not to register multiple listeners. Either a global singleton hook or a
`useEffect` that only runs in one component at a time.

---

## 19. Native modules & test infra

- **Vitest** is already configured (`vitest.config.ts`). React component tests can use
  `@testing-library/react` + `jsdom` environment. Add as devDeps; don't touch the existing
  vitest config wholesale.
- **Vitest currently runs main-process tests** (e.g. `seriesParser.test.ts`). Keep these
  passing; the renderer tests should be a separate config or use the same one with a
  per-file environment hint.

---

## 20. Host bridge contract (Electron)

Browser console: `window.electronAPI` is undefined.
Electron renderer: `window.electronAPI = { on, invoke }` where:
- `on(channel: string, listener: (...args) => void): () => void` — returns unsubscribe
- `invoke(channel: string, ...args): Promise<any>`

Channels currently used (see `src/web/host/index.js`):
- `on('file-opened', filePath: string)` — OS-driven file open
- `on('comic-opened', comicId: number)` — main resolved a file to a library id
- `on('open-settings')` — app menu Settings command
- `invoke('dialog:open-file'): Promise<string|null>`
- `invoke('dialog:open-directory'): Promise<string|null>`
- `invoke('shell:open-path', filePath: string): Promise<string|undefined>`
- `invoke('webserver:get-settings'): Promise<WebServerSettings|null>`
- `invoke('webserver:set-settings', enabled, port): Promise<WebServerSettings|null>`

The rewrite should re-export the existing `src/web/host/index.js` from a typed wrapper
(`hostBridge.ts`). Do not duplicate the channel literals.

---

## 21. Selection model

Selection state (`src/web/views/library/selection.js`) supports:
- Click a checkbox → toggle one item.
- Shift-click a checkbox → range-select between `lastClickedId` and the clicked id.
- Right-click → opens context menu; if the clicked card is selected, operates on the
  whole selection; else operates on just that card.
- Long-press (on touch) → opens context menu.
- A floating `.selection-bar` shows count + Clear/Add to folder/Delete actions when
  selection is non-empty.

The range selection requires an ordered list of visible ids in render order (`orderedIds`).
A React equivalent: keep selection in Zustand (so it survives re-renders), but rebuild the
ordered-id list each time the grid renders from the current query data.

---

## 22. Pull-to-refresh

`src/web/views/library.js:157` installs a pull-to-refresh handler on `#main-content` that
fires `cb8:library-changed` when pulled past 70px. Mobile-only by nature (touch events).
Indicator is a `.ptr-indicator` div prepended to the scroll container.

Don't lose this — it's the only way to manually re-sync the grid on mobile (no F5 button
in standalone PWAs).

---

## 23. CSS variables to map to shadcn

| Current CSS var | Used for | shadcn equivalent |
|---|---|---|
| `--bg` (#0a0a0a) | App background | `--background` |
| `--surface` (#141414) | Navbar, sidebar | `--card` or custom |
| `--surface2` (#1c1c1c) | Cards, inputs | `--muted` |
| `--border` (#2a2a2a) | Borders | `--border` |
| `--text` (#e8e8e8) | Body text | `--foreground` |
| `--text-muted` (#888) | Secondary text | `--muted-foreground` |
| `--text-dim` (#555) | Placeholder, disabled | (custom) |
| `--danger` (#e05252) | Delete buttons | `--destructive` |
| `--accent` (theme color) | Active states, focus rings | `--primary` |
| `--accent-dim` | Hover states | (derive from primary) |
| `--progress` | Progress bars | `--primary` |
| `--card-w` (160px) | Grid card width | Tailwind `w-40` |
| `--nav-h` (52px) | Navbar height | `h-13` (custom) |
| `--tab-bar-h` (56px) | Mobile tab bar | `h-14` |
| `--sidebar-w` (220px) | Sidebar width | Tailwind `w-56` (or custom) |
| `--radius` (6px) | Buttons, inputs | `--radius` |
| `--radius-lg` (10px) | Cards, modals | `--radius` * 1.6 |

The six theme palettes only swap `--accent` and `--accent-dim`. In shadcn-land, only swap
`--primary` and derive hover state via Tailwind opacity utilities or a `--primary-hover`
custom var.

---

## 24. Things the rewrite can simplify or drop

- **Custom toast** (`src/web/app/toast.js`) — 14 lines, replaced by Sonner.
- **Custom modal** (`src/web/admin/modal.js`) — replaced by shadcn `Dialog`.
- **Custom dropdown** (sidebar context menu, card context menu) — replaced by `DropdownMenu`.
- **Custom inline rename** in sidebar — could become a shadcn `Input` inline-edit pattern.
- **`#admin-modal` / `#drop-overlay` / `#tab-panel` / `#sort-sheet`** — all become React
  components, no static IDs needed.
- **Hand-rolled debounce** in `app.js:57-65` — replace with a `useDeferredValue` or a
  `useDebouncedValue` hook.

---

## 25. Things the rewrite must **not** drop

- **`?favorites=true` query param** (not `favoritesOnly`).
- **`?v=…` cache buster on thumbnails** — without it, deleting and re-ingesting a comic
  with the same id shows the previous cover from the browser cache.
- **Auto-complete on final page** (`progress.ts:25-31`) — when client posts the last page,
  server auto-marks completed. Client needn't do anything special; just keep sending page
  updates as the user reads.
- **The folder thumbnail fallback** — folder thumbs are served from
  `/api/folders/:id/thumbnail` which returns the cover-comic thumbnail when a cover is
  set, else 404. Client falls back to `PLACEHOLDER_BOOK_SVG_DATA_URI`.
- **CBR handling note** — the new unrar backend (already on the `7z` branch) requires
  `unrar` to be present at runtime; Dockerfile already installs it.
- **Initial admin password display** in Settings (until cleared) — see `auth.ts:83`.
- **The `data-theme` inline script in `index.html`** — prevents flash of default theme.

---

## 26. Open decisions for the implementing agent

The plan deliberately leaves these to the implementer's judgment. Pick one and document
the choice in the relevant component or store:

1. **Bundle vs CDN for pdf.js/epub.js** — recommended: bundle via dynamic import (see §12).
2. **Source layout: `src/web/` vs `src/renderer/`** — recommended: `src/renderer/`, leave
   `src/web/` empty after migration (deletable in a follow-up).
3. **Tailwind v3 vs v4** — recommended: v3, shadcn's CLI/install path is mature there.
4. **State management granularity** — recommended: Zustand for tiny stuff (theme, selection,
   tabPanel open/closed), TanStack Query for everything backend-touching, React useState
   for component-local state.
5. **One Zustand store vs many** — recommended: small per-concern stores (`uiStore`,
   `readerStore`, `selectionStore`) for tree-shakability and clearer ownership.
6. **Replace the legacy `/admin/login` endpoint or keep using it** — the legacy endpoint
   is a thin wrapper over better-auth that the current frontend still calls during auto-
   login. Easier to keep using it; cleaner to switch to `/api/auth/sign-in/username` and
   add the auto-login to use that. Either works.
7. **Pull-to-refresh implementation** — recommended: a custom `usePullToRefresh` hook on
   the `<main>` scroll container, not a CSS-only solution.

---

## 27. Smoke-test checklist

When wrapping up Phase 15, verify these manually:

- [ ] `pnpm start` opens Electron, library renders, can open a comic.
- [ ] `pnpm build:standalone && docker build ...` builds without error.
- [ ] Fresh Docker container: visit `:4218`, see library, auto-logged in as admin.
- [ ] Sign out, refresh: see library as guest, no progress bars / heart icons.
- [ ] Sign in via `/api/auth/sign-in/username`: session cookie set, progress visible.
- [ ] Add path: NDJSON progress streams, comics appear.
- [ ] Drag-drop file: uploads, appears.
- [ ] Comic reader: pinch-zoom on iPad, swipe, keyboard arrows, spread mode, fullscreen,
      orientation lock, bookmark, favorite.
- [ ] PDF reader: opens, pages render, slider works.
- [ ] Epub reader: opens, navigates, font size & theme persist.
- [ ] Back button from reader returns to exact previous folder/library view.
- [ ] Search bar: typing triggers `/api/browse/series?search=…`, results grouped.
- [ ] Theme picker: changes accent immediately, persists across reload, no flash.
- [ ] Mobile (375px viewport in devtools): sidebar hidden, bottom tab bar visible, sort
      sheet opens, tab panel opens for Collections/Folders/Tags.
- [ ] iPad portrait: comic reader spread mode, no overscroll bounce past image bottom.
- [ ] Refresh while in `/folder/:id/series/Batman%20%26%20Robin`: parses URL correctly,
      lands on the right view.
