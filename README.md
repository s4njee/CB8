# CB8

A fast, cross-platform **comic & ebook reader** for **CBZ, PDF, and EPUB**, built with Flutter.
Mobile-first, with a polished desktop experience and an optional *hybrid* mode that pairs with a
self-hosted CB8 server.

<p align="center">
  <img src="assets/icon/cb8_icon.png" width="180" alt="CB8 app icon">
</p>

## About

CB8 is a single reader for the three formats people actually keep their reading in:
**CBZ** comic archives, **PDF** documents, and reflowable **EPUB** books. Instead of
juggling a comic app, a PDF viewer, and an ebook reader, you get one organized library —
with covers, search, collections, series, tags, and a *Continue Reading* shelf — and one
consistent reading experience on top of all of it.

It is a ground-up Flutter rewrite of the original Electron-based CB8 app, designed
mobile-first but equally at home on a desktop. The same UI runs on a phone, a tablet, and
a Mac, adapting its layout to each: a bottom navigation bar where the screen is narrow, a
sidebar rail and a denser grid where it's wide, plus keyboard shortcuts, drag-and-drop
import, and a native menu bar on the desktop.

What makes CB8 unusual is that it's **hybrid**. You can keep your library entirely
on-device — files copied into the app, catalog stored in local SQLite, everything offline
— *or* point the app at a self-hosted CB8 server and browse and read your whole remote
library, with reading progress syncing back. The key design rule is that the UI never
knows or cares which one is live: every screen reads through a single `LibrarySource`
abstraction, and one provider decides at runtime whether that's the local database or a
remote server. Switching between *this device* and a server is a one-tap action in the
top bar.

## Features

- **Three formats, one library** — CBZ comics (`archive` + `photo_view`), PDFs (`pdfrx` / pdfium), and reflowable EPUB (epub.js in a WebView), all browsed and read through the same UI.
- **Organized library** — cover grid with format badges, search, quick filters (Comics / Books / Favorites / In progress), Collections, Folders (auto-grouped series), Tags, a Recent tab, and a **Continue Reading** shelf.
- **Resume where you left off** — per-item reading progress is tracked and restored, including page numbers for comics/PDFs and EPUB-CFI locations for books; the Continue Reading shelf updates live as you read.
- **Reading modes** — continuous scroll, single page, and two-page spread, with tap zones, swipe, and pinch-zoom. The chosen mode is remembered across the whole app.
- **Hybrid / server mode** — read from *this device* (local files + SQLite, fully offline), or connect to a self-hosted CB8 server and browse + read your remote library with progress sync. Guest browsing is supported, with a clear badge and one-tap sign-in when a server requires auth to save progress.
- **Easy import** — bring in CBZ/PDF/EPUB files via a file picker or, on the desktop, drag-and-drop. Imports are copied into the app so it owns them, with series and metadata parsed on the way in.
- **Truly cross-platform** — iOS, Android, and macOS (Windows/Linux scaffolded). The shell adapts: a `NavigationRail` on tablets & desktops, a bottom bar on phones.
- **Desktop-native touches** — keyboard navigation + zoom shortcuts, drag-and-drop import, a native macOS menu bar, fullscreen, and window size/position persistence.

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
| State / DI | [Riverpod](https://riverpod.dev) |
| Navigation | [go_router](https://pub.dev/packages/go_router) |
| Local catalog | [Drift](https://drift.simonbinder.eu) + `sqlite3_flutter_libs` |
| PDF | [pdfrx](https://pub.dev/packages/pdfrx) (pdfium) |
| CBZ | [photo_view](https://pub.dev/packages/photo_view) + `archive` |
| EPUB | [flutter_epub_viewer](https://pub.dev/packages/flutter_epub_viewer) (epub.js / WebView) |
| Networking | [dio](https://pub.dev/packages/dio) + `cookie_jar` |
| Import | `file_picker`, `desktop_drop` (desktop drag-and-drop) |

## How it works

The whole app is organized around one idea: **the UI never knows where content comes
from.** Every screen talks to a single `LibrarySource` interface — `listComics`,
`continueReading`, `getComic`, `setProgress`, favorites, tags, collections, series — and a
Riverpod provider (`activeSourceProvider`) decides which implementation is live:

- **LocalSource** runs Drift queries over an on-device SQLite catalog and reads files from
  app storage. It's push-based: Drift table notifications refresh the UI the instant
  anything changes.
- **RemoteSource** is a `dio` client that speaks the original CB8 server's REST API
  verbatim (same routes, camelCase fields, session cookie). It has no change stream, so
  remote views use pull-to-refresh.

Opening an item routes through a `ReaderDispatcher` that loads a fresh copy (so your resume
position is current), downloads the file if it's a remote book, then dispatches by
extension to the comic, PDF, or EPUB reader. All three share the same reading-mode setting,
chrome, and progress-saving path.

For the full picture — the provider graph, the reading pipeline, connections/auth, and the
platform-specific gotchas (relative iOS storage paths, the macOS EPUB/WebView workaround,
CFI-based resume) — see [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Getting started

```bash
flutter pub get
flutter run                          # choose a device when prompted

# Explore the UI instantly with synthetic CBZ/PDF/EPUB samples:
flutter run --dart-define=SEED=true
```

Supported targets: **iOS**, **Android**, **macOS** (verified) — **Windows** / **Linux** desktop scaffolds exist; EPUB on Linux needs a WebView strategy (see `todo.md`).

## API documentation

The Dart source is documented with `///` doc comments throughout. Generate the
browsable HTML API reference with:

```bash
dart doc                             # output in doc/api/, open doc/api/index.html
```

Configuration lives in [`dartdoc_options.yaml`](dartdoc_options.yaml); it fails
the build on broken doc references. The generated `doc/api/` is build output and
is not checked in.

## Project status

Active personal project. Local reading + library organization and hybrid server mode work across iOS, Android, and macOS. Remaining work (store packaging/signing, the Linux EPUB engine, polish) is tracked in [`todo.md`](todo.md).
