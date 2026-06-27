# CB8 Flutter — Architecture

A cross-platform (iOS / Android / macOS) comic & e‑book reader. It is a ground‑up
Flutter rewrite of the original Electron **CB8** app, and it is **hybrid**: the
same UI reads from either an **on‑device library** (SQLite + local files) or a
**remote CB8 server** (the original app's REST API), chosen at runtime.

The guiding idea: **the UI never knows where content comes from.** Everything goes
through one `LibrarySource` interface, and a single Riverpod provider decides
which implementation is live.

---

## 1. Tech stack

| Concern | Choice |
| --- | --- |
| UI / framework | Flutter (Material 3, dark‑only) |
| State management | Riverpod (`flutter_riverpod`) |
| Routing | `go_router` |
| On‑device DB | Drift (`drift` / `drift_flutter`) over SQLite |
| Remote HTTP | `dio` + `dio_cookie_manager` + `cookie_jar` |
| PDF rendering | `pdfrx` (native, vector) |
| EPUB rendering | `flutter_epub_viewer` (epub.js in a WebView) |
| Comic images | `photo_view` (paged/zoom) + `scrollable_positioned_list` (vertical) |
| Persistence | `shared_preferences` (settings), `path_provider` (storage dirs) |
| Archives / images / pdf gen | `archive`, `image`, `pdf` (import + sample generation) |

---

## 2. Directory layout

```
lib/
  main.dart                     App bootstrap + ProviderScope overrides
  app.dart                      Cb8App: MaterialApp.router, dark theme

  core/
    router/app_router.dart      go_router config ( / and /read/:id )
    theme/                      accent themes + ThemeData provider
    window_control.dart         macOS fullscreen helper

  data/
    db/database.dart(.g.dart)   Drift schema + AppDatabase (mirrors CB8's tables)
    local_files.dart            app-storage dir + relative-path resolution
    models/
      comic_summary.dart        ComicSummary — the source-agnostic catalog row
      connection.dart           a saved server connection
      groups.dart               TagCount / LibraryInfo / SeriesGroup
    sources/
      library_source.dart       LibrarySource interface + LibraryQuery + enums
      local_source.dart         on-device implementation (Drift + files)
      remote_source.dart        CB8 REST implementation (dio + cookies)
    repositories/providers.dart THE provider hub (see §4)

  features/
    shell/app_shell.dart        adaptive nav (rail/bottom bar) + top bar
    connections/                ConnectionSwitcher: pick/add/sign-in/manage servers
    library/                    All + Recent grids, cards, browse grid
    organize/                   Collections, Series, Tags browsers
    reader/
      reader_dispatcher.dart    routes a catalog item to the right reader
      reader_keyboard.dart      keyboard shortcuts wrapper
      reading mode + widgets    shared chrome (see §6)
      comic/                    CBZ/remote image reader + page sources
      pdf/                      pdfrx reader
      epub/                     epub.js (WebView) reader
    import/                     file import, media probing, series parsing, samples
    settings/                   accent, import, clear-continue-reading

test/                          unit/integration tests + an in-process fake server
```

---

## 3. Bootstrap & app shell

`main()` (`lib/main.dart`):

1. `WidgetsFlutterBinding.ensureInitialized()` + `pdfrxFlutterInitialize()`.
2. Loads `SharedPreferences`.
3. Builds a **persistent** `PersistCookieJar` under the app-support dir so server
   sessions survive restarts.
4. Runs `ProviderScope` with three overrides injecting those singletons:
   `sharedPreferencesProvider`, `sharedPrefsProvider` (theme), `cookieJarProvider`.

`Cb8App` (`lib/app.dart`) is a `MaterialApp.router` — dark theme from
`themeDataProvider`, routed by `appRouter`.

**Routing** (`core/router/app_router.dart`): just two routes — `/` → `AppShell`,
and `/read/:id` → `ReaderDispatcher`.

**AppShell** (`features/shell/app_shell.dart`) is the chrome: five destinations —
**All, Recent, Collections, Series, Tags** — shown as a `NavigationRail` on wide
layouts and a bottom `NavigationBar` on phones, rendering the selected tab's body
widget. The top bar holds the search field, the
`ConnectionSwitcher`, and an import-progress spinner. On macOS it also installs a
native `PlatformMenuBar`.

---

## 4. State management — the provider graph

Almost all wiring lives in **`data/repositories/providers.dart`**. Riverpod is
used as the dependency-injection + reactive-cache layer.

```
sharedPreferencesProvider ┐
cookieJarProvider ─────────┤ (overridden in main)
databaseProvider ──────────┘
        │
        ├── localSourceProvider ─────────────┐
        │                                     │
   connectionsProvider (saved servers +       │
        │            which one is active)     │
        │                                     ▼
        └── remoteSourceProvider(conn) ──► activeSourceProvider ──► (the live LibrarySource)
                                                  │
                                                  ├── libraryChangesProvider  (Stream<int> tick)
                                                  │        │
                                                  │   comicsListProvider, continueReadingProvider,
                                                  │   browseComicsProvider, tagsProvider,
                                                  │   librariesProvider, seriesProvider
                                                  │        (FutureProviders — re-run on each tick)
                                                  │
                                                  └── sessionStatusProvider   (guest vs authed)

libraryQueryProvider        search / filters / sort state for the grids
dismissedContinueProvider   ids cleared from the Continue Reading shelf
readingModeProvider         scroll / single / double (persisted)
accentThemeProvider ──► themeDataProvider
importControllerProvider    import progress + actions
```

Key players:

- **`activeSourceProvider`** is the seam. It returns `localSourceProvider` when
  the active connection is `local`, otherwise `remoteSourceProvider(active)`.
  Every screen reads the catalog through this and never branches on source type.
- **`libraryChangesProvider`** is a `StreamProvider<int>` that emits an
  increasing tick whenever the active source's catalog changes. The list
  providers `ref.watch` it, so the UI auto-refreshes (see §8). The value must be
  *distinct* each event or Riverpod dedupes it.
- **`remoteSourceProvider`** is a `Provider.family` keyed by `Connection`; all
  instances share the one `cookieJar`, so a login on one is seen by all.

---

## 5. The hybrid source model

```
            ┌──────────────────────────────┐
   UI  ───► │  LibrarySource (interface)    │
            └──────────────┬───────────────┘
                           │
        ┌──────────────────┴───────────────────┐
        ▼                                       ▼
  LocalSource (Drift + files)          RemoteSource (CB8 REST + dio/cookies)
```

`LibrarySource` (`data/sources/library_source.dart`) defines the whole contract:
`listComics(LibraryQuery)`, `continueReading()`, `watchChanges()`, `getComic()`,
`setProgress()`, `setFavorite()`, tags, collections, series, plus a `id`/`name`.

`LibraryQuery` carries search/filter/sort/paging. Its `copyWith` uses a `_keep`
sentinel so nullable facets (e.g. mediaType) can be **cleared**, not just set.

**`ComicSummary`** (`data/models/comic_summary.dart`) is the single
source-agnostic row the UI renders. Both sources map into it. Notable fields:
`coverThumbnail` (local inline bytes) **xor** `coverUrl` (remote endpoint),
`lastPage` / `lastLocation` (paged vs EPUB-CFI progress), `sourceUri` (local file
path, or a downloaded temp path for remote books), `imageHeaders` (auth cookie
for remote image requests). `copyWith` only overrides `sourceUri` (used after a
remote download) and preserves everything else.

### LocalSource
Drift queries over the on-device SQLite DB. The schema
(`data/db/database.dart`) mirrors CB8's tables trimmed to the single-user case:
`comics`, `bookmarks`, `readingHistory`, `favorites`, `libraries`+`libraryComics`,
`folders`+`folderComics`, `tags`+`comicTags`, and `connections`.
`watchChanges()` is backed by real Drift table-update notifications, so local
edits refresh the UI instantly. `setProgress` writes `lastPage`/`lastLocation`/
`completed`/`lastRead` and appends a `readingHistory` row.

### RemoteSource
A `dio` client against a CB8 server. Endpoints + field names mirror the server's
`routes/*` + `mapping.ts`: `/api/comics` (list, `{records,totalCount}`),
`/api/comics/:id` (detail), `/api/comics/:id/pages/:n` (comic page images),
`/api/comics/:id/file` (whole-file book download), `/api/comics/:id/progress`
(PUT), `/api/auth/*`. A shared `CookieManager`/`CookieJar` carries the
better-auth session cookie. `watchChanges()` returns an **empty stream** (no
server push), which is why remote views rely on pull-to-refresh (§8).
`setProgress` **swallows** failures (e.g. a guest 401) so a best-effort write
never crashes the reader.

---

## 6. The reading pipeline

```
/read/:id ─► ReaderDispatcher ─► getComic(id) ─► (remote book? download to temp) ─► by extension:
                                                     cbz  ─► ComicReaderScreen
                                                     pdf  ─► PdfReaderScreen
                                                     epub ─► EpubReaderScreen
```

`ReaderDispatcher` (`features/reader/reader_dispatcher.dart`) loads the item
**fresh** (not from a cached provider) so the resume position is current, then:

- For a **remote book** (PDF/EPUB), it downloads the whole file to a temp path
  (`remote_<id>.<ext>`) via an atomic `.part`→rename, **cached** across opens, and
  sets `sourceUri` to it. (Remote *comics* stream page-by-page instead.)
- Switches on `extension` to the right reader.

All three readers share:
- **Reading mode** (`reader/comic/reading_mode.dart`): `scroll` / `single` /
  `doublePage`, persisted globally in `readingModeProvider`.
- **Shared chrome** (`reader/widgets/reader_widgets.dart`): `ReaderMessage`
  (error/empty state), `ReadingModeMenu`, and the comic/PDF `ReaderTopBar` /
  `ReaderBottomBar`.
- **Progress saving** via `activeSourceProvider.setProgress(...)`, writing an
  explicit `completed` bool so paging back from the end can *clear* it.

| Reader | Engine | Pages from | Notes |
| --- | --- | --- | --- |
| `ComicReaderScreen` | photo_view / positioned list | `ComicPageSource` | `LocalCbzPageSource` (archive bytes) or `RemotePageSource` (page URLs) |
| `PdfReaderScreen` | `pdfrx` | the file | custom page layout per reading mode; tap zones over the viewer |
| `EpubReaderScreen` | `flutter_epub_viewer` (epub.js/WebView) | the file | CFI-based resume; see §9 gotchas |

`ComicPageSource` (`reader/comic/comic_page_source.dart`) is the small
abstraction that lets the comic reader be source-agnostic about *where each page
image comes from* — local archive bytes vs authenticated remote URLs.

---

## 7. Connections & auth

`ConnectionsController` (in `providers.dart`) owns the saved servers and the
active selection, persisting the active id in prefs and the connections in the DB.

- `addAndConnect(name, url, {username, password})` — reuses an existing row if the
  URL is already saved (the `base_url` is UNIQUE), optionally logs in, and — when
  credentials are supplied — requires a **real** authenticated session
  (`RemoteSource.isLoggedIn`), not a silent guest fallback.
- `login(connId, ...)` re-authenticates an existing connection.
- `removeConnection(id)` forgets a server (falling back to local if it was active).

**Session state** is classified by `RemoteSource.sessionState()` →
`authenticated` / `guest` / `unauthenticated` / `offline`, exposed via
`sessionStatusProvider`. The `ConnectionSwitcher`
(`features/connections/connection_switcher.dart`) is the UI for all of this:
switch sources, **Add server**, **Sign in** (when guest), and **Manage servers**
(remove). When the active session is a *guest*, the switcher shows an amber
"· Guest" badge — important because the server **401s guest writes**, so progress
silently wouldn't save otherwise.

---

## 8. Reactivity & refresh

Two refresh paths, by source:

- **Local** is push-based: Drift table notifications → `watchChanges()` →
  `libraryChangesProvider` ticks → the catalog `FutureProvider`s re-run.
- **Remote** has no change stream, so the UI offers **pull-to-refresh** on every
  tab and detail grid. The gesture calls `invalidateLibraryProviders(ref)`, which
  invalidates the catalog providers **and** evicts the painting image cache
  (covers are `NetworkImage`s keyed by URL; a server rebuild can reissue the same
  id/URL with new bytes, which would otherwise be served stale).

The **Continue Reading** shelf is the active source's `continueReading()` minus a
client-side dismissal set (`dismissedContinueProvider`): clearing the shelf
records each item's position fingerprint and hides it until the position changes
(reading further brings it back). It never touches saved progress.

---

## 9. Cross-cutting concerns & gotchas

- **Relative storage paths** (`data/local_files.dart`): iOS data-container UUIDs
  change on reinstall, so library files are stored as paths **relative** to
  `getApplicationSupportDirectory()` and resolved at runtime; imports are copied
  in so the app owns them.
- **macOS EPUB workaround** (`epub/epub_reader_screen.dart`): on macOS WKWebView
  blocks epub.js's sibling-dir `<script>` sub-resources, so the reader injects
  the libs from bundled assets and drives the package's loader itself. iOS loads
  them natively.
- **EPUB resume is CFI-based and finicky.** epub.js reports `progress` as 0 until
  its locations index is generated, so progress writes are gated on an
  `onLocationLoaded` flag; a teardown/Back relocate is ignored (it fires at the
  book start and would clobber the saved position); and a **watchdog** falls back
  to page 1 if a stale/invalid CFI never produces a relocate (which otherwise
  shows a black page). Mode changes remount the viewer (the package's live
  flow/spread setters are broken) and resume from the current CFI.
- **Guest writes 401.** This is by design on the server; the client surfaces it
  (guest badge + sign-in) and never crashes on it.

---

## 10. Testing

`flutter test` runs unit + light integration tests. The key piece is
**`test/support/fake_cb8_server.dart`** — an in-process `HttpServer` faithful to
the CB8 contract that, crucially, **401s guest progress writes like the real
server**. With it:

- `test/remote_source_test.dart` covers session classification, guest vs real
  login, the guest-write 401 that must not throw, and authenticated progress
  round-tripping.
- `test/connections_controller_test.dart` covers `addAndConnect`: guest connect,
  real-credential auth, rejection of wrong/guest-only credentials, and re-adding
  an existing URL reusing the row (no UNIQUE crash). It uses an in-memory
  `AppDatabase.forTesting(NativeDatabase.memory())` and a `ProviderContainer`.

Other tests cover the import helpers (`series_parser`, `cbz_import`,
`library_query`).

---

## 11. Relationship to the CB8 server

The remote source speaks the original CB8 server's REST API verbatim (same
routes, camelCase fields, better-auth session cookie). That server is a separate
project (Postgres-backed Fastify + a React SPA). This app keeps its **own**
on-device SQLite for local mode; only the *server* uses Postgres. Treat the
server's `routes/*` + `mapping.ts` as the contract when changing `RemoteSource`.
```
