# PLAN10 — Collapse onto the web UI and retire the Electron-only UI

## Status
- ✅ **Complete.** All seven phases shipped. `src/renderer/` is deleted,
  Electron loads `src/web/` from the embedded HTTP server, IPC is
  trimmed to host-only channels, and the docs (AGENTS.md, FEATURES.md,
  README.md, REFACTORS2.md) describe one frontend.

## Goal
Keep the web UI and remove the long-term `src/renderer/` vs `src/web/`
duplication. The app should have one frontend surface, with Electron acting as
the desktop host for that same surface instead of shipping a separate React
desktop UI.

This plan is intentionally about product-surface unification, not about
framework purity. The core decision is:

- keep the web UX, navigation model, reader behavior, and admin flows
- stop maintaining a separate Electron-first UI
- keep Electron only for native affordances the browser cannot provide cleanly

## Why this direction
- `REFACTORS2.md` correctly identifies the biggest duplication in the repo:
  `src/renderer/` and `src/web/` implement parallel products.
- The web side already has the stronger product shape for remote access,
  mobile, auth, and admin workflows.
- Electron already has the right host primitives:
  - preload bridge in `src/main/preload.ts`
  - embedded HTTP server in `src/main/webServer.ts`
  - menu / app lifecycle / native file-open in `src/main/index.ts`
- The static server fallback already serves a SPA from one directory, so the
  host model needed for a unified UI already exists.

## Non-goals
- Do not preserve the current Electron React UI as a co-equal surface.
- Do not do a flag-day rewrite of server routes or the DB layer.
- Do not remove Electron entirely; desktop packaging and native integration are
  still valuable.

## Target
`src/web/` is the unified frontend. Electron opens it. The embedded web
server serves the same code for browser clients.

`src/web-next/` (the SvelteKit scaffold) is **not** the target and is out
of scope for this campaign. It can be removed or left dormant; do not
invest further effort in it. Where this plan says "the SPA", read that as
`src/web/`.

---

## Phase 0 — Choose the single frontend and freeze duplication

1. Declare `src/web/` as the source of truth for all frontend work.
2. Stop adding net-new user-facing features to `src/renderer/` unless the work
   is strictly desktop-native.
3. Treat `src/renderer/` as a compatibility shell during the migration, not as
   an evolving app.
4. Update `REFACTORS2.md` / `FEATURES.md` language so contributors do not keep
   landing mirrored UI work on both sides.
5. Remove or freeze `src/web-next/` so it is not mistaken for the target.

Exit criteria:
- Everyone working in the repo knows which frontend owns future UI work.
- Any remaining `src/renderer/` changes are explicitly host-only.

---

## Phase 1 — Introduce a host capability boundary

The unified SPA needs a small, explicit way to ask "am I running inside
Electron, and if so, what native capabilities are available?"

1. Add a tiny frontend host module at `src/web/host/`.
2. Expose only desktop-native capabilities through preload:
   - open file passed by OS / app menu
   - native file-picker or folder-picker, if still preferred over browser
     upload / File System Access API
   - application menu commands such as "open settings"
   - optional "isElectron" / platform metadata
3. Keep domain operations out of preload.
   - Library queries, reading progress, tags, folders, auth, and admin should
     stay on the HTTP API, not on duplicate IPC wrappers.
4. Normalize capability detection in the SPA.
   - Browser-only clients should degrade cleanly when the host bridge is
     unavailable.

Files likely involved:
- `src/main/preload.ts`
- `src/shared/ipcTypes.ts` for any remaining send-only shell events
- new host wrapper on the SPA side

Exit criteria:
- The SPA can run both in a browser and in Electron.
- The SPA does not need direct knowledge of `ipcRenderer` or Electron internals.

---

## Phase 2 — Make Electron load the same SPA the web server serves

This is the pivot point. Electron should stop loading the separate renderer
bundle and instead host the web UI.

