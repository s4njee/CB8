# Features

A current inventory of what CB8 (the Flutter app) does, organized by area, with the
notable behavior of each feature. This used to be a pure gap checklist against Kavita /
Komga / Calibre-Web / Mihon; the still-open gaps now live in the final section.

For the design behind these features see [`ARCHITECTURE.md`](ARCHITECTURE.md) (section
references below). Every claim here is backed by the named file(s).

## Library & navigation

- **Four-tab shell — Home / Browse / Collections / Series**
  (`features/shell/app_shell.dart`): a `NavigationRail` on wide layouts (≥768 px), a
  bottom `NavigationBar` on phones. The top bar holds search, the source switcher, an
  import button with progress spinner, and Settings. Typing a search query
  auto-switches to Browse so results are visible.
- **Home: continuity-first** (`features/library/home_screen.dart`): a hero resume card
  for the most recent in-progress book, a compact "up next" row for the rest, then
  **Want to read** and **Recently added** shelves. Empty shelves hide themselves.
- **Continue-reading dismissal with position fingerprints** (`providers.dart`,
  `dismissedContinueProvider`): clearing the shelf records each item's
  `lastPage|lastLocation` fingerprint (persisted in prefs) and hides it *only while the
  position is unchanged* — reading further changes the fingerprint and the book
  reappears. Saved progress is never touched, and it works for both sources with no
  server support.
- **Browse: All / Tags / Recent pivot chips** (`features/library/browse_screen.dart`):
  one tab for the whole catalog. *All* is the filterable/sortable grid
  (`library_screen.dart`, driven by `LibraryQuery` — search, media type, read status,
  favorites, sort), *Tags* and *Recent* reuse the organize/recent screens.
- **Quieted cards with humanized captions**
  (`features/library/widgets/comic_card.dart`): cover-led cards with a thin progress
  bar, a one-line reading-state caption ("Finished", "Page 5 of 12", "38% read"), and a
  favorite heart. Finished books dim the cover (0.55 opacity) and get a small check
  chip; the format badge is demoted to muted caption text shown only before a book is
  started. Desktop adds hover scale and a right-click context menu.
- **Collections and Series as top-level tabs** (`features/organize/`): grids of groups;
  tapping one pushes a `BrowseGridScreen` scoped to that group. In server mode the
  grid's app bar offers **Download all** (see Hybrid below).
- **Want-to-read shelf**: toggled from the long-press action sheet
  (`comic_action_sheet.dart` → `setWantToRead`), surfaced on Home. Backed by the
  `wantToRead` table locally; hidden for sources without library management (remote).
- **Duplicate detection** (`features/library/duplicates_screen.dart`, Settings → Find
  duplicates): groups identical files and matching titles, with per-copy delete.
- **Accent themes** (`features/settings/settings_screen.dart`): selectable accent color
  swatches; the app itself is dark-only.

## Reading

- **Comic reader (CBZ/CBT)** (`features/reader/comic/comic_reader_screen.dart`):
  photo_view paged modes + a continuous vertical scroll mode; **RTL / manga reading
  direction**; **two-page spreads with first-page-as-cover offset** (spread math
  handles odd counts); adjacent-page precache (±1, more in two-page mode) so turns
  paint instantly. Pages come through the `ComicPageSource` abstraction — local archive
  bytes or authenticated remote URLs.
- **HD upscaling toggle (remote comics)**: re-requests pages with `?upscale=1`
  (server-side Real-ESRGAN); `_upscale` is read per page-URL build so toggling swaps
  every page live.
- **PDF reader** (`features/reader/pdf/`): native `pdfrx` (pdfium) with custom page
  layouts per reading mode and tap zones over the viewer.
