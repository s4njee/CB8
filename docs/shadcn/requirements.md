# CB8 shadcn Rewrite — Requirements

> **Companion docs**: `design.md` (architecture), `tasks.md` (phased execution),
> `context.md` (implementation gotchas, exact API shapes, invariants to preserve).
> **Read `context.md` first** if you're about to write code — it covers the build
> topology, sentinel constants, and quirks that aren't obvious from the source.

## Context

CB8's web frontend is currently vanilla JavaScript (ES modules, direct DOM manipulation, a custom
hash router, and a single hand-crafted `style.css`). This branch rewrites it in React + shadcn/ui
+ Tailwind CSS while keeping the backend (Fastify, better-sqlite3, sharp, etc.) completely
unchanged. The `api.js` contract and the `/api/*` URL surface are preserved.

**Important**: the existing pipeline does **not** compile the renderer — `src/web/` is served
as raw source by the embedded Fastify server. The rewrite introduces a renderer build step
and updates the Electron Forge + Docker copies to use its output. See `context.md` §1.

---

## Must-haves (functional parity)

### Library browsing
- Display all comics/books in an infinitely-scrolling card grid.
- Filter by media type (All / Comics / Books), file extension, read status, and favorites.
- Sort by title, date added, file size, page count, recently read.
- Full-text search across the entire library, activating a series-grouped browse hierarchy when a
  query is entered.
- Series hierarchy drill-down: folder → series → volumes (mixed named-volume cards + unnumbered
  issues inline) → chapters → comics.
- Global browse hierarchy (no folder scope): same drill-down triggered by search.
- Continue Reading shelf on the homepage (in-progress items).
- Recently Read view.

### Navigation / routing
- Hash-based SPA routing preserved (`#/`, `#/read/:id`, `#/folder/:id`, `#/browse/series/:key`,
  etc.) so bookmarks and sharing links keep working.
- Back button from the reader returns to the exact previous library view, not always `#/`.

### Sidebar
- Folders list with add-folder action.
- Collections (libraries) list with add-collection action.
- Tags list.
- All sidebar items linkable; active item highlighted.

### Reader
- Comic reader (CBZ/CBR): image-at-a-time with pinch-zoom, pan, swipe gestures, tap zones,
  spread (two-page) mode, LTR/RTL direction toggle, zoom modes (fit-height / fit-width / 1:1),
  slide transition, keyboard navigation, orientation lock, fullscreen, bookmarks, favorites,
  page slider, wake lock, auto-hiding toolbar, history logging.
- Epub reader (epub.js): chapter navigation, themes, font-size control, keyboard navigation,
  location persistence.
- PDF reader (pdf.js CDN): page-at-a-time canvas render, keyboard navigation, page slider,
  progress persistence.
- Reader toolbar uses shadcn `Button` and `Slider`; core gesture/canvas logic stays custom.

### Admin / settings
- Admin login (password-gated, role-based).
- Add library path with streaming progress (NDJSON).
- Upload file(s) with progress bar (XHR).
- Manage collections and folders (rename, delete, add/remove items).
- User management: list, create, delete, toggle admin role.
- Settings: guest access toggle, temporary password display, theme picker, web-server port
  (Electron only), library wipe, metadata search and apply.
- Context menus on cards: open, mark read/unread, add to collection, add to folder, tag, delete.
- Bulk selection mode (long-press / checkbox) with bulk actions.

### Auth flows
- Sign in (username or email), sign out.
- Sign up (email + username + password).
- Email verification handling (`#/verified`).
- Forgot password / reset password (`#/reset-password?token=…`).

### Mobile / tablet
- Responsive layout: sidebar collapses into a bottom tab-bar on small screens.
- Tab panel slide-up sheet for Collections / Folders / Tags.
- Bottom sheet for sort options.
- Touch gestures in comic reader (pinch-zoom, swipe, tap zones).
- No overscroll bounce past image bounds (iOS).

### Theming
- Six color themes (red, blue, green, purple, orange, teal) persisted to `localStorage`.
- Theme applied before stylesheet loads to prevent flash.
- Dark base; theme color drives accent, active states, progress bars.

---

## Must-haves (technical)

- **React 18** with concurrent features; JSX compiled by Vite's `@vitejs/plugin-react`.
- **TypeScript** throughout the frontend (`.tsx` / `.ts`). Extend the existing `tsconfig.json`.
- **Tailwind CSS v4** (or v3 if v4 shadcn support is incomplete at time of implementation).
- **shadcn/ui** CLI-generated components copied into `src/web/components/ui/`.
- **React Router v6** with `HashRouter` so existing hash URLs continue to work.
- **TanStack Query v5** for server state (caching, loading/error states, refetch on focus).
- **Zustand** for client-side UI state (mediaType, sortBy, search, tabPanel, etc.).
- `api.js` ported to `api.ts` with proper TypeScript types; zero change to the fetch logic.
- No new backend dependencies; no changes to any `src/main/` file.
- Vite config additions are isolated to `vite.renderer.config.ts` (new file) or inline in the
  existing config; do not break `build:standalone`.
- Electron host bridge (`src/web/host/index.js`) kept as-is; consumed via typed wrapper.
- All existing `/api/*` endpoints consumed identically.

---

## Nice-to-haves (out of scope for initial rewrite)

- Server-side rendering or static generation.
- Animations beyond what Tailwind and shadcn provide out of the box.
- PWA offline support.
- React Native / Expo version.
- Replacing the epub.js or pdf.js readers with React-native alternatives.