1. Start the embedded web server in desktop mode before the BrowserWindow
   navigates.
   - Today `src/main/index.ts` starts the server only in headless mode or when
     toggled elsewhere.
   - Desktop mode should also have a live local server handle.
2. Load the BrowserWindow from the local server URL.
   - Development: load the SPA dev URL if running a frontend dev server.
   - Production: load `http://127.0.0.1:<port>` from the embedded server.
3. Keep the SPA static-root logic centralized in the server.
   - `src/main/webServer.ts:resolveStaticRoot()` already supports a served SPA.
4. Do not keep a second desktop-only HTML entrypoint once the cutover happens.

Files likely involved:
- `src/main/index.ts`
- `src/main/webServer.ts`
- `forge.config.ts`
- possibly package scripts so desktop dev can boot both the server and the SPA

Implementation note:
- Once Electron loads the local server URL, the old Vite renderer target rooted
  at `src/renderer/` is no longer the primary desktop UI path.

Exit criteria:
- Launching the Electron app opens the same UI that browser users receive.
- A desktop session still has menu integration and file-open behavior.

---

## Phase 3 — Move desktop flows off the old renderer and into the SPA

At this point the shell is loading the SPA, but some behaviors may still live
only in `src/renderer/`.

1. File open flow
   - Replace `file-opened` handling in `src/renderer/components/App.tsx` with a
     SPA-side host listener.
   - The listener should route to the same reader URLs / state transitions used
     by browser navigation.
2. Settings / app commands
   - Any "open settings" or similar app-menu actions should dispatch into the
     SPA through the host bridge.
3. Desktop-only pickers
   - Decide whether each flow should stay native or move to browser-native
     upload / file APIs.
   - Examples:
     - local upload can remain browser-driven
     - "add from server path" stays host/server/admin-gated because it is not a
       normal browser capability
4. Reader-specific desktop shortcuts
   - Preserve keyboard and open-file ergonomics, but implement them in the SPA
     code path rather than the old React desktop app.

Exit criteria:
- All user-visible desktop workflows happen through the unified SPA.
- The old `src/renderer/` app is no longer required for normal usage.

---

## Phase 4 — Collapse duplicated API access patterns ✅ DONE

**Status:** Audit complete and the `AUDIT-GAP` server backfill landed in
Phase 5. The SPA already only talks to the HTTP API; the duplication
lives entirely in `src/renderer/ipcClient.ts`, which Phase 6 deletes
outright. Every invoke channel in `src/shared/ipcTypes.ts` is now
annotated `HOST` / `RETIRE` so Phase 6 can mechanically drop the
`RETIRE` set.

Backfilled HTTP routes (all admin-gated):
- `POST /api/comics/:id/refresh-metadata` ↔ `library:refresh-book-metadata`.
- `POST /api/tags/:name/comics` and `DELETE` ↔ bulk tag ops.
- `POST /api/libraries/:id/folders` ↔ `libraries:add-folders`.

The `app-meta:get/set` channels were the only renderer-only consumer
(`LibraryView.tsx` filter preset) — the SPA already persists similar
prefs via localStorage, so no server route is required and the channels
ride out with the renderer in Phase 6.

The plan items below were the original scope notes, kept for traceability.



The current split is not only visual; it also duplicates transport.

1. Prefer HTTP API access for shared product behavior.
   - `src/web/api.js` is canonical.
2. Reserve IPC for host-only actions.
   - menu events
   - native path/file affordances
   - app lifecycle notifications
3. Audit `src/renderer/ipcClient.ts`.
   - Classify each method as:
     - should become HTTP API usage
     - should remain host-only
     - can be deleted
4. Remove any renderer-side direct dependence on `window.electronAPI.invoke`
   for product logic.

Files likely involved:
- `src/renderer/ipcClient.ts`
- `src/main/ipc/*`
- `src/main/webServer/routes/*`
- canonical SPA API client