- **EPUB reader — Readium** (`features/reader/unified_reader_screen.dart`, on
  `flutter_readium`; iOS/Android only, see ARCHITECTURE §9):
  - **Paginated-only by design** (single / two-column): Readium's scroll mode scrolls
    within one chapter and never flows into the next, so scroll isn't offered
    (rationale + the deferred custom-scroll idea are in [`later.md`](later.md)).
  - **Table of contents**, **in-book search** (result list with highlight context), and
    **text-to-speech** (voice picker + speech rate, persisted, `_TtsSettingsSheet`).
  - **Typography sheet**: font size/family, line height, page margins, word/letter
    spacing, text alignment, reading progression, plus **dark / light / sepia themes**.
    All persisted preferences are re-applied on open.
  - **Per-chapter scrubber with a whole-book label**: the slider is per-chapter
    (Readium's `goToProgression` only seeks within the current resource); the label
    shows "Ch 7/38 · 42%" — chapter position plus whole-book `totalProgression`.
  - **Locator-based resume**: position is a serialized Readium Locator in
    `lastLocation`; `completed` is derived from `totalProgression >= 0.99` (whole-book,
    not per-chapter).
- **Shared reader behavior**: reading mode (scroll/single/double) persisted globally;
  **debounced progress saving** (`progress_saver.dart`, 800 ms trailing with a
  `flush()` on dispose so the final position always lands); desktop **keyboard
  shortcuts** (`reader_keyboard.dart` — arrows/space/PageUp-Dn/Home/End page, `f`
  fullscreen, Esc backs out; suspended while any text field has focus); immersive
  fullscreen + page-turn haptics on mobile.

## Formats

- **CBZ and CBT (tar)** comic archives; **PDF**; **EPUB**. Import probing in
  `features/import/media_probe.dart` (`comicExtensions = {cbz, cbt}`).
- **AVIF / JXL page entries recognized** inside comic archives
  (`reader/comic/cbz_archive.dart`); undecodable pages degrade gracefully, but full
  decode still needs a native codec.
- Not supported: CBR/RAR, CB7/7z, MOBI/AZW3/FB2, loose image folders, audiobooks.

## Hybrid local + server

- **One UI, two sources** (ARCHITECTURE §5): everything goes through the
  `LibrarySource` interface; `activeSourceProvider` picks `LocalSource` (Drift +
  files) or `RemoteSource` (CB8 REST + dio/cookies) at runtime. Capabilities the
  server has no routes for (metadata editing, deletion, want-to-read, duplicates) are
  gated by `supportsLibraryManagement` so the UI only shows affordances that work.
- **Segmented source switcher** (`features/connections/connection_switcher.dart`): on
  wide layouts an always-visible segmented control ("This device" | each server) so
  you always know which library you're looking at; phones and 3+-server setups fall
  back to a compact popup. Add/sign-in/manage servers live in its overflow menu.
- **Guest mode and the 401 contract**: the server 401s guest *writes* by design.
  `RemoteSource.setProgress` swallows those failures so the reader never crashes for a
  guest; the switcher shows an amber "· Guest" badge to explain why progress isn't
  being saved, with a sign-in action. Session state is classified as
  authenticated / guest / unauthenticated / offline (`sessionStatusProvider`).
- **Sessions survive restarts**: a persistent cookie jar carries the better-auth
  session cookie; all `RemoteSource` instances share it.
- **Remote refresh is pull-to-refresh**: the server has no change stream, so every tab
  offers pull-to-refresh (`invalidateLibraryProviders`), which also evicts the image
  cache so re-issued covers aren't served stale. Local mode live-refreshes via Drift
  change notifications.
- **Download to device (offline)**: saves a server item (CBZ/PDF/EPUB) into the
  on-device library as a normal local row — per item from the action sheet, or **bulk
  "Download all"** for a whole collection / series-folder / tag
  (`browse_grid_screen.dart`; sequential, cancellable, with progress).
- **Remote reading without downloading to the library**: remote *books* (PDF/EPUB) are
  fetched whole to a cached temp file (atomic `.part`→rename) per open; remote
  *comics* stream page-by-page with the auth cookie in `imageHeaders`.

## Import & organization

- **Import paths**: native file picker (multi-select), **desktop drag-and-drop**
  (`desktop_drop` in `app_shell.dart`), and `--dart-define=SEED=true` synthetic
  samples. Imported files are copied into app storage and stored as *relative* paths
  (ARCHITECTURE §9).
- **Watched folders** (`features/import/watched_folders.dart`): auto-ingest external
  directories *in place* (absolute paths, not copied). Rescan on add, on launch, and
  on demand; **desktop live-watches** create/modify/move events with a quiet-period
  debounce so a file still being copied isn't probed mid-write. Managed in Settings →
  Watched folders.
- **Embedded-metadata import** (`features/import/embedded_metadata.dart`): parses
  `ComicInfo.xml` (CBZ/CBT) and the EPUB OPF package document at import — title,
  series, volume/chapter, people, genre, year, summary. Filename **series parsing**
  (`series_parser.dart`) fills in the rest.
- **Metadata editing** (`features/library/metadata_edit_screen.dart`, local library):
  edit title, series, volume/chapter, author, artist, genre, year, summary in-app.
- **Metadata scraping** (`features/import/metadata_scraper.dart`): keyless lookup —
  Google Books first (rich descriptions + categories), Open Library as fallback —
  surfaced as a picker in the metadata editor.
- **Tags and collections**: tag browsing via the Tags pivot; collections
  (libraries) with membership managed from the action sheet.

## Platform integrations

- **Desktop (macOS)**: native `PlatformMenuBar` (About/Quit, Import ⌘O, Full Screen),
  window min/default size with frame persistence (`setFrameAutosaveName`), fullscreen
  over the `cb8/window` MethodChannel, scrollbars, hover states, right-click menus,
  reader keyboard shortcuts. EPUB does **not** run on macOS (Readium is
  mobile-only) — CBZ and PDF do.
- **iOS**: branded icon + splash, privacy manifest, Files-app integration
  (`UIFileSharingEnabled` + open-in-place), local-network usage description for
  `.local` servers, deliberately-open ATS (self-hosted servers over plain HTTP).
- **Android**: adaptive icon + Android 12 splash, cleartext allowed (same self-hosted
  rationale), R8/shrinking release config, minSdk 24 / target 36.
- **Server side note**: the CB8 server (vendored under `webui/`) now serves an **OPDS
  feed** and per-item **WebPub manifests** (`webui/src/main/webServer/routes/opds.ts`,
  `webpub.ts`). The Flutter client does not consume them yet — remote reading still
  uses the REST download/stream paths above (see `tasks.md` Phase 2).

## Known gaps (the short list)

Still absent, kept from the original comparison against Kavita / Komga / Calibre-Web /
Mihon:

- CBR/RAR + CB7/7z decoding; MOBI/AZW3/KEPUB/FB2; loose-image-folder comics; audiobooks.
- Webtoon long-strip mode with no gaps; wide-page auto-splitting; image fit options;
  margin cropping; auto-scroll.
- In-book bookmarks UI (the `bookmarks` table exists, no reader UI), highlights /
  annotations / notes.
- **Dictionary lookup on selection — removed** with the epub.js reader
  (`flutter_readium` exposes no selection callback; explicitly dropped, see
  `tasks.md`).
- Multi-user accounts, reading lists, ratings, stats dashboard, saved/smart filters,
  custom covers, age ratings.
- Client-side OPDS browsing, Mihon extension API, Kobo/KOReader sync, send-to-device.
- First-class Windows/Linux builds (scaffolded only — see `todo.md`), light theme,
  i18n, accessibility pass.
