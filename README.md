# CB8

A fast, cross-platform **comic & ebook reader** for **CBZ, PDF, and EPUB**, built with Flutter.
Mobile-first, with a polished desktop experience and an optional *hybrid* mode that pairs with a
self-hosted CB8 server.

<p align="center">
  <img src="assets/icon/cb8_icon.png" width="180" alt="CB8 app icon">
</p>

This README is deliberately educational: besides describing the app, it contains a
[from-zero primer on how Flutter apps work](#how-flutter-apps-work--a-primer) and a
[guided tour of every file and directory in the repository](#repository-tour--what-every-file-does),
using CB8's own code as the running example. For the deep design (provider graph, reading
pipeline, platform gotchas) see [`ARCHITECTURE.md`](ARCHITECTURE.md); for agent/contributor
operational notes see [`AGENTS.md`](AGENTS.md); for a feature checklist measured against
other readers see [`FEATURES.md`](FEATURES.md).

---

## Table of contents

1. [What CB8 is](#what-cb8-is)
2. [Screenshots](#screenshots)
3. [Tech stack](#tech-stack)
4. [Getting started](#getting-started)
5. [How Flutter apps work — a primer](#how-flutter-apps-work--a-primer)
6. [Repository tour — what every file does](#repository-tour--what-every-file-does)
7. [The hybrid architecture in one picture](#the-hybrid-architecture-in-one-picture)
8. [The server (`webui/`)](#the-server-webui)
9. [Project status](#project-status)

---

## What CB8 is

CB8 is a single reader for the three formats people actually keep their reading in:
**CBZ/CBT** comic archives, **PDF** documents, and reflowable **EPUB** books. Instead of
juggling a comic app, a PDF viewer, and an ebook reader, you get one organized library —
covers, search, collections, series, tags — and one consistent reading experience on top
of all of it. It is a ground-up Flutter rewrite of the original Electron-based CB8 app,
designed mobile-first but equally at home on a desktop.

What makes CB8 unusual is that it's **hybrid**. You can keep your library entirely
on-device — files imported into the app, catalog stored in local SQLite, everything
offline — *or* point the app at a self-hosted CB8 server and browse and read your whole
remote library, with reading progress syncing back. The key design rule is that the UI
never knows or cares which one is live: every screen reads through a single
`LibrarySource` abstraction, and one Riverpod provider decides at runtime whether that's
the local database or a remote server. Switching between *This device* and a server is a
segmented control in the top bar.

### Feature highlights

- **Four-tab navigation** — **Home / Browse / Collections / Series**, rendered as a
  bottom navigation bar on phones and a sidebar rail with a denser grid on tablets and
  desktops (the switch happens at 768 px).
- **Home answers "what was I reading?"** — a hero resume card for the current book, an
  up-next row for other in-progress items, then Want-to-read and Recently-added shelves.
  The Continue Reading state updates live as you read and can be dismissed per item
  without touching saved progress.
- **Browse is the whole catalog** behind pivot chips — **All** (filterable, sortable
  cover grid with media-type filters), **Tags** (a chip cloud with counts), and
  **Recent** (everything opened, most recent first). Typing in the top-bar search
  auto-switches to Browse so results are always visible.
- **Collections & Series as first-class tabs** — user-created collections and
  auto-grouped series (parsed from filenames and embedded metadata), each a grid of
  cover-topped group cards.
- **Resume where you left off** — per-item progress is tracked and restored: page
  numbers for comics/PDFs, Readium Locators for EPUB, with a whole-book percentage for
  reflowable text. Saves are debounced so rapid page turns don't hammer the database.
- **Reading modes** — continuous scroll, single page, and two-page spread, with tap
  zones, swipe, and pinch-zoom; right-to-left (manga) direction and a
  first-page-as-cover offset for spreads. The chosen mode is remembered app-wide.
- **A real EPUB reader** — built on the **Readium toolkit** (native navigator on
  iOS/Android): table of contents, in-book search, **text-to-speech** with voice/rate
  /pitch controls, dictionary lookup on selection, dark/light/sepia themes, font
  choices, and a per-chapter scrubber with a whole-book "Ch 7/38 · 42%" label.
- **Hybrid / server mode** — read from *This device* (fully offline) or connect to a
  self-hosted CB8 server and browse + read remotely with progress sync. Guest browsing
  is supported, with a clear amber badge and one-tap sign-in when a server requires
  auth to save progress.
- **Downloads for offline** — save any server item into the on-device library, per item
  or in bulk for a whole collection / series / tag (cancellable, with progress).
- **Easy import** — file picker, desktop drag-and-drop, and **watched folders** that
  auto-ingest external directories in place (rescanned at launch, live-watched on
  desktop). Series info, `ComicInfo.xml`, and EPUB OPF metadata are parsed on the way in.
- **Library management** — in-app metadata editing with external scraping (Google
  Books / Open Library), duplicate detection with per-copy delete, favorites, and a
  Want-to-read shelf.
- **Desktop-native touches** — keyboard navigation and zoom shortcuts, a native macOS
  menu bar, fullscreen toggle, and immersive (system-bars-hidden) reading on mobile.

## Screenshots

### On your phone
Adaptive phone layout with a bottom nav bar, and the dark-themed EPUB reader.

<p align="center">
  <img src="screenshots/iphone-library.png" width="265" alt="Library on iPhone">
  &nbsp;&nbsp;&nbsp;
  <img src="screenshots/iphone-reader.png" width="265" alt="EPUB reader on iPhone">
</p>

### On a tablet
On a wide screen the app switches to a sidebar rail and a denser grid — iPad and Android tablet.

<p align="center">
  <img src="screenshots/ipad-library.png" width="88%" alt="CB8 library on iPad">
</p>
<p align="center">
  <img src="screenshots/android-tablet.png" width="88%" alt="CB8 library on an Android tablet">
</p>

### Hybrid / server mode
Point the app at a self-hosted **CB8 server** to browse and read your whole library remotely — progress syncs back.

<p align="center">
  <img src="screenshots/web-server.png" width="88%" alt="The CB8 web server">
</p>

### Native app icon
<p align="center">
  <img src="screenshots/iphone-home.png" width="265" alt="CB8 app icon on the iOS home screen">
</p>

## Tech stack

| Area | Library |
|---|---|
| State / DI | [Riverpod](https://riverpod.dev) (`flutter_riverpod`) |
| Navigation | [go_router](https://pub.dev/packages/go_router) |
| Local catalog | [Drift](https://drift.simonbinder.eu) + `sqlite3_flutter_libs` (SQLite) |
| PDF | [pdfrx](https://pub.dev/packages/pdfrx) (pdfium — native, vector) |
| CBZ / CBT | [photo_view](https://pub.dev/packages/photo_view) + `archive` + `scrollable_positioned_list` |
| EPUB | [flutter_readium](https://pub.dev/packages/flutter_readium) (the Readium toolkit's native navigator) |
| Networking | [dio](https://pub.dev/packages/dio) + `dio_cookie_manager` + `cookie_jar` |
| Import | `file_picker`, `desktop_drop` (desktop drag-and-drop), `archive`, `image` |
| Persistence | `shared_preferences` (settings), `path_provider` (storage dirs) |

## Getting started

### Prerequisites

- The **[Flutter SDK](https://docs.flutter.dev/get-started/install)** (this project pins
  Dart `^3.12` in `pubspec.yaml`; a current stable Flutter satisfies it). Run
  `flutter doctor` after installing — it tells you exactly which platform pieces are
  missing.
- Per platform you want to run on:
  - **iOS / macOS** — a Mac with **Xcode** and **CocoaPods** (`sudo gem install cocoapods`
    or `brew install cocoapods`).
  - **Android** — **Android Studio** (for the SDK + an emulator) or at minimum the
    Android SDK command-line tools; accept licenses with `flutter doctor --android-licenses`.
  - **macOS desktop** — Xcode again; enable with `flutter config --enable-macos-desktop`
    if it isn't already.

### Run it

```bash
flutter pub get                      # install dependencies (reads pubspec.yaml)
flutter run                          # pick a device/simulator when prompted
```

Two `--dart-define` flags make development much nicer (both handled in
`lib/features/shell/app_shell.dart`):

```bash
# Seed synthetic CBZ/PDF/EPUB samples on first run — explore the UI instantly
# on a fresh simulator, no sideloading:
flutter run --dart-define=SEED=true

# Auto-add a server connection on first run, so hybrid/server mode can be
# exercised without typing a URL into the UI every time:
flutter run --dart-define=MOCK_SERVER=http://localhost:8008
```

### Checks

```bash
flutter analyze                      # static analysis / lint — must be clean
flutter test                         # unit + light integration tests
```

The tests never need a real server: `test/support/fake_cb8_server.dart` is an in-process
HTTP server faithful to the CB8 REST contract (including the guest-write 401).

### EPUB (Readium) build requirements

The EPUB reader uses `flutter_readium`, which has three hard build requirements
(details in [`AGENTS.md`](AGENTS.md) and ARCHITECTURE §9):

- **Flutter's Swift Package Manager support must be disabled** — the Readium pods link
  via CocoaPods (`flutter config --no-enable-swift-package-manager`).
- **iOS 15+** deployment target.
- **Android core-library desugaring** with `desugar_jdk_libs` **2.1.5+** (already wired
  in `android/app/build.gradle.kts`).

EPUB reading is iOS/Android only — there is no macOS build of the Readium navigator.
Comics and PDFs work everywhere.

### Code generation (Drift)

The database layer is code-generated: `lib/data/db/database.dart` has a committed
`database.g.dart` companion. If you change the schema, regenerate it (and never
hand-edit `*.g.dart`):

```bash
dart run build_runner build --delete-conflicting-outputs
```

### API documentation

The Dart source uses `///` doc comments throughout. Generate the browsable HTML API
reference with `dart doc` (output in `doc/api/`, not checked in). Configuration lives in
[`dartdoc_options.yaml`](dartdoc_options.yaml), which fails the build on broken doc
references.

---

## How Flutter apps work — a primer

Never touched Flutter? This section is for you. Everything below is illustrated with
files from this repository, so you can open the code beside it.

### Everything is a widget

Flutter doesn't wrap native buttons and lists the way older cross-platform toolkits did.
Instead it ships its own rendering engine (Impeller/Skia) and draws every pixel itself,
and the entire UI is described as a tree of **widgets**. A widget is a small, **immutable**
Dart object that says *what* a piece of UI should look like right now — "a column
containing a cover image and a title", "16 px of padding around this child" — not a
long-lived view object you mutate. Layout, padding, themes, gesture detection, even the
app itself are all widgets that nest inside each other.

Open [`lib/main.dart`](lib/main.dart) and you'll see the whole bootstrap in ~40 lines:
`main()` initializes a few platform services (shared preferences, the app-support
directory, a persistent cookie jar), then calls `runApp(...)` with the root widget. That
root is a `ProviderScope` (Riverpod's dependency-injection container — more below)
wrapping `Cb8App`. In [`lib/app.dart`](lib/app.dart), `Cb8App` is a `MaterialApp.router`
— the widget that sets up theming, localization, and routing for everything beneath it.
From there it's widgets all the way down: `AppShell` → `NavigationBar`/`NavigationRail`
→ screens → grids → cards → images and text.

### The three trees (one paragraph, promise)

Because widgets are immutable and rebuilt constantly, Flutter keeps two longer-lived
trees behind the scenes. Every widget gets an **element** — the mutable node that
remembers where the widget sits in the tree and holds any state — and most elements get
a **render object**, the thing that actually measures, lays out, and paints. When your
code rebuilds and returns a *new* widget of the same type in the same place, Flutter
doesn't throw the old UI away; it **diffs** the new widget against the element tree and
mutates only the render objects whose configuration actually changed. That's why
"rebuild the whole description every frame" is cheap: the widgets are lightweight
throwaway descriptions, and the expensive layout/paint machinery is reused underneath.

### Stateless, stateful — and Riverpod's `ConsumerWidget`

- A **`StatelessWidget`** is pure configuration: given its constructor parameters, it
  always builds the same thing. CB8's `Cb8App` (`lib/app.dart`) is one — it has nothing
  to remember.
- A **`StatefulWidget`** pairs the immutable widget with a mutable **`State`** object
  that survives rebuilds. Calling `setState(() { ... })` mutates that state and asks the
  framework to rebuild. `AppShell` (`lib/features/shell/app_shell.dart`) keeps the
  selected tab index this way (`int _index`), plus a drag-hover flag for desktop
  drag-and-drop import.
- Most CB8 screens are a third kind: Riverpod's **`ConsumerWidget`** (or
  `ConsumerStatefulWidget`). Riverpod is a state-management/DI library built around
  **providers** — lazily-created, cached values that widgets can *watch*. A
  `ConsumerWidget`'s `build()` receives a `ref`, and `ref.watch(someProvider)`
  simultaneously *reads* the value and *subscribes* the widget to it: when the provider's
  value changes, exactly the widgets watching it rebuild. Open
  `lib/features/library/home_screen.dart` and you'll see the Home tab watching providers
  like `continueReadingProvider`; nearly all the providers themselves are defined in one
  hub, [`lib/data/repositories/providers.dart`](lib/data/repositories/providers.dart)
  (ARCHITECTURE §4 draws the whole graph).

### `build()` and rebuilds

Every widget has a `build()` method that returns the widget subtree beneath it. The
framework calls it whenever the widget first appears and whenever its inputs change —
`setState`, a watched provider updating, an inherited value like the theme or screen
size changing. The contract: `build()` must be a fast, side-effect-free description.
`AppShell.build()` is a nice example of *responsive* building: it reads
`MediaQuery.sizeOf(context).width` and returns a `NavigationRail` layout when the window
is ≥ 768 px wide and a bottom `NavigationBar` otherwise — same widget, two layouts,
re-evaluated automatically whenever the window resizes.

### Hot reload vs hot restart

This is Flutter's signature trick. With the app running from `flutter run`:

- **Hot reload** (press `r`) injects your changed Dart source into the running VM and
  rebuilds the widget tree **without losing state**. Change the default accent color in
  `lib/core/theme/app_theme.dart`, hit `r`, and the running app re-themes while staying
  on the same screen, same scroll position, same open book.
- **Hot restart** (press `R`) restarts the Dart program from `main()` — fast, but all
  in-memory state resets. You need it for changes hot reload can't apply: `main()`
  itself, global initializers, enum changes, and so on.
- Neither touches native code. If you change anything under `android/`, `ios/`, or
  `macos/` (or add a plugin with native code), you do a full stop-and-rerun.

### `pubspec.yaml` — dependencies and assets

[`pubspec.yaml`](pubspec.yaml) is the project manifest, like `package.json` for Node.
For CB8 it declares:

- **`dependencies:`** — runtime packages from [pub.dev](https://pub.dev): `flutter_riverpod`,
  `go_router`, `drift`, `dio`, `pdfrx`, `flutter_readium`, etc. `flutter pub get`
  resolves them and writes the exact pinned versions into `pubspec.lock` (committed, so
  every machine builds against identical versions).
- **`dev_dependencies:`** — build-time-only tools: `flutter_test`, `flutter_lints`,
  `build_runner` + `drift_dev` (code generation), `flutter_launcher_icons`.
- **`flutter:`** — Flutter-specific config; asset files would be listed here to be
  bundled into the app. CB8 also carries tool config blocks for the launcher-icon and
  splash-screen generators (with a comment explaining why the splash *package* is
  deliberately not a dependency).

### One Dart codebase, per-platform shells

There is one `lib/` of Dart, but a Flutter app ships as a genuinely native app on each
platform. Each platform directory is a small native project — the **"runner"** — whose
only job is to boot the Flutter engine and hand it your Dart code:

- **`android/`** is a Gradle project. `android/app/build.gradle.kts` sets the
  application id, SDK versions, signing, and (for CB8) the core-library desugaring the
  Readium package needs. `flutter build apk` drives Gradle for you.
- **`ios/`** and **`macos/`** are Xcode projects, each with a `Runner` target (a stub
  `AppDelegate`/`MainFlutterWindow` that embeds a `FlutterViewController`) and a
  `Podfile`, because plugins' native halves are linked via CocoaPods.
- **`linux/`** and **`windows/`** are CMake runners; **`web/`** holds the static shell
  (`index.html`, manifest, icons). In CB8 these three are generated scaffolds — present
  and buildable, but not first-class targets yet.

When Dart needs something only the OS provides, it crosses a **platform channel**: a
named message pipe between Dart and native code. CB8 has a hand-rolled one you can read
end-to-end in two small files — `lib/core/window_control.dart` sends messages on
`MethodChannel('cb8/window')`, and `macos/Runner/MainFlutterWindow.swift` implements the
native side (fullscreen toggling, window frame persistence). **Plugins** are the same
mechanism, packaged: when `pubspec.yaml` pulls in `path_provider` or `pdfrx`, `flutter
pub get` registers their native halves into each runner project automatically. That's
why a plugin change requires a full rebuild — there's real Swift/Kotlin/C++ being
compiled into the runner.

### Debug vs release, and where the app actually lands

- **Debug** builds (`flutter run`) run Dart in a JIT VM — that's what makes hot reload
  possible — with assertions on. They are noticeably slower than release; never judge
  performance on a debug build.
- **Release** builds (`flutter build ...`) compile Dart **ahead-of-time to native machine
  code**, tree-shake unused code and icons, and strip debug machinery.

Artifacts land under `build/`, which is generated output and git-ignored:

| Command | Artifact |
|---|---|
| `flutter build apk` | `build/app/outputs/flutter-apk/app-release.apk` |
| `flutter build ios` | `build/ios/iphoneos/Runner.app` (archive/sign via Xcode for distribution) |
| `flutter build macos` | `build/macos/Build/Products/Release/cb8_flutter.app` |

---

## Repository tour — what every file does

### Root

| Path | What it is |
|---|---|
| [`pubspec.yaml`](pubspec.yaml) | The project manifest — dependencies, dev tools, asset/icon/splash config (see the primer above). |
| `pubspec.lock` | Exact resolved versions of every package; committed for reproducible builds. |
| [`analysis_options.yaml`](analysis_options.yaml) | Lint/analyzer config — enables `package:flutter_lints`; `flutter analyze` must stay clean. |
| [`dartdoc_options.yaml`](dartdoc_options.yaml) | `dart doc` config; treats unresolved doc references and broken links as build failures. |
| `.metadata` | Flutter-tool bookkeeping (which Flutter revision created/migrated the project). Don't edit. |
| `lib/` | **All the app's Dart code** — toured file-by-file below. |
| `test/` | Unit + light integration tests, plus the in-process fake CB8 server. |
| `android/`, `ios/`, `macos/` | The native runner projects for the supported platforms (Gradle project; two Xcode projects with CocoaPods). |
| `linux/`, `windows/`, `web/` | Generated platform scaffolds — buildable but not first-class targets yet. |
| `assets/` | Source art for the app icon and splash (`assets/icon/`). |
| `screenshots/` | The images embedded in this README. |
| `webui/` | **The CB8 server** — a separate React + Fastify project ([below](#the-server-webui)). |
| `dev/` | Working planning docs for the rewrite (`requirements.md`, `tasks.md`, `changelog.md`). |
| `.github/` | CI — a workflow that publishes docs to the GitHub wiki. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | **The design doc** — provider graph, source abstraction, reading pipeline, gotchas. Read §3–§6 in order if you're new. |
| [`AGENTS.md`](AGENTS.md) | Operational guide for AI coding agents (and a good contributor quick-start): build/test commands, conventions, hard-won gotchas. |
| [`FEATURES.md`](FEATURES.md) | Feature checklist measured against Kavita / Komga / Calibre-Web / Mihon — what's done, partial, or missing. |
| `bugs.md`, `perf.md`, `later.md`, `tasks.md`, `todo.md` | Working notes: known bugs, performance investigations, deliberately-deferred ideas, task scratchpads, and the remaining-work list. |

### `lib/` — the app, file by file

Two files sit at the top:

| File | What it does |
|---|---|
| `main.dart` | Bootstrap. Initializes pdfrx, loads `SharedPreferences` + the app-support dir concurrently, builds a persistent cookie jar (server sessions survive restarts), then runs the app inside a `ProviderScope` with those singletons injected as provider overrides. |
| `app.dart` | `Cb8App` — the root `MaterialApp.router`: dark theme from `themeDataProvider`, routes from `appRouter`. |

#### `lib/core/` — cross-cutting plumbing

| File | What it does |
|---|---|
| `router/app_router.dart` | The `go_router` config. Just **two routes**: `/` → `AppShell` and `/read/:id` → `ReaderDispatcher`. Everything else is tab state inside the shell, not URLs. |
| `theme/app_theme.dart` | The accent palette (red/blue/green/purple/…) ported from the original CB8's CSS themes, and the dark `ThemeData` built from the selected accent. |
| `theme/theme_controller.dart` | Riverpod side of theming: persists the chosen accent in `SharedPreferences`, exposes `accentThemeProvider` → `themeDataProvider`. |
| `immersive_reading.dart` | Mobile-only helpers to hide/show the system status/nav bars so a full-bleed reader is truly edge-to-edge. No-ops on desktop. |
| `window_control.dart` | Thin `MethodChannel('cb8/window')` bridge to native desktop window control (fullscreen toggle, frame persistence). Implemented natively in `macos/Runner/MainFlutterWindow.swift`; no-op elsewhere. |

#### `lib/data/` — the data layer

| File | What it does |
|---|---|
| `db/database.dart` | The Drift schema (currently v4) + `AppDatabase`, mirroring the CB8 server's tables trimmed to single-user: `comics`, `bookmarks`, `readingHistory`, `favorites`, `libraries`/`libraryComics`, `folders`/`folderComics`, `tags`/`comicTags`, `wantToRead`, `watchedFolders`, `connections`. Enables `PRAGMA foreign_keys` in `beforeOpen` — every cascade delete depends on it. |
| `db/database.g.dart` | Generated Drift companion (row/table/companion classes). Never hand-edit; regenerate with `build_runner`. |
| `local_files.dart` | App-owned storage. Files are stored under paths **relative** to the app-support directory and resolved at runtime, because iOS data-container UUIDs change on reinstall. |
| `models/comic_summary.dart` | **`ComicSummary`** — the one source-agnostic catalog row every screen renders. Both sources map into it. Holds the format-appropriate resume position (`lastPage` / `lastLocation` / `lastPercent`) and the cover as inline bytes *xor* a remote URL. |
| `models/comic_metadata.dart` | Editable/scrapeable bibliographic metadata (title, series, volume, people, genre, year, summary) for the local library. |
| `models/connection.dart` | A saved server: name + base URL. Auth cookies live in the cookie jar, not here. |
| `models/groups.dart` | Small value types for grouped views: `TagCount`, `LibraryInfo` (collections), `SeriesGroup`, `DuplicateGroup`. |
| `sources/library_source.dart` | **The seam of the whole app**: the `LibrarySource` interface (list/get/progress/favorites/tags/collections/series/…), plus `LibraryQuery` (search/filter/sort/paging, with value equality because it keys a provider family) and the shared enums. |
| `sources/local_source.dart` | `LibrarySource` over Drift + local files. Push-based: Drift table notifications refresh the UI instantly. List queries skip the cover BLOB column for scroll performance. |
| `sources/remote_source.dart` | `LibrarySource` over the CB8 server's REST API (dio + session cookie) — same routes and camelCase fields as the original app. No change stream (remote views pull-to-refresh); guest progress writes 401 by design and are swallowed, never crash the reader. |
| `repositories/providers.dart` | **THE Riverpod hub** — nearly all wiring lives here: `activeSourceProvider` (local vs remote), the catalog `FutureProvider`s, the throttled `libraryChangesProvider` tick, covers, connections + auth session state, reading mode, import controller, watched folders. ARCHITECTURE §4 diagrams it. |

#### `lib/features/` — the screens

**`shell/`**

| File | What it does |
|---|---|
| `app_shell.dart` | The chrome: four destinations (**Home, Browse, Collections, Series**) as a rail (wide) or bottom bar (narrow); top bar with search, the connection switcher, import button, and Settings; native macOS menu bar; desktop drag-and-drop import; and the `SEED=` / `MOCK_SERVER=` dev aids. |

**`connections/`**

| File | What it does |
|---|---|
| `connection_switcher.dart` | The local/server source switcher: an always-visible **segmented control** ("This device" \| each server) on wide layouts, a compact popup on phones; add-server and sign-in dialogs; the amber "· Guest" badge when the server would reject progress writes. |

**`library/`** — Home, Browse, and the catalog screens

| File | What it does |
|---|---|
| `home_screen.dart` | The Home tab: hero resume card, up-next row, Want-to-read and Recently-added shelves, plus a friendly empty state for a brand-new library. |
| `browse_screen.dart` | The Browse tab: pivot chips (**All / Tags / Recent**) over the corresponding views. |
| `library_screen.dart` | The full-catalog grid (Browse's *All* pivot): media-type filter row, sorting, and the responsive cover grid. |
| `recent_screen.dart` | Browse's *Recent* pivot — everything opened, most recent first. |
| `duplicates_screen.dart` | Duplicate finder (identical files or matching titles) with per-copy delete. Local library only. |
| `metadata_edit_screen.dart` | Full-screen metadata editor, including external scraping (Google Books / Open Library). Local library only. |
| `widgets/comic_card.dart` | A single library tile: cover, title, format badge, progress bar. |
| `widgets/comic_cover.dart` | Source-agnostic cover resolution: inline bytes → lazy local DB load → authenticated remote URL. |
| `widgets/library_grid.dart` | The responsive cover grid (2 columns on phones up to ~8 on very wide screens). |
| `widgets/browse_grid_screen.dart` | A titled grid for an arbitrary `LibraryQuery` — reused by the tag, collection, and series browsers. |
| `widgets/comic_action_sheet.dart` | The long-press sheet: favorite, want-to-read, tags, collections, download-to-device, edit, delete — gated by what the active source supports. |

**`organize/`** — grouped views

| File | What it does |
|---|---|
| `collections_screen.dart` | Collections tab — user-created named collections; create here, add items from a book's long-press menu. |
| `series_screen.dart` | Series tab — series auto-grouped from parsed metadata; a series opens its items ordered by volume then chapter. |
| `tags_screen.dart` | The Tags pivot (inside Browse) — a chip cloud of all tags with counts. |
| `widgets/group_card.dart` | Cover-topped card for a collection/series group. |
| `widgets/collection_item_picker.dart` | Full-screen picker for adding items to a collection; edits apply immediately. |

**`reader/`** — the reading pipeline (ARCHITECTURE §6)

| File | What it does |
|---|---|
| `reader_dispatcher.dart` | Entry point for `/read/:id`. Loads the item **fresh** (so the resume position is current), downloads remote books to a cached temp file (atomic `.part` → rename), then dispatches by extension: CBZ/CBT → comic reader, PDF → PDF reader, EPUB → unified reader. |
| `progress_saver.dart` | **Debounced progress writes** — page turns and Readium locator events arrive fast, so saves go through an 800 ms trailing debounce with a `flush()` on dispose (the final position always lands). |
| `reader_keyboard.dart` | Desktop keyboard shortcuts (arrows/space page, `f` fullscreen, Escape backs out); deliberately inert while a text field has focus. |
| `unified_reader_screen.dart` | **The EPUB reader** (Readium navigator; EPUBs only despite the name, iOS/Android only). Locator-based resume, ToC, in-book search, TTS (voice/rate/pitch), dictionary lookup, dark/light/sepia themes, font settings, per-chapter scrubber with the whole-book "Ch 7/38 · 42%" label. |
| `comic/comic_reader_screen.dart` | The CBZ reader: vertical scroll / single page / two-page spread, tap zones, pinch-zoom, RTL direction, ±1-page precache so turns paint instantly. |
| `comic/comic_page_source.dart` | The small abstraction that makes the comic reader source-agnostic about *pages*: local archive bytes vs authenticated remote page URLs. |
| `comic/cbz_archive.dart` | Reads image entries out of CBZ/CBT archives (natural-sort ordering, graceful handling of undecodable formats). |
| `comic/pdf_page_source.dart` | Renders PDF pages to images so PDFs can also flow through the comic reader's layouts when needed. |
| `comic/reading_mode.dart` | The `scroll` / `single` / `doublePage` enum + its globally-persisted provider. |
| `pdf/pdf_reader_screen.dart` | The PDF reader on pdfrx's native viewer — crisp vectors re-rasterized per zoom level, custom page layout per reading mode, tap zones. |
| `widgets/reader_widgets.dart` | Shared reader chrome: error/empty message, the reading-mode menu, top/bottom bars. |

**`import/`** — getting files in

| File | What it does |
|---|---|
| `import_controller.dart` | Orchestrates imports (file picker, drag-and-drop, samples) and server downloads (single + bulk, cancellable, with progress state the UI watches). |
| `media_probe.dart` | Probes a file into a catalog row: format detection, cover extraction, page count. |
| `embedded_metadata.dart` | Parses metadata from *inside* files at import: `ComicInfo.xml` (CBZ/CBT) and the EPUB OPF package document. |
| `series_parser.dart` | Extracts Series / Volume / Chapter from filenames (careful not to eat titles like "20th Century Boys"). |
| `metadata_scraper.dart` | Keyless external metadata search (Google Books / Open Library) for the metadata editor. |
| `watched_folders.dart` | Watched-folder controller: auto-ingests external directories **in place** (absolute paths, not copied — the documented exception), rescans at launch/on demand, live-watches on desktop with debounced FS events. |
| `sample_data.dart` | Generates synthetic CBZ/PDF/EPUB samples on disk (the `SEED=true` path). |

**`settings/`**

| File | What it does |
|---|---|
| `settings_screen.dart` | Settings: accent color, import actions, find-duplicates, watched folders entry point. |
| `watched_folders_screen.dart` | Manage watched folders: add, force-rescan, remove. |

#### `test/`

| File | What it does |
|---|---|
| `support/fake_cb8_server.dart` | An in-process `HttpServer` faithful to the CB8 REST contract — including the guest-write 401 — so remote tests never need a real server. |
| `remote_source_test.dart` | Session classification, guest vs real login, the guest 401 that must not throw, authenticated progress round-trips. |
| `connections_controller_test.dart` | `addAndConnect` behaviors: guest connect, credential auth, rejection of bad credentials, URL-dedup on re-add. |
| `local_source_management_test.dart` | The local-only management surface: metadata editing, want-to-read, duplicates, deletion, locator-only EPUB progress. |
| `cbz_import_test.dart`, `embedded_metadata_test.dart`, `series_parser_test.dart`, `library_query_test.dart` | The import helpers and query value-semantics. |

---

## The hybrid architecture in one picture

```
                        ┌────────────────────────────┐
   every screen ──────► │  LibrarySource (interface)  │ ◄── activeSourceProvider
                        └─────────────┬──────────────┘      picks one at runtime
                    ┌─────────────────┴──────────────────┐
                    ▼                                     ▼
          LocalSource                            RemoteSource
          Drift/SQLite + app-owned files         dio + cookies → CB8 REST API
          push refresh (table notifications)     pull-to-refresh (no server push)
```

That's the entire trick: the UI reads the catalog exclusively through the
`LibrarySource` interface and **never branches on which implementation is live** (the
golden rule in [`AGENTS.md`](AGENTS.md)). Both sources map their rows into the same
`ComicSummary`, so a cover card, a shelf, or the reader dispatcher genuinely cannot tell
a local book from a remote one — down to details like the cover being inline bytes
(local) *or* an authenticated URL (remote), never both. New catalog capabilities are
added to the interface and implemented on both sides; capabilities the server has no
routes for (metadata editing, deletion, duplicates) are gated by a
`supportsLibraryManagement` flag rather than source checks. The full story — the
provider graph, refresh semantics, and the model's sharp edges — is
[`ARCHITECTURE.md`](ARCHITECTURE.md) §4–§5.

## The server (`webui/`)

The [`webui/`](webui) directory is the **CB8 server** — the "remote" half of hybrid
mode, and a complete, separate project with its own docs, tests, and license. It's a
Postgres-backed **Fastify** API plus a **React** (shadcn/Tailwind) single-page app, and
it runs three ways from one codebase: an Electron desktop app, a Docker container, or a
plain Node server. Point it at folders of `.cbz`/`.cbr`/`.epub`/`.pdf`/`.mobi` files and
it builds a browsable index over them without moving or rewriting anything. The Flutter
app's `RemoteSource` speaks this server's REST API verbatim — when changing remote
behavior, the server's `routes/*` + `mapping.ts` are the contract.

Its production deployment is **GitOps**: an Argo CD `Application` watches
`webui/packaging/k8s` in this repo and keeps a **k3s homelab cluster** in sync — a
`git push` that bumps the pinned image tag *is* the deploy. The operational runbook is
[`webui/DEPLOY.md`](webui/DEPLOY.md); start at [`webui/README.md`](webui/README.md) and
[`webui/ARCHITECTURE.md`](webui/ARCHITECTURE.md) for the server's own overview, with
deeper guides under [`webui/docs/`](webui/docs).

## Project status

Active personal project. Local reading + library organization and hybrid server mode
work across iOS, Android, and macOS (EPUB reading is iOS/Android — the Readium
navigator has no macOS build). Windows/Linux are scaffolded. Remaining work — store
packaging/signing, desktop EPUB, polish — is tracked in [`todo.md`](todo.md) and
[`FEATURES.md`](FEATURES.md).
