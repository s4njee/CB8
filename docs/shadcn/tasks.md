# CB8 shadcn Rewrite - Focused Gap Tasks

This file replaces the original phase scaffold with the current gap-fill plan. The React
renderer already exists under `src/renderer/`; use this checklist to get it buildable,
functionally equivalent to the legacy SPA, and shippable.

Before editing, skim `context.md` for API shapes, sentinel constants, initial admin
auto-login, hash routes, and reader overlay invariants.

## Current Stack Targets

- React 18
- React Router DOM 7 with `HashRouter`
- TanStack Query 5
- Zustand 5
- Tailwind CSS 3
- shadcn/ui components under `src/renderer/components/ui`
- Renderer source under `src/renderer`, Vite output under `dist/web`

## 0. Build Blockers

- [x] Fix the syntax error in `src/renderer/components/library/LibraryGrid.tsx`; hook/state
  declarations must be inside the function body, not the parameter destructuring.
- [x] Run `pnpm run typecheck` and fix every renderer/main TypeScript error.
- [x] Run `pnpm build:renderer` and fix Vite build failures.
- [ ] Ensure `pnpm start` and `pnpm package` build or require a fresh `dist/web` before Forge
  copies it. Add a `prepackage` or Forge hook if needed.
- [ ] Ensure Docker/standalone builds do not double-build the renderer unnecessarily, but always
  include a fresh `dist/web`.

## 1. Admin Session Bootstrap

- [ ] Treat first-boot admin auto-login as a blocker, not a later admin feature.
- [x] At app bootstrap, call `/api/auth/session`.
- [x] If unauthenticated, call `/api/settings/initial-credentials`.
- [x] If that response contains `initial_password`, log in with it and then refetch/invalidate
  `['session']` before admin-gated UI decides the user is a guest.
- [x] Fix Settings temporary password display to read `initial_password`, not `password`.
- [ ] Add a regression check for a fresh DB/container: first page load becomes admin-authenticated
  without user action.

## 2. API Shape Mismatches

- [ ] Audit `src/renderer/lib/api.ts` against `context.md` section 4 and route implementations.
- [x] Fix `adminHostInfo` typing and usage; `AddPathPanel` currently expects `homePath`.
- [x] Fix ingest failure summary typing and UI. The docs say `categories`/`samples`; current UI
  reads `byClass`/`sample`. Match the real backend response.
- [x] Confirm `clearLibrary()` return parsing. It is currently declared `Promise<void>` but
  Settings tries to read `response.removed.comics`.
- [x] Confirm all auth calls use `credentials: 'same-origin'` where cookies are set or cleared.
- [x] Confirm favorites use the backend query param `favorites=true`, never `favoritesOnly=true`.

## 3. Query Invalidation

- [x] Remove remaining reliance on `window.dispatchEvent(new CustomEvent('cb8:library-changed'))`
  in React code, or add one intentional bridge listener that invalidates TanStack Query caches.
- [x] For upload/add-path/delete/tag/folder/library mutations, invalidate comics, folders,
  libraries, tags, browse, series, continue-reading, and recently-read queries.
- [x] Ensure sign-in/sign-out invalidates per-user queries so progress/favorites from a previous
  user cannot remain visible. (Sign-out now calls `invalidateLibraryQueries` after clearing the
  session; sign-in invalidates `['session']` which triggers dependent queries to refetch.)

## 4. Library UI Parity

- [x] Complete card context menu tagging. The current "Edit Tags" item is a placeholder.
- [x] Port metadata search/apply from the legacy admin context menu.
- [x] Add collection/folder rename, delete, and manage-items UI.
- [ ] Verify shift-click range selection, selected-item context behavior, and long-press context
  menus on touch devices.
- [x] Wire `usePullToRefresh` into the main scroll container and show the pull indicator.
- [x] `sortOrder='desc'` applied for `dateAdded`/`lastRead` sorts in `useInfiniteComics`,
  `LibraryPage`, and `TagPage` (was only done in `FolderPages`/`BrowsePages`). (context.md §16)
- [ ] Verify search switches to global grouped browse and deep links remain URL-encoded.

## 5. Reader Parity

- [ ] Verify the reader overlay preserves the previous library route and scroll position when
  opening `#/read/:id` and going back.
- [ ] Decide whether the hidden-but-mounted route container is acceptable, or refactor to a true
  sibling overlay that keeps the library visible underneath.
- [ ] Replace text/emoji reader toolbar controls with lucide icons plus tooltips where practical.
- [ ] Test comic reader: keyboard, tap zones, pinch zoom, pan, swipe, spread, LTR/RTL, zoom modes,
  slide transition, fullscreen, orientation lock, bookmark, favorite, progress, wake lock.
- [ ] Test PDF reader: render quality, keyboard, tap/swipe navigation, slider, progress resume.
- [ ] Test EPUB reader: chapter navigation, keyboard/tap/swipe navigation, font size, theme,
  location persistence.
- [ ] Decide CDN vs bundled dynamic imports for pdf.js/epub.js and document the choice.

## 6. Admin And Auth UI

- [ ] Confirm admin login, sign-up, email verification, forgot password, and reset password flows
  work with better-auth cookies.
- [ ] Move reset-password handling into the admin modal if that UX is still desired; otherwise
  update `design.md` to document the standalone reset page.
- [ ] Complete Settings: guest access toggle, initial password display/clear, theme picker,
  Electron web-server port, library wipe, metadata search/apply.
- [ ] Complete Add Path: host path default, autocomplete, NDJSON progress, failure summary, query
  invalidation after success.
- [ ] Complete Upload: file/folder upload, XHR progress, failure display, query invalidation.
- [ ] Complete Users: list/create/delete/toggle admin role with role-gated access.

## 7. Mobile And Responsive QA

- [ ] Verify desktop 1440px, tablet 1024px, iPad 768px, and mobile 375px layouts.
- [ ] Verify sidebar hides and bottom tab bar appears on small screens.
- [ ] Verify sort sheet and tab panel open, close, and navigate correctly.
- [ ] Verify no text overflows compact buttons, cards, sidebars, sheets, or reader controls.
- [ ] Verify iOS overscroll behavior in the comic reader and main library scroll container.

## 8. Polish And Cleanup

- [ ] Remove or archive legacy `src/web` files only after equivalent `src/renderer` behavior is
  verified.
- [ ] Remove unused imports, unused hooks, and placeholder comments.
- [ ] Run accessibility pass: focus order, dialog focus traps, ARIA labels, keyboard operation.
- [ ] Run bundle-size check and split heavy reader dependencies if bundling PDF/EPUB libraries.
- [ ] Update README/product docs to say the frontend is React + shadcn + Tailwind under
  `src/renderer`.

## Final Smoke Test

- [x] `pnpm run typecheck`
- [x] `pnpm test`
- [x] `pnpm build:renderer`
- [x] `pnpm build:standalone`
- [ ] `pnpm start`
- [ ] Fresh DB/container auto-login as initial admin
- [ ] Add path, upload, delete, tag, favorite, bookmark
- [ ] Open CBZ/CBR, PDF, and EPUB
- [ ] Back from reader returns to the exact previous library view
- [ ] Theme persists across reload with no flash
