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
    reader/            dispatcher + comic / pdf / epub readers
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
- **EPUB resume is CFI-based and finicky** (progress gating, the relocate watchdog, mode
  remounts). There is also a macOS WKWebView workaround for epub.js sub-resources. Read
  ARCHITECTURE §9 before touching the EPUB reader.
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
