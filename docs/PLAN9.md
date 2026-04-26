# PLAN9 — Migrate the web frontend to SvelteKit (SPA mode)

## Status
- Completed before this pass:
  - Phase 0 scaffold
- Completed in this pass:
  - Phase 1 API client split into endpoint modules under `src/web-next/src/lib/api/`
  - shared request wrapper with cookie-aware JSON handling
  - compatibility barrel at `src/web-next/src/lib/api.ts`
  - Phase 2 app shell baseline in `+layout.svelte` / `+layout.ts`
  - route-level session loading shared across child routes
  - shared app stylesheet and toast host
  - Phase 3b auth route baseline for sign-in and admin-managed account creation
- Still open:
  - route-level adoption of the new modules
  - stronger shared response typing once server schemas are formalised

## Goal
Replace the vanilla-DOM frontend in `src/web/` with a SvelteKit SPA in
`src/web-next/`, served by the existing Fastify backend. SSR stays off; the
backend, auth, and API surface are unchanged.

## Why SvelteKit (SPA mode)
- File-based router replaces hand-rolled `src/web/app/router.js`.
- `+layout.svelte` replaces the manual sidebar/topbar plumbing in
  `src/web/app/tabPanel.js` (348 lines) and `src/web/app/sidebar.js`.
- Typed `load()` functions replace ad-hoc `fetch` calls in
  `src/web/views/library.js` (850 lines).
- SPA mode (`adapter-static` + `ssr: false`) keeps Fastify as the only server.

## Migration principle
Both UIs live side-by-side until the last page is ported. Cut over by switching
`CB8_STATIC_ROOT` in production. No flag-day rewrite.

---

## Phase 0 — Scaffold (DONE)
- [x] `src/web-next/` SvelteKit project (`adapter-static`, fallback
      `index.html`, `ssr=false`, `prerender=false`).
- [x] `pnpm web:dev`, `pnpm web:build`, `pnpm web:check` scripts.
- [x] Vite dev proxy: `/api → http://localhost:8008` (override
      `CB8_API_TARGET`).
- [x] `vite.config.mts` allows `node_modules` at the repo root via
      `server.fs.allow`.
- [x] Server reads `CB8_STATIC_ROOT` so the SvelteKit build can be served by
      Fastify in prod.
- [x] `docker compose --profile dev up` brings up Fastify + Vite together.

Smoke test: open `http://localhost:5173/`. Landing page calls `/api/auth/session`
through the proxy.

---

## Phase 1 — Shared API client + types
**Why first:** every ported page depends on it. Doing it now means we don't
rewrite any view twice.

Status: mostly done.

1. Inventory `src/web/api.js` (644 lines). Group endpoints into modules:
   `auth`, `users`, `libraries`, `folders`, `comics`, `progress`, `tags`,
   `upload`.
2. In `src/web-next/src/lib/api/`:
   - `client.ts` — `fetch` wrapper with `credentials: 'include'`, JSON parsing,
     typed errors.
   - One module per endpoint group, mirroring the Fastify route layout.
3. **Types**: derive request/response types from Zod schemas added in the
   server routes (REFACTOR.md item #2 — do this incrementally; until a route
   has a Zod schema, hand-write the response type from the route source).
4. Replace any `window.api` shape from the legacy code with explicit imports.

Exit criteria: a page can be written using only typed functions from
`$lib/api/*`.

---

## Phase 2 — App shell
Status: baseline completed.

1. `+layout.svelte` — top bar (brand + nav + user menu). Replaces
   `src/web/app/sidebar.js` + `src/web/app/tabPanel.js` chrome.
2. `+layout.ts` — fetches the session once via `getSession()` and exposes
   `data.user` to all child routes.
3. Auth guard: a small helper `requireUser(data)` that throws `redirect(302,
   '/login')` when null. Used inside child `+page.ts` `load()` functions.
4. Toast/notification primitive (`$lib/ui/toast.ts`). Mirrors
   `src/web/app/toast.js` (15 lines — trivial port).
5. Global CSS: copy the variables and base rules from `src/web/style.css` into
   `src/web-next/src/app.css`, imported from `+layout.svelte`. Drop dead rules
   as we go.

Exit criteria: visiting `/` shows the app chrome with a working session probe;
unauthenticated users redirect to `/login`.

---

## Phase 3 — Port views (one per PR)
Order is smallest-first to validate the pattern before the heavy ones.

