# Bugs

Findings from a bugfix pass (2026-07-01). Each entry: location, severity, what goes
wrong, and the fix. Trivial ones are already fixed in the working tree and marked
**FIXED**; the rest are documented only.

## Flutter — data layer

### 1. SQLite foreign keys are never enabled — every `onDelete` cascade is a no-op — HIGH — FIXED
`lib/data/db/database.dart:316` (MigrationStrategy; FK declarations at 94, 116, 132,
147, 199, 219, 233, 256).
SQLite defaults to `PRAGMA foreign_keys = OFF` and nothing in the app (or
drift_flutter) turns it on, so all `references(..., onDelete: cascade/setNull)`
clauses are inert. `LocalSource.deleteComic` relies on the cascade ("Removing the
row cascades to favorites/tags/history/membership"), so deleting a comic leaves
orphan rows in `favorites`, `comic_tags`, `reading_history`, `library_comics`, and
`want_to_read`. Tag and collection counts stay inflated forever; `Folders.coverComicId`
never nulls out.
**Fixed:** added `beforeOpen` enabling `PRAGMA foreign_keys = ON`, bumped schema to v4,
and added a `_sweepOrphans()` migration step that purges orphan child rows / clears
dangling folder covers left behind by earlier versions.

### 2. `LocalSource.createLibrary` returns a garbage id when the name already exists — HIGH — FIXED
`lib/data/sources/local_source.dart:581-594`.
Uses `InsertMode.insertOrIgnore` and treats a non-zero return as "inserted", but on an
ignored insert sqlite's `last_insert_rowid()` is whatever the connection last inserted
into *any* table (e.g. a `reading_history` row from a page turn). Re-creating an
existing collection name then returns that unrelated rowid, and the follow-up
`setInLibrary` inserts a membership row pointing at a nonexistent library (silently,
because of bug #1). The comic never appears in the collection.
**Fixed:** dropped the rowid shortcut; `createLibrary` now always resolves the id by
selecting the row by its unique (trimmed) name after the `insertOrIgnore`.

### 3. Remote EPUBs can never show completed/in-progress state — MEDIUM — FIXED
`lib/data/sources/remote_source.dart:165` (`_fromJson`).
`completed` is derived purely from `lastPage >= pageCount - 1`, but remote books track
position via `lastLocation`/`lastPercent` with `lastPage` null, so `completed` is
always false and `progress` is always 0 for them. The server's own `readStatus=completed`
filter uses the stored flag, so a finished EPUB appears in the *completed* facet with
no completed styling and an empty progress bar.
**Fixed:** added a `lastPercent` (0–100) field to `ComicSummary`; `progress` now
prefers it, and `RemoteSource._fromJson` maps the server's `lastPercent` and derives
`completed` from it (`>= 99`, matching the reader's ~0.99 completion threshold) for
books, keeping the last-page heuristic for paged formats.

### 4. `RemoteSource.getComic` throws on 404 instead of returning null — LOW — FIXED
`lib/data/sources/remote_source.dart:227-232`.
The `LibrarySource` contract returns `ComicSummary?` (LocalSource returns null), but
dio throws on non-2xx, so a deleted-on-server id surfaces as a raw
"Could not open: DioException…" in the reader instead of the friendly
"Item not found." path in `reader_dispatcher.dart:46`.
**Fixed:** `getComic` now catches `DioException`, returns null on a 404, and rethrows
other errors.

### 5. `RemoteSource.downloadFile` doesn't enforce its "non-empty" check — LOW — FIXED
`lib/data/sources/remote_source.dart:396-399`.
The comment says "Ensure the file exists and is non-empty" but only `exists()` is
checked. A zero-byte 200 response passes; the dispatcher renames the `.part` into the
cache and the reader fails on open.
**Fixed:** `downloadFile` now also throws when the downloaded file is zero bytes
(`await file.length() == 0`).

## Flutter — features / UI

### 6. Unified reader marks a book "completed" at the end of any chapter — HIGH — FIXED
`lib/features/reader/unified_reader_screen.dart:321-331` (`_saveProgress`).
Readium's `locations.progression` is progression *within the current resource*
(chapter); `totalProgression` is progression through the whole book. The code uses
`progression >= 0.99` for `completed`, so finishing chapter 1 of a 40-chapter EPUB
flags the whole book read and drops it off Continue Reading. Relatedly, `_progressBar`
(~1150, ~1194) shows this per-chapter value as a whole-book "$percent%".
**Fixed:** the `completed` check now uses `locations?.totalProgression`. The progress
bar's slider/label are left on per-resource `progression` deliberately — `goToProgression`
navigates within the current resource (verified in the plugin's iOS impl), so slider and
label stay a consistent per-chapter control rather than diverging from each other.

### 7. Global keyboard handler hijacks typing in the reader's search sheet — HIGH — FIXED
`lib/features/reader/reader_keyboard.dart:66, 75-126`.
`ReaderKeyboard` registers a process-global `HardwareKeyboard` handler that stays
active while modal sheets sit on top. With the unified reader's `_SearchSheet`
TextField focused: Space fires `onNext()` and is swallowed (can't type spaces), `f`
toggles fullscreen, arrows page the book under the sheet. Latent before (comic/PDF
readers had no text fields), user-visible now.
**Fixed:** `_onKey` now returns false early when
`FocusManager.instance.primaryFocus?.context?.widget is EditableText`, letting
keystrokes reach a focused text field.

### 8. Dispose race in `_resolveAndOpen`: listeners attached after the widget is gone — HIGH — FIXED
`lib/features/reader/unified_reader_screen.dart:239-319`.
No `mounted` check after `await _reader.openPublication(uri)`. Back out during the
(slow) open and `dispose()` runs first — cancelling four still-null subscriptions and
closing the publication — then the await completes and attaches four listeners that
are never cancelled, keeping the native reader session alive. The locator listener
also calls `_saveProgress` (which does `ref.read`) outside its `mounted` guard →
`StateError` on the next locator event.
**Fixed:** after `openPublication` we now bail with
`if (!mounted) { unawaited(_reader.closePublication().catchError((_){})); return; }`
before assigning `_pub`/attaching listeners, and the locator listener returns early
when `!mounted` so `_saveProgress` (which reads `ref`) never runs post-dispose.

### 9. Persisted EPUB typography preferences are loaded but never applied on open — MEDIUM — FIXED
`lib/features/reader/unified_reader_screen.dart:333-349`.
`_loadPreferences()` restores font scale/family, line height, margins, spacing, etc.
into state, but the `EPUBPreferences` patch sent on `ready` only includes
background/text color, publisherStyles, columnCount, and scroll. Set font size to
150%, reopen the book → renders at default size while the settings sheet claims 150%.
**Fixed:** `_applyPreferences`'s EPUB branch now sends the full persisted set
(fontSize, fontFamily, lineHeight, pageMargins, word/letter spacing, textAlign,
textNormalization, ligatures, hyphens, readingProgression, imageFilter) alongside
theme/columns, so restored settings take effect on open.

### 10. PDF covers/pages decoded with red/blue swapped (BGRA vs RGBA) — MEDIUM — FIXED
`lib/features/import/media_probe.dart:128` and
`lib/features/reader/comic/pdf_page_source.dart:104-110`.
pdfrx renders BGRA8888, but the cover probe built `img.Image.fromBytes` without
`order:` (interpreted as RGBA) and the page renderer used `ui.PixelFormat.rgba8888`.
Every imported PDF cover had red/blue swapped; the page path is latent (only reachable
if a PDF is routed through the comic reader) but wrong.
**Fixed:** `order: img.ChannelOrder.bgra` in the probe; `ui.PixelFormat.bgra8888` in
the page source.

### 11. Watched folders: recursive watch unsupported on Linux, and no stream error handler — MEDIUM — FIXED
`lib/features/import/watched_folders.dart:154-156`.
`_isDesktop` includes Linux, but `Directory.watch(recursive: true)` is only supported
on macOS/Windows; on Linux the stream emits a `FileSystemException`, and with no
`onError` the error is unhandled and live watching silently dies.
**Fixed:** the watch is now wrapped in try/catch (synchronous throws) and given an
`onError`/`cancelOnError` handler that drops the failed watcher, so the folder falls
back to launch/manual rescan instead of dying with an unhandled async error.

### 12. Watched folders: files still being copied when the debounce fires are permanently missed — MEDIUM — FIXED
`lib/features/import/watched_folders.dart:155, 162-165`.
Only `create | move` events are watched and the rescan fires 2s after create. A large
CBZ/PDF still copying at that point probes as truncated — either silently counted as
failed or imported with a wrong page count — and since `modify` isn't watched, nothing
retries when the copy finishes.
**Fixed:** the watcher now also subscribes to `FileSystemEvent.modify`, so ongoing
writes keep resetting the 2s debounce until the copy settles — the rescan fires on the
quiet period rather than 2s after the first event.

### 13. "Imported N" over-counts on insert conflicts — LOW — FIXED
`lib/features/import/import_controller.dart:190-197` (with `watched_folders.dart:124-131`).
`_ingest` increments `imported` unconditionally after an `insertOrIgnore`, so
already-catalogued uris count as imported (nested watched folders, or launch-time
`rescanAll` racing an event rescan). "Imported 12 new files" for 0 actual imports.
**Fixed:** `_ingest` now uses `insertReturningOrNull` and skips counting when it
returns null (row already existed), so "Imported N" reflects only genuinely new rows.

### 14. `_toggleTts` calls `setState` after awaits with no mounted check — LOW — FIXED
`lib/features/reader/unified_reader_screen.dart:664-681`.
`await _reader.stop()` / `ttsEnable` are real async gaps; popping the reader mid-await
makes the subsequent `setState` throw "called after dispose()".
**Fixed:** added `if (!mounted) return;` after the awaits in both branches of
`_toggleTts`, before the `setState` calls.

### 15. `duplicates_screen._confirmDelete` uses `ref` after an await without a mounted check — LOW — FIXED
`lib/features/library/duplicates_screen.dart:94-110`.
While the confirm dialog is open, the duplicates list can rebuild from the DB change
stream and unmount the row; confirming then uses a defunct `WidgetRef` → throws.
**Fixed:** `_confirmDelete` now reads `activeSourceProvider` into a local before the
dialog await and deletes via that captured source, so it never touches `ref` after the
row may have unmounted.

## webui — server

### 16. Login rate limiter bypassed via better-auth's native sign-in endpoints — MEDIUM (security) — FIXED
`webui/src/main/webServer/server.ts:188-202`, `serverHelpers.ts:16-29`.
The brute-force limiter only fires on `pathname === '/api/auth/login'`, but
`/api/auth/sign-in/username` and `/api/auth/sign-in/email` delegate straight to
better-auth — and the SPA itself signs in via `/api/auth/sign-in/username`
(`renderer/lib/api/auth.ts:12-17`), so the throttled endpoint is effectively dead code
while the live path allows unthrottled password guessing.
**Fixed:** the `loginLimiter` preHandler now also matches `/api/auth/sign-in/username`
and `/api/auth/sign-in/email` (the routes the SPA actually uses).

### 17. Users created via the new admin flow cannot sign in — HIGH — FIXED
`webui/src/main/webServer/routes/users.ts:35-52` (POST `/api/users`) and
`routes/auth.ts:72-86` (`/api/auth/register`).
With public signup deleted, account creation inserts a `users` row with `email`,
`name`, and `display_username` NULL — and `middleware.ts:104-107` documents that
better-auth's username plugin rejects sign-in for rows where those are null (which is
why `_createInitialAdmin` and `resetAdminCredentials` backfill them). Neither creation
path does the backfill, so admin-created users fail sign-in with valid credentials.
**Fixed:** `db.createUser`'s INSERT now populates `email` (`${username}@localhost`),
`email_verified`, `display_username`, and `name` directly, so every creation path
(`/api/users`, `/api/auth/register`, and `_createInitialAdmin`) yields a sign-in-valid
row. This also resolves the reset-flow email dead-ends noted in #22 for new accounts.

### 18. Malformed percent-encoding on a non-API path hangs the connection — MEDIUM — FIXED
`webui/src/main/webServer/server.ts:226-231` (`setNotFoundHandler`).
The handler calls `reply.hijack()` then `decodeURIComponent(parsed.pathname)` with no
try/catch; `GET /%` throws `URIError` after the reply was hijacked, so no response is
ever written and the socket hangs. Unauthenticated; can be used to tie up connections.
(The `/api/*` path is safe only because `dispatchApi` is wrapped in try/catch.)
**Fixed:** the not-found handler's decode/serveStatic body is now wrapped in try/catch;
it sends a 400 on `URIError` (500 fallback) when headers aren't sent, and destroys the
socket if they already are.

### 19. Host / X-Forwarded-Proto trusted when building absolute URLs in OPDS + WebPub — LOW — FIXED
`webui/src/main/webServer/routes/opds.ts:10-12`, `routes/webpub.ts:21-23`.
`baseUrl` comes from the client-controlled `Host` header and `x-forwarded-proto`
without gating on `CB8_TRUST_PROXY_HEADERS` (trustProxy is off), so all self/cover/
page/file links in the feed/manifest can be rewritten to an attacker-chosen origin.
Reflected only in the requester's own document, but inconsistent with `auth.ts`'s
careful proxy-header handling.
**Fixed:** added a `requestBaseUrl()` helper that ignores `X-Forwarded-Host`/`-Proto`
(and falls back to `http` + direct `Host`) unless `CB8_TRUST_PROXY_HEADERS=1`; both
routes now build their base URL through it.

### 20. OPDS feed / WebPub manifest served as `application/json` — LOW — FIXED
`webui/src/main/webServer/routes/opds.ts:56`, via `serverHelpers.ts:147-155`.
The feed's own `self` link advertises `application/opds+json` (manifests should be
`application/webpub+json`), but `sendJson` hard-codes `application/json`. Strict OPDS
clients may reject the feed.
**Fixed:** `sendJson` now takes an optional content-type; OPDS sends
`application/opds+json` and the WebPub manifest sends `application/webpub+json`.

### 21. WebPub manifest emitted `?upscale=true` but the page route checks `upscale === '1'` — LOW — FIXED
`webui/src/main/webServer/routes/webpub.ts:29` vs `routes/comics.ts:156`.
HD requests through the manifest silently served standard-res pages.
**Fixed:** manifest now emits `?upscale=1`.

## webui — renderer

### 22. "Forgot password?" / "Resend verification email" are dead-end flows — MEDIUM — FIXED
`webui/src/renderer/components/admin/LoginPanel.tsx:57-63, 145-153`;
`ForgotPasswordPanel.tsx`.
After the rework no account can have an email (signup deleted, AddUserSection collects
only username+password — see #17), and better-auth's forget-password silently succeeds
for unknown emails: the user sees "Reset link sent — check your inbox" and no email can
ever arrive. Same for the `EMAIL_NOT_VERIFIED` resend branch.
**Fixed:** `ForgotPasswordPanel` no longer pretends to email a reset link — it now
explains that this server has no outbound email and directs the user to an admin (or
the server console for the admin's own account). The now-unreachable resend-verification
affordance was removed from `LoginPanel` (all accounts are auto-verified after #17).

### 23. SettingsPanel shows admin-only controls to non-admins; all fail with 403 — MEDIUM — FIXED
`webui/src/renderer/components/admin/SettingsPanel.tsx:158-171`,
`adminPanelHelpers.ts:44-51`.
Settings became a non-admin panel, but the guest-access toggle, auto-rescan save, and
"Clear library" danger zone all hit `requireAdmin` routes — a non-admin flips a switch,
it toggles, then errors.
**Fixed:** GuestAccessSection, AutoRescanSection, and DangerZoneSection are now gated
behind `session?.user?.isAdmin === true`; the theme picker stays visible to everyone.

### 24. Sidebar "Create collection/folder" buttons silently no-op for non-admins — LOW/MEDIUM — FIXED
`webui/src/renderer/components/layout/Sidebar.tsx:105-108, 129-133`.
The "+" buttons render for everyone, but `create-collection`/`create-folder` are now
admin-only panels, so for a non-admin the click opens the AdminModal on the generic
menu panel — the create form never appears and nothing explains why.
**Fixed:** Sidebar now reads the session and passes `onAdd` only when `isAdmin`, so the
"+" buttons don't render for non-admins.

### 25. useDrop: dropping a file as a non-admin navigates the browser away — LOW — FIXED
`webui/src/renderer/hooks/useDrop.ts:24-29`.
The window-level `dragover`/`drop` listeners (whose `preventDefault` suppresses the
browser default) are only registered when `isAdmin` (gate changed from
`isAuthenticated`), so a signed-in non-admin dropping a `.cbz` navigates the tab to
the local file, blowing away the SPA.
**Fixed:** `useDrop` now always registers the window listeners and calls
`preventDefault` on dragover/drop; only the drag overlay and `onFilesDropped` are gated
on `isAdmin`, so a non-admin drop is a harmless no-op instead of navigating the tab.

## Checked and cleared (not bugs)

- OPDS/WebPub routes are **not** auth bypasses (registered behind `canAccessApiRequest`,
  GET-only, guest-read consistent). No path traversal in file serving; no zip-slip.
- Signup removal is consistent server-side: sign-up endpoints 403, no orphaned
  better-auth signup route; no dangling `SignupPanel` references in the renderer.
- Secrets use `bcrypt.compare`; the rate limiter keys on the socket address (no
  X-Forwarded-For spoofing while trustProxy is off).
- Storage-path hygiene in the Flutter data layer is correct (relative paths persisted).
- No dangling references to the deleted `epub_reader_screen.dart`.
- Comic reader spread math verified correct for cover-first and odd counts.
- `RemoteSource.setProgress` swallowing errors is per the documented guest contract.
- UsersPanel role-change races and self-toggle/self-delete are properly guarded.
