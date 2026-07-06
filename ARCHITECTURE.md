# CB8 Flutter — Architecture

A cross-platform (iOS / Android / macOS) comic & e-book reader. It is a ground-up
Flutter rewrite of the original Electron **CB8** app, and it is **hybrid**: the
same UI reads from either an **on-device library** (SQLite + local files) or a
**remote CB8 server** (the original app's REST API), chosen at runtime.

The guiding idea: **the UI never knows where content comes from.** Everything goes
through one `LibrarySource` interface, and a single Riverpod provider decides
which implementation is live.

**How to read this document.** If you're new to the codebase, read §3–§6 in
order — bootstrap → state → data → reading — then skim the rest. Each section
names the file(s) it describes, so keep the code open beside it. §12 is a
"where do I look" cheat sheet for common tasks. Riverpod terms used throughout:
a *provider* is a lazily-created, cached value other code can `watch` (rebuild
when it changes) or `read` (grab once); a `FutureProvider` caches an async
fetch; a `.family` is a provider parameterized by an argument (one instance per
distinct argument).

---

## 1. Tech stack

| Concern | Choice |
| --- | --- |
| UI / framework | Flutter (Material 3, dark-only) |
| State management | Riverpod (`flutter_riverpod`) |
| Routing | `go_router` |
| On-device DB | Drift (`drift` / `drift_flutter`) over SQLite |
| Remote HTTP | `dio` + `dio_cookie_manager` + `cookie_jar` |
| PDF rendering | `pdfrx` (native, vector) |
| EPUB rendering | `flutter_readium` (Readium toolkit — native navigator, iOS/Android) |
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
      comic_metadata.dart       editable metadata for the local library
      connection.dart           a saved server connection
      groups.dart               TagCount / LibraryInfo / SeriesGroup / DuplicateGroup
    sources/
      library_source.dart       LibrarySource interface + LibraryQuery + enums
      local_source.dart         on-device implementation (Drift + files)
      remote_source.dart        CB8 REST implementation (dio + cookies)
    repositories/providers.dart THE provider hub (see §4)

  features/
    shell/app_shell.dart        adaptive nav (rail/bottom bar) + top bar
    connections/                ConnectionSwitcher: segmented source control +
                                add/sign-in/manage servers
    library/
      home_screen.dart          Home tab: hero resume card + shelves
      browse_screen.dart        Browse tab: All / Tags / Recent pivots
      library_screen.dart       the full catalog grid (Browse's All pivot)
      recent_screen.dart        recently-read grid (Browse's Recent pivot)
      duplicates_screen.dart    duplicate detection (local library)
      metadata_edit_screen.dart edit title/series/etc. (local library)
      widgets/                  ComicCard, ComicCover, action sheet, grids
    organize/                   Collections and Series tabs, Tags pivot
    reader/
      reader_dispatcher.dart    routes a catalog item to the right reader
      reader_keyboard.dart      desktop keyboard shortcuts wrapper
      progress_saver.dart       debounced progress writes (see §6)
      unified_reader_screen.dart  the Readium EPUB reader
      comic/                    CBZ/remote image reader + page sources
      pdf/                      pdfrx reader
      widgets/                  shared reader chrome
    import/                     file import, media probing, embedded metadata,
                                series parsing, watched folders, samples
    settings/                   accent, import actions, watched-folders screen

test/                          unit/integration tests + an in-process fake server
```

---

## 3. Bootstrap & app shell

`main()` (`lib/main.dart`):

1. `WidgetsFlutterBinding.ensureInitialized()` + `pdfrxFlutterInitialize()`.
2. Loads `SharedPreferences` and the app-support directory **concurrently**
   (both are platform-channel round trips; a record `.wait` keeps startup flat).
3. Builds a **persistent** `PersistCookieJar` under the app-support dir so server
   sessions survive restarts.
4. Runs `ProviderScope` with overrides injecting those singletons:
   `sharedPreferencesProvider`, `sharedPrefsProvider` (theme), `cookieJarProvider`.

`Cb8App` (`lib/app.dart`) is a `MaterialApp.router` — dark theme from
`themeDataProvider`, routed by `appRouter`.

**Routing** (`core/router/app_router.dart`): just two routes — `/` → `AppShell`,
and `/read/:id` → `ReaderDispatcher`. Everything else is tab state inside the
shell, not routes.

**AppShell** (`features/shell/app_shell.dart`) is the chrome. Four destinations —
**Home, Browse, Collections, Series** — shown as a `NavigationRail` on wide
layouts (≥768 px) and a bottom `NavigationBar` on phones:

- **Home** (`library/home_screen.dart`) answers "what was I reading?": a hero
  resume card for the current book, an up-next row for other in-progress items,
  then Want-to-read and Recently-added shelves.
- **Browse** (`library/browse_screen.dart`) is the whole catalog behind pivot
  chips: **All** (filterable grid), **Tags**, **Recent**.
- **Collections** and **Series** (`organize/`) are grids of groups; tapping one
  pushes a `BrowseGridScreen` scoped to that group.

The top bar holds the search field (typing a query auto-switches to Browse so
results are visible), the `ConnectionSwitcher` (§7), an import button with
progress spinner, and Settings. On macOS the shell also installs a native
`PlatformMenuBar`, and desktop builds accept drag-and-drop file imports.

---

## 4. State management — the provider graph

Almost all wiring lives in **`data/repositories/providers.dart`**. Riverpod is
used as the dependency-injection + reactive-cache layer: screens `watch`
providers, providers watch each other, and invalidating one re-runs everything
downstream of it.

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
                                                  ├── libraryChangesProvider  (Stream<int> tick, throttled)
                                                  │        │
                                                  │   comicsListProvider, continueReadingProvider,
                                                  │   wantToReadProvider, browseComicsProvider(query),
                                                  │   tagsProvider, librariesProvider, seriesProvider,
                                                  │   duplicatesProvider
                                                  │        (FutureProviders — re-run on each tick)
                                                  │
                                                  └── sessionStatusProvider   (guest vs authed)

libraryQueryProvider        search / filters / sort state for the All grid
localCoverProvider(id)      per-comic cover bytes (30s keep-alive window)
dismissedContinueProvider   ids cleared from the Continue Reading shelf
readingModeProvider         scroll / single / double (persisted)
accentThemeProvider ──► themeDataProvider
importControllerProvider    import progress + actions
watchedFoldersProvider      auto-ingest folders (+ desktop live watching)
```

Key players, and the reasoning behind them:

- **`activeSourceProvider`** is *the* seam. It returns `localSourceProvider` when
  the active connection is `local`, otherwise `remoteSourceProvider(active)`.
  Every screen reads the catalog through this and never branches on source type —
  that's the golden rule from `AGENTS.md`.
- **`libraryChangesProvider`** is a `StreamProvider<int>` that emits an
  increasing tick whenever the active source's catalog changes; the catalog
  `FutureProvider`s watch it, so the UI auto-refreshes (§8). Two subtleties:
  the value must be *distinct* each event or Riverpod dedupes it, and the stream
  is **throttled (400 ms, leading + trailing)** because Drift emits one event per
  statement — without the throttle, a bulk import of N files would refetch the
  whole catalog N times.
- **`browseComicsProvider`** is a `.family` keyed by `LibraryQuery`. Families
  cache per *distinct* key, which is why `LibraryQuery` implements value
  equality (`==`/`hashCode`) — with identity equality, every navigation that
  built an equal-but-new query would create (and permanently cache) a fresh
  provider instance.
- **`localCoverProvider`** keeps cover bytes alive for 30 s after the last card
  stops watching (keep-alive + timer). Pure `autoDispose` dropped bytes the
  moment a card scrolled off-screen, so grid scrolling thrashed SQLite and the
  image decoder.
- **`remoteSourceProvider`** is a `.family` keyed by `Connection`; all instances
  share the one `cookieJar`, so a login on one is seen by all.

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
`setProgress()`, `setFavorite()`, tags, collections, series, want-to-read,
duplicates, metadata editing, plus `id`/`name`. Capabilities the server has no
routes for (metadata editing, deletion, want-to-read, duplicates) are gated by
`supportsLibraryManagement` — `true` for local, `false` for remote — so the UI
shows those affordances only where they work.

`LibraryQuery` carries search/filter/sort/paging. Its `copyWith` uses a `_keep`
sentinel so nullable facets (e.g. mediaType) can be **cleared**, not just set.
It has value equality because it keys a provider family (§4).

**`ComicSummary`** (`data/models/comic_summary.dart`) is the single
source-agnostic row the UI renders. Both sources map into it. Notable fields:

- `coverThumbnail` (local inline bytes) **xor** `coverUrl` (remote endpoint) —
  a row has one or the other, never both.
- Reading position, by format: `lastPage` (paged formats), `lastLocation`
  (EPUB — a serialized Readium Locator), `lastPercent` (whole-book 0–100 for
  reflowable formats, where "page" is meaningless). The `progress` getter picks
  the right one for the card progress bar.
- `sourceUri` — local file path, or a downloaded temp path for remote books.
- `imageHeaders` — the auth cookie for remote image requests.
- `copyWith` only overrides `sourceUri` (used after a remote download) and
  preserves everything else — don't "fix" that; it's deliberate.

### LocalSource

Drift queries over the on-device SQLite DB. The schema
(`data/db/database.dart`, currently **v5**) mirrors CB8's tables trimmed to the
single-user case: `comics`, `bookmarks`, `readingHistory`, `favorites`,
`libraries`+`libraryComics`, `folders`+`folderComics`, `tags`+`comicTags`,
`wantToRead`, `watchedFolders`, and `connections`. Two things worth knowing:

- **Foreign keys are enabled in `beforeOpen`** (`PRAGMA foreign_keys = ON`) —
  SQLite defaults them off, and every `onDelete: cascade` in the schema depends
  on it. The v4 migration also swept orphan rows left by earlier versions.
- List queries deliberately **skip the cover BLOB column** so scrolling a
  5,000-row library doesn't drag megabytes through every query; covers load
  lazily per-card via `localCoverProvider`.

`watchChanges()` is backed by real Drift table-update notifications, so local
edits refresh the UI instantly. `setProgress` writes `lastPage`, `lastLocation`,
`lastPercent`, `completed`, and `lastRead`, and appends a `readingHistory` row.
(`lastPercent` is the whole-book percent for EPUBs; the v5 migration backfilled
it from already-stored Locators via SQLite's `json_extract`.)

### RemoteSource

A `dio` client against a CB8 server. Endpoints + field names mirror the server's
`routes/*` + `mapping.ts`: `/api/comics` (list, `{records,totalCount}`),
`/api/comics/:id` (detail; 404 maps to `null` per the interface contract),
`/api/comics/:id/pages/:n` (comic page images), `/api/comics/:id/file`
(whole-file book download), `/api/comics/:id/progress` (PUT), `/api/auth/*`.
A shared `CookieManager`/`CookieJar` carries the better-auth session cookie.
`watchChanges()` returns an **empty stream** (no server push), which is why
remote views rely on pull-to-refresh (§8). `setProgress` **swallows** failures
(e.g. a guest 401) so a best-effort write never crashes the reader — that's the
documented contract, not a bug.

Remote items can also be **downloaded into the local library** for offline
reading (per item, or bulk per collection/folder/tag) from the long-press action
sheet; downloads run sequentially and land as normal local rows.

---

## 6. The reading pipeline

```
/read/:id ─► ReaderDispatcher ─► getComic(id) ─► (remote book? download to temp) ─► by extension:
                                                     cbz/cbt ─► ComicReaderScreen
                                                     pdf     ─► PdfReaderScreen
                                                     epub    ─► UnifiedReaderScreen (Readium)
```

`ReaderDispatcher` (`features/reader/reader_dispatcher.dart`) loads the item
**fresh** (not from a cached provider) so the resume position is current, then:

- For a **remote book** (PDF/EPUB), it downloads the whole file to a temp path
  (`remote_<id>.<ext>`) via an atomic `.part`→rename, **cached** across opens,
  and sets `sourceUri` to it. (Remote *comics* stream page-by-page instead.)
- Switches on `extension` to the right reader.

All readers share:

- **Reading mode** (`reader/comic/reading_mode.dart`): `scroll` / `single` /
  `doublePage`, persisted globally in `readingModeProvider`. The EPUB reader
  offers only the paginated modes (see §9).
- **Shared chrome** (`reader/widgets/reader_widgets.dart`): `ReaderMessage`
  (error/empty state), `ReadingModeMenu`, and the comic/PDF `ReaderTopBar` /
  `ReaderBottomBar`.
- **Debounced progress saving** (`reader/progress_saver.dart`): page turns and
  Readium locator events arrive fast, and each save is a DB write that also
  ticks the catalog providers — so saves go through an 800 ms trailing debounce
  with a `flush()` on dispose (the final position always lands). Saves write an
  explicit `completed` bool so paging back from the end can *clear* it.
- **Keyboard shortcuts** (`reader_keyboard.dart`) on desktop — arrows/space
  page, `f` fullscreen, Escape backs out. It's a process-global handler, so it
  deliberately ignores keys while a text field has focus.

| Reader | Engine | Pages from | Notes |
| --- | --- | --- | --- |
| `ComicReaderScreen` | photo_view / positioned list | `ComicPageSource` | `LocalCbzPageSource` (archive bytes) or `RemotePageSource` (page URLs); precaches ±1 page so turns paint instantly |
| `PdfReaderScreen` | `pdfrx` | the file | custom page layout per reading mode; tap zones over the viewer |
| `UnifiedReaderScreen` | `flutter_readium` (Readium navigator) | the file | EPUBs only (despite the name); Locator-based resume; ToC, search, TTS; per-chapter scrubber with a whole-book "Ch 7/38 · 42%" label (see §9) |

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
(`features/connections/connection_switcher.dart`) is the UI for all of this. On
wide layouts it renders as an **always-visible segmented control** ("This
device" | each server, with an overflow menu for sign-in / manage / add) so you
always know which library you're looking at; phones and 3+-server setups fall
back to a compact popup. When the active session is a *guest*, it shows an amber
"· Guest" badge — important because the server **401s guest writes**, so progress
silently wouldn't save otherwise.

---

## 8. Reactivity & refresh

Two refresh paths, by source:

- **Local** is push-based: Drift table notifications → `watchChanges()` →
  `libraryChangesProvider` ticks (throttled, §4) → the catalog `FutureProvider`s
  re-run.
- **Remote** has no change stream, so the UI offers **pull-to-refresh** on every
  tab and detail grid. The gesture calls `invalidateLibraryProviders(ref)`, which
  invalidates the catalog providers **and** evicts the painting image cache
  (covers are `NetworkImage`s keyed by URL; a server rebuild can reissue the same
  id/URL with new bytes, which would otherwise be served stale).

The **Continue Reading** shelf is the active source's `continueReading()` minus a
client-side dismissal set (`dismissedContinueProvider`): clearing the shelf
records each item's position fingerprint and hides it until the position changes
(reading further brings it back). It never touches saved progress.

**Watched folders** (`features/import/watched_folders.dart`) auto-ingest
external directories *in place* (files are referenced by absolute path, not
copied). Every platform rescans on launch and on demand; desktop additionally
live-watches while the app runs (create/modify/move events, debounced so a file
still being copied isn't probed until writes settle).

---

## 9. Cross-cutting concerns & gotchas

- **Relative storage paths** (`data/local_files.dart`): iOS data-container UUIDs
  change on reinstall, so imported library files are stored as paths **relative**
  to `getApplicationSupportDirectory()` and resolved at runtime; imports are
  copied in so the app owns them. (Watched folders are the documented exception —
  they reference external files by absolute path.)
- **EPUB is Readium-based and mobile-only**
  (`reader/unified_reader_screen.dart`). The reader uses `flutter_readium` (the
  Readium toolkit's native navigator) on iOS/Android — there is no macOS build of
  it, so macOS is dropped for EPUB. Details a junior dev will eventually trip on:
  - Reading position is a Readium **Locator**, serialized into `lastLocation`;
    legacy epub.js CFIs don't parse as Locators, so a book opened for the first
    time after the engine switch resets to the start.
  - **Paginated-only** (single / two-column): Readium's scroll mode only scrolls
    within one chapter, so it isn't offered (see `later.md`).
  - Progress numbers: `locations.progression` is position **within the current
    chapter** (it drives the scrubber, because Readium's `goToProgression` can
    only seek within the current resource); `locations.totalProgression` is
    position in the **whole book** (it drives the "Ch 7/38 · 42%" label and the
    `completed` flag). Don't mix them up — it's the difference between "89% of
    chapter 1" and "2% of the book".
  - The navigator paginates for the platform view's bounds at load time, so the
    reader re-navigates to the current Locator once after the view settles, to
    re-paginate at the real size.
  - Building it requires Flutter's Swift Package Manager **disabled** (CocoaPods
    links the Readium pods), iOS 15+, and Android core-library desugaring
    (`desugar_jdk_libs` 2.1.5+).
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
  an existing URL reusing the row (no UNIQUE crash).
- `test/local_source_management_test.dart` covers the local-only management
  surface: metadata editing, want-to-read, duplicate detection, deletion, and
  locator-only EPUB progress.

Local-DB tests use `AppDatabase.forTesting(NativeDatabase.memory())` and a
`ProviderContainer`. Other tests cover the import helpers (`series_parser`,
`cbz_import`, `embedded_metadata`, `library_query`).

---

## 11. Relationship to the CB8 server

The remote source speaks the original CB8 server's REST API verbatim (same
routes, camelCase fields, better-auth session cookie). That server is a separate
project living under `webui/` in this repo (Postgres-backed Fastify + a React
SPA). This app keeps its **own** on-device SQLite for local mode; only the
*server* uses Postgres. Treat the server's `routes/*` + `mapping.ts` as the
contract when changing `RemoteSource`.

---

## 12. Where do I look? (common tasks)

| I want to… | Start at |
| --- | --- |
| Add a catalog capability (both sources) | `data/sources/library_source.dart`, then implement in `local_source.dart` **and** `remote_source.dart` |
| Add/change a provider | `data/repositories/providers.dart` — follow the existing patterns |
| Change the card look | `features/library/widgets/comic_card.dart` (+ `comic_cover.dart`) |
| Change the Home tab | `features/library/home_screen.dart` |
| Add a Browse pivot | `features/library/browse_screen.dart` (`_Pivot` enum + switch) |
| Add a nav destination | `features/shell/app_shell.dart` (`_destinations`) |
| Touch reading progress | `reader/progress_saver.dart` + each reader's save call; read §6 first |
| Change EPUB behavior | `reader/unified_reader_screen.dart`; read §9 first |
| Change the DB schema | `data/db/database.dart` → bump `schemaVersion`, add migration, run `dart run build_runner build --delete-conflicting-outputs` |
| Add an import path | `features/import/` (`import_controller.dart`, `media_probe.dart`) |
| Test against a "server" without a server | `test/support/fake_cb8_server.dart` |