### 3a. Reader (`src/web/views/reader.js`, 52 lines)
- New route: `src/routes/read/[comicId]/[page]/+page.svelte`.
- Image fetch + keyboard handlers in `onMount`. Use `$state` for current page
  index, `$derived` for next/prev URLs.
- The page-image endpoint already returns bytes; just `<img src={pageUrl} />`.
- Keep keyboard bindings (`ArrowLeft`/`ArrowRight`/`Home`/`End`) identical to
  the legacy reader.

### 3b. Login / signup / forgot-password / reset-password
Status: partially completed.

- `src/web/admin/{login,signup,forgotPassword,resetPassword}.js` — small forms,
  good second port to nail down form-action patterns.
- Use SvelteKit form actions only if we add SSR for auth (we won't). Use
  `<form on:submit|preventDefault>` calling `$lib/api/auth.ts`.

Notes:
- Implemented:
  - `/login`
  - `/users/new` (admin-only account creation, matching the real Fastify API)
  - `/forgot-password` placeholder explaining the flow is not currently supported
- Deferred:
  - a true password-reset flow, because the backend does not expose those routes
  - public signup, because the current backend only allows admin-created accounts

### 3c. Library view (`src/web/views/library.js`, 850 lines)
- This is the big one. Break into components in
  `src/routes/+page.svelte`:
  - `LibraryGrid.svelte` — virtualised cover grid.
  - `LibrarySidebar.svelte` — folder tree.
  - `SortMenu.svelte` (replaces `src/web/app/sort.js`).
  - `ContextMenu.svelte` (replaces `src/web/app/sideContextMenu.js`).
- Replace ad-hoc state (module-level `let` in legacy) with Svelte 5 runes
  (`$state`, `$derived`, `$effect`).
- DnD upload (`src/web/app/drop.js`) becomes a single
  `DropTarget.svelte` action.

### 3d. Admin pages
- `src/web/admin/{addPath,bulkDelete,contextMenu,upload,menu,modal,session}.js`.
- New routes under `/admin/*`. Most are forms/tables — straightforward.
- `contextMenu.js` (359 lines) is the biggest; lift selection state into a
  store in `$lib/admin/selection.svelte.ts`.

---

## Phase 4 — Cut over
1. `pnpm web:build` → `src/web-next/build/`.
2. Set `CB8_STATIC_ROOT=src/web-next/build` (or the absolute path inside the
   container).
3. Update the production `Dockerfile` to:
   - Run `pnpm web:build` in the builder stage.
   - Copy `src/web-next/build/` into the runtime image instead of
     `src/web/`.
   - Drop the `src/web/` copy line.
4. Smoke test: prod image, hard reload, exercise login → library → reader →
   admin.

---

## Phase 5 — Cleanup
1. Delete `src/web/` once parity is verified for at least one release.
2. Drop the legacy SPA fallback ordering in
   `src/server/main.ts:resolveStaticRoot()` — only the override remains
   needed.
3. Remove `src/shared/ipcTypes.ts` if not already gone (dead Electron
   surface).
4. Move shared logic that the new frontend imports (e.g.
   `src/shared/naturalSort.ts`, `coverSelection.ts`) to a path Vite resolves
   without `..` traversal — either keep `src/shared/` and add a Vite alias
   `$shared`, or move the files into `src/web-next/src/lib/shared/`.

---

## Risks & mitigations
- **Cookie auth across the proxy.** The dev proxy preserves cookies because
  `changeOrigin: false`. If you change ports/hostnames, set `SameSite=Lax`
  explicitly server-side.
- **Streaming endpoints** (page images, archive byte ranges) must stay on
  Fastify; SvelteKit only owns HTML/JS/CSS. Confirmed: SPA mode does not
  intercept `/api/*`.
- **Bundle size for the reader.** PDF.js is heavy. Code-split it with a
  dynamic `import('pdfjs-dist')` inside the reader route so the library view
  doesn't pay for it.
- **Service worker / PWA.** `src/web/manifest.json` exists. Port to
  `src/web-next/static/manifest.webmanifest` in Phase 2 to preserve install
  behavior.
- **Tests.** `vitest` is already configured at the repo root and supports
  Svelte via `@sveltejs/vite-plugin-svelte`. Add component tests as we port,
  not after.

---

## Definition of done
- All routes from `src/web/` reachable in `src/web-next/` with parity.
- `CB8_STATIC_ROOT` defaults need not change — just point Docker at the build
  output.
- `src/web/` deleted; no remaining references in `src/server/` or
  `src/main/`.
- `pnpm typecheck && pnpm test && pnpm web:check && pnpm web:build` all pass
  in CI.
