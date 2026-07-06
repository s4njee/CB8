# AGENTS.md

Guidance for AI coding agents working in this repository. Humans: see
[`README.md`](README.md) for an overview and [`ARCHITECTURE.md`](ARCHITECTURE.md) for the
full design.

## What this is

CB8 is a cross-platform (iOS / Android / macOS) Flutter **comic & e-book reader** for CBZ,
PDF, and EPUB. It is **hybrid**: the same UI reads from either an on-device library
(SQLite + local files) or a remote self-hosted CB8 server (REST API), chosen at runtime.

**Read [`ARCHITECTURE.md`](ARCHITECTURE.md) before making non-trivial changes.** It is the
source of truth for the provider graph, the source abstraction, the reading pipeline, and
the platform gotchas. The notes below are the operational essentials.

## Setup, build, and test

```bash
flutter pub get                      # install dependencies

flutter analyze                      # static analysis / lint — must be clean
flutter test                         # unit + light integration tests

flutter run                          # run on a chosen device
flutter run --dart-define=SEED=true  # run with synthetic CBZ/PDF/EPUB sample data
```

Always run `flutter analyze` and `flutter test` before considering a change done.

### Code generation (Drift)

The Drift database is code-generated. `lib/data/db/database.dart` has a committed
`database.g.dart` companion. **If you change the Drift schema or any `@DriftDatabase` /
table definition, regenerate it:**

```bash
dart run build_runner build --delete-conflicting-outputs
```

Do not hand-edit `*.g.dart` files. Riverpod providers in this repo are written by hand
(not generated), despite `riverpod_generator` being a dev dependency.

## Project layout

```
lib/
  main.dart            Bootstrap + ProviderScope overrides
  app.dart             MaterialApp.router, dark theme
  core/                router, theme, window control
  data/
    db/                Drift schema + AppDatabase (+ generated .g.dart)
    models/            ComicSummary (source-agnostic row), Connection, groups
    sources/           LibrarySource interface, LocalSource, RemoteSource
    repositories/providers.dart   THE Riverpod provider hub
  features/
    shell/             adaptive nav (rail / bottom bar) + top bar
    library/ organize/ connections/ import/ settings/
    reader/            dispatcher + comic / pdf readers + unified (EPUB) reader
                       + progress_saver.dart (debounced writes) + reader_keyboard.dart
test/                  tests + test/support/fake_cb8_server.dart
```

## Conventions & rules

- **Lint:** `package:flutter_lints` via `analysis_options.yaml`. Keep `flutter analyze`
  clean. Suppress a lint only locally (`// ignore: name`) with a reason, never project-wide.
- **State / DI:** Riverpod. Almost all wiring lives in
  [`lib/data/repositories/providers.dart`](lib/data/repositories/providers.dart) — add new
  providers there and follow the existing patterns.
- **The golden rule — never branch on source type in the UI.** Screens read the catalog
  through `activeSourceProvider` (a `LibrarySource`) and must not know whether it's local
  or remote. New catalog capabilities go on the `LibrarySource` interface and are
  implemented in *both* `LocalSource` and `RemoteSource`.
- **`ComicSummary` is the one source-agnostic row** the UI renders; both sources map into
  it. Respect its xor fields (`coverThumbnail` local bytes vs `coverUrl` remote) and the
  `copyWith` semantics noted in ARCHITECTURE §5.
- **Docs:** public Dart APIs use `///` doc comments; `dart doc` must not break (see
  `dartdoc_options.yaml`). Match the surrounding code's style and comment density.
- **Match existing idioms** — look at neighboring files before introducing a new pattern,
  dependency, or directory.

## Gotchas (don't relearn these the hard way)

- **Remote has no change stream.** Local refreshes via Drift notifications; remote relies
  on pull-to-refresh (`invalidateLibraryProviders`). Don't assume remote views auto-update.
- **Guest writes 401 by design.** `RemoteSource.setProgress` swallows failures so the
  reader never crashes for a guest. Preserve that; surface auth state via the guest badge.
- **The EPUB reader is Readium (`flutter_readium`), iOS/Android only.** Position is a
  Readium Locator in `lastLocation`; it's paginated-only (single/two-column — scroll is
  per-resource, see `later.md`). Building needs Flutter SPM disabled, iOS 15+, and Android
  `desugar_jdk_libs` 2.1.5+. Read ARCHITECTURE §9 before touching it.
- **Readium `progression` ≠ `totalProgression`.** `locations.progression` is position
  within the *current chapter* (drives the scrubber — `goToProgression` can only seek
  within the current resource); `locations.totalProgression` is position in the *whole
  book* (drives the "Ch 7/38 · 42%" label and the `completed` check in
  `unified_reader_screen.dart`). Using per-chapter progression for `completed` marked
  books finished at the end of chapter 1 (bugs.md #6) — don't reintroduce it.
- **Progress writes are debounced; catalog refetches are throttled.** Readers save
  through `ProgressSaver` (`reader/progress_saver.dart`, 800 ms trailing, `flush()` on
  dispose), and `libraryChangesProvider` throttles Drift's per-statement events
  (400 ms, leading+trailing). Never persist per page-turn / per locator event — each
  write refetches every catalog provider.
- **`LibraryQuery` has value equality because it keys `browseComicsProvider`** (a
  `.family`). If you add a field, extend `==`/`hashCode` too — with identity equality,
  every navigation created and permanently cached a fresh provider instance.
- **Foreign keys are ON (schema v4).** `beforeOpen` runs `PRAGMA foreign_keys = ON`,
  so every `onDelete: cascade` in the schema is *real* now — deletes actually cascade
  (favorites, tags, history, memberships). The v4 migration swept the orphans from the
  FK-off era; don't add code that relies on children surviving a parent delete.
- **List queries skip the cover BLOB column on purpose** (both `LocalSource` and the
  server). Covers load lazily per-card via `localCoverProvider` (30 s keep-alive).
  Don't add `coverThumbnail` back into a list select "for convenience".
- **`ReaderKeyboard` is a process-global `HardwareKeyboard` handler.** It stays active
  under modal sheets, and only stands down via the `EditableText` primary-focus guard
  (`reader_keyboard.dart`). Keep that guard when adding text fields to reader chrome,
  or Space/`f`/arrows will page the book instead of typing.
- **Storage paths are relative** to `getApplicationSupportDirectory()` (iOS container UUIDs
  change on reinstall). Never persist absolute file paths.

## Testing notes

- `test/support/fake_cb8_server.dart` is an in-process HTTP server faithful to the CB8
  REST contract (including the guest-write 401). Use it for `RemoteSource` / connection
  tests instead of hitting a real server.
- Local-DB tests use `AppDatabase.forTesting(NativeDatabase.memory())`.

## Relationship to the CB8 server

`RemoteSource` speaks the original CB8 server's REST API verbatim (same routes, camelCase
fields, better-auth session cookie). That server is a **separate project**. When changing
remote behavior, treat the server's `routes/*` + `mapping.ts` as the contract.

## Scope & safety

- Don't commit, push, or open PRs unless asked.
- Don't add new third-party dependencies without a clear reason; prefer what's already in
  `pubspec.yaml`.
- Leave `README.md` screenshots and the `screenshots/` assets alone unless asked.