Exit criteria:
- Shared product behavior talks to one backend surface.
- IPC is narrow and obviously shell-specific.

---

## Phase 5 — Port any missing Electron-only UI features into the SPA

Before deleting the old desktop app, verify whether the SPA still lacks any
desktop features that users care about.

Likely categories to check:
- settings UI
- continue-reading entry points triggered by shell/menu actions
- native open-file behavior
- any reader affordances that exist only in React components today

Concrete audit targets:
- `src/renderer/components/App.tsx`
- `src/renderer/components/LibraryView.tsx`
- `src/renderer/components/ReaderView.tsx`
- `src/renderer/components/EpubReaderView.tsx`
- `src/renderer/components/PdfReaderView.tsx`
- `src/renderer/components/SettingsDialog.tsx`

For each gap:
1. Decide whether the SPA already has parity.
2. If not, port the behavior into the unified frontend.
3. Delete the desktop-only implementation after parity is verified.

Exit criteria:
- There is no meaningful end-user reason to keep the old Electron React app.

---

## Phase 6 — Remove the old Electron UI surface

Once the SPA is the only frontend in active use:

1. Delete the old renderer entrypoint and components that only existed for the
   separate desktop app.
2. Remove the Vite renderer build target if Electron no longer needs a separate
   packaged renderer bundle.
3. Remove dead IPC handlers created only for the old desktop product surface.
4. Update packaging so the app ships the SPA assets, not `src/renderer/`
   output, as the primary UI.

Likely files to revisit:
- `forge.config.ts`
- `vite.renderer.config.ts`
- `src/renderer/**`
- `src/main/index.ts`
- `src/main/preload.ts`
- `src/shared/ipcTypes.ts`

Exit criteria:
- One frontend remains.
- Electron is a host shell, not a second app.

---

## Phase 7 — Documentation and cleanup

1. Update `FEATURES.md`.
   - Replace separate "Library UI (Electron)" and "Library UI (Web)" ownership
     notes with the unified frontend structure.
2. Update `AGENTS.md`.
   - The code map should stop presenting `src/renderer/` and `src/web/` as
     parallel long-term surfaces once the cutover is done.
3. Update build/docs commands.
   - Make it obvious how to run desktop mode and browser mode against the same
     SPA.
4. Remove stale comments in:
   - `src/main/webServer.ts`
   - `src/main/index.ts`
   - any README / notes that describe two maintained UIs

Exit criteria:
- Repo docs describe one maintained frontend architecture.

---

## Suggested execution order

1. Declare `src/web/` canonical; freeze/remove `src/web-next/`.
2. Add the host capability boundary.
3. Make Electron load the same SPA served by the embedded server.
4. Move desktop-only flows into the SPA path.
5. Collapse product logic onto HTTP APIs and narrow IPC to shell concerns.
6. Port any missing desktop-only UI features.
7. Delete `src/renderer/`-only UI code.
8. Update docs and packaging.

## Risks and mitigations

- Desktop startup becomes dependent on the local server starting cleanly.
  - Mitigation: start the server before window creation and fail loudly with a
    clear desktop error path.
- Some Electron-only flows may currently assume IPC-first state rather than URL
    or API-driven SPA state.
  - Mitigation: convert those flows one at a time behind the new host wrapper.
- `src/web-next/` exists as a partial SvelteKit scaffold and could distract
  from the unification work.
  - Mitigation: remove or freeze `src/web-next/` early in Phase 0 so all
    frontend work lands on `src/web/`.
- Packaging may still copy the old web assets or build the old renderer target.
  - Mitigation: treat `forge.config.ts` and static-root selection as explicit
    cutover checkpoints.

## Definition of done

- Electron and browser clients open the same frontend.
- Only one frontend surface receives normal product work.
- Shared product behavior uses the HTTP API, not parallel HTTP and IPC stacks.
- `src/renderer/` is removed or reduced to trivial shell glue only.
- The repo docs no longer describe two maintained UIs.
