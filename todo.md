# TODO — Ship CB8-Next Cross-Platform (Desktop + Mobile)

Most of this list is about turning the existing iOS-first Flutter app into a polished
desktop application (macOS / Windows / Linux); mobile (iOS / Android) deployment polish
is tracked in its own section near the end.
The platform scaffolds (`macos/`, `windows/`, `linux/`) already exist, and most
dependencies are desktop-ready. This list is ordered by phase; do Phase 0–2
before worrying about packaging.

## ✅ macOS status — runnable & verified (2026-06-26)
The macOS app now **builds, launches, and all three readers work natively**:
- Builds & runs to the library; Drift/sqlite + pdfium load; the library shell
  already adapts responsively (NavigationRail when wide / bottom bar when narrow).
- **Entitlements** fixed: added `network.client` + `files.user-selected.read-write`
  to Debug **and** Release (file_picker + dio now work in the sandbox).
- **CBZ** (archive+photo_view), **PDF** (pdfrx), **EPUB** all render & track progress.
- **EPUB on macOS** needed a workaround (see Phase 2): the WebView blocks the
  sibling-dir epub.js/jszip `<script>`s and ignores `transparentBackground`, so
  `epub_reader_screen.dart` injects the libs itself, drives the package's
  `readyToLoad`, and forces the dark background. Mode switches re-run it.
- **Keyboard nav** (←/→/Space/PageUp-Dn/Home/End/Esc) added to all readers via a
  shared `reader_keyboard.dart` (HardwareKeyboard handler, beats Scrollable focus).
- **Window**: min size + sensible default in `MainFlutterWindow.swift` (no collapse).

**Phase 3** (mouse + keyboard input) and **Phase 4** (window management, native menu
bar, fullscreen, responsive shell, and window-frame persistence via
`setFrameAutosaveName`) are now complete — see those sections for specifics. One
deferred, low-priority nit: PDF *keyboard* zoom over the giant multi-page layout
(pinch/trackpad zoom works).

Remaining for a *shippable* macOS build: code-sign + notarize + `.dmg` (Phase 6),
drag-and-drop import (Phase 5). Windows & Linux are untouched.

## Compatibility snapshot (from current `pubspec.yaml`)

| Concern | macOS | Windows | Linux | Notes |
|---|---|---|---|---|
| PDF reader (`pdfrx`) | ✅ | ✅ | ✅ | pdfium is cross-platform |
| CBZ reader (`archive` + `photo_view`) | ✅ | ✅ | ✅ | pure Dart + widgets |
| **EPUB reader** (`flutter_epub_viewer` → `flutter_inappwebview` 6.1.5) | ✅ WKWebView | ⚠️ WebView2 (runtime req.) | ❌ **unsupported** | **main blocker — see Phase 2** |
| DB (`drift` + `sqlite3_flutter_libs`) | ✅ | ✅ | ✅ | bundles sqlite3 |
| `dio` / cookies / secure_storage / shared_prefs | ✅ | ✅ | ✅* | *Linux secure_storage needs `libsecret` |
| `file_picker` | ✅ | ✅ | ✅ | native dialogs |

---

## Phase 0 — Baseline: build & run on each OS
- [ ] `flutter config --enable-macos-desktop --enable-windows-desktop --enable-linux-desktop`; confirm `flutter devices` lists each.
- [ ] `flutter run -d macos` — get the app launching to the library on macOS.
- [ ] `flutter run -d windows` and `-d linux` (on the respective machines/VMs); fix any compile/plugin-registration errors.
- [ ] Run `dart run build_runner build` (riverpod/drift codegen) and confirm it's wired into the build.
- [ ] Capture a per-OS "it launches + lists library" baseline before going further.

## Phase 1 — Native dependencies & data
- [ ] **SQLite**: verify Drift opens the DB + runs migrations on each OS (`sqlite3_flutter_libs` should bundle the native lib; confirm no "sqlite3 not found").
- [ ] **App data dir**: confirm `path_provider` resolves a sane per-OS support dir (`~/Library/Application Support`, `%APPDATA%`, `~/.local/share`) and that the **relative-path library resolution** (`resolveLibraryPath`) still works for imported files.
- [ ] **flutter_secure_storage on Linux**: requires `libsecret-1-dev` (build) + `libsecret`/a keyring at runtime — document the dependency and add graceful fallback if no keyring is present.
- [ ] **pdfium**: confirm `pdfrx` loads pdfium on each OS (it ships prebuilt binaries; verify on a real PDF).

## Phase 2 — EPUB reader on desktop (the blocker)
`flutter_inappwebview` declares **android/ios/macos/windows/web** — **no Linux**.
- [ ] **macOS**: test the existing EPUB reader (WKWebView). Likely works as-is — verify epub.js loads, page modes + progress work, and remote/local sources resolve.
- [ ] **Windows**: requires the **Edge WebView2 runtime** installed on the user's machine. Test; document the runtime prerequisite (and bundle the evergreen installer or detect+prompt).
- [ ] **Linux** (no webview): pick a strategy —
  - [ ] Option A: swap the EPUB engine for a non-WebView renderer on Linux (e.g. parse spine with `archive` + render reflowable HTML in Flutter, or evaluate a Dart/native epub renderer). Highest effort, best result.
  - [ ] Option B: gate EPUB behind `Platform.isLinux` with a clear "not supported on Linux yet" message; ship CBZ+PDF on Linux first.
  - [ ] Option C: use a system-webview plugin that supports Linux (WebKitGTK) if one is viable, behind a platform-conditional import.
- [ ] Abstract the EPUB reader behind an interface so the engine can differ per platform without touching callers.

## Phase 3 — Input adaptation (mouse + keyboard)
The readers are touch-first (`onTapUp` zones, swipe, pinch). Add desktop input:
- [x] **Keyboard nav** (all readers): ←/→/Space/PageUp-Dn/Home/End/Esc via the shared `reader_keyboard.dart` (HardwareKeyboard handler — beats the embedded Scrollable's focus).
- [x] **Zoom**: Cmd + `=`/`-`/`0` wired in every reader; Cmd + mouse-wheel on PDF. EPUB font-size zoom and PDF/CBZ pinch + trackpad zoom work.
  - ⚠️ **Known low-priority limitation (deferred):** PDF *keyboard* zoom (Cmd +/−) doesn't reliably move the view over the giant multi-page horizontal page layout — `zoomOnLocalPosition` silently no-ops there and `setZoom(centerPosition, …)` didn't visibly change it either. Pinch / two-finger-scroll zoom works, so this is cosmetic. Revisit if users ask.
- [x] **Scroll/scrollbars**: `_CbScrollBehavior` in `app.dart` shows scrollbars on desktop; mouse-wheel scrolls the vertical reader.
- [x] **Click zones + hover cursor**: paged readers split into left/right `_TapZone`s with a click cursor (`MouseRegion`); centre toggles chrome.
- [x] **Right-click context menu**: cards map the long-press action sheet onto `onSecondaryTapUp` (right-click).
- [x] **Hover states**: cards scale up on hover (`MouseRegion` + `AnimatedScale`).

## Phase 4 — Window & responsive UX
- [x] **Window management**: min size (480×600) + sensible default (1000×760) in `MainFlutterWindow.swift`; **size/position now persist across launches** via `setFrameAutosaveName` (restores saved frame, falls back to the default on first run).
- [x] **Responsive shell**: `NavigationRail` when wide / bottom `NavigationBar` when narrow (≥768px breakpoint); library grid columns scale by width.
- [x] **macOS menu bar**: `PlatformMenuBar` — CB8 (About/Quit), File (Import… ⌘O), View (Enter Full Screen). Wired to the existing import action.
- [~] **Remove mobile-only chrome** (`SafeArea`/status-bar padding): desktop window insets are 0 so the reader bars already sit flush — effectively N/A; revisit if any screen shows stray top padding.
- [x] **Fullscreen / presentation mode**: `f` key + an AppBar/top-bar button in every reader call native `NSWindow.toggleFullScreen` over the `cb8/window` MethodChannel.

## Phase 5 — File import on desktop
- [ ] Verify `file_picker` opens native file + folder dialogs on each OS (multi-select CBZ/PDF/EPUB; folder import). *(macOS multi-file picker works; folder-picker path not separately tested.)*
- [x] **Drag-and-drop**: `desktop_drop` wired in `app_shell.dart` (desktop-only `DropTarget` with a drop overlay) → `ImportController.importDropped` expands dropped folders, filters to CBZ/PDF/EPUB, and ingests. Sandbox covers dropped-file reads via the existing `files.user-selected.read-write` entitlement (Finder drags get an implicit grant). *Builds, links the native plugin, launches clean; the drop gesture itself still needs a manual check (couldn't drive the desktop this session).*
- [ ] Consider a configurable library root on desktop (vs the app sandbox), since desktop users manage files directly.

## Phase 6 — Packaging, signing & distribution
- [ ] **App identity**: set product name, bundle/app id, version, and per-platform **icons** (macOS `.icns`, Windows `.ico`, Linux `.png` + `.desktop`).
- [ ] **macOS**: `flutter build macos`; set entitlements (network client, user-selected file read/write; decide sandbox vs not); **code-sign** with a Developer ID; **notarize**; package as `.dmg`.
- [ ] **Windows**: `flutter build windows`; package as **MSIX** (`msix` package) or an installer (Inno Setup); code-sign with an Authenticode cert; bundle/detect the **WebView2** runtime.
- [ ] **Linux**: `flutter build linux`; package as **AppImage** and/or **Flatpak**/Snap/`.deb`; declare runtime deps (`libsecret`, GTK, `libsqlite3`); ship a `.desktop` entry + icon.
- [ ] Decide distribution channels (direct download, Mac App Store?, MS Store, Flathub) — note: App Store sandboxing affects file access + may conflict with the EPUB webview.

## Phase 7 — Testing & CI
- [ ] Per-OS smoke test: import a CBZ/PDF/EPUB → cover appears → open → page through (mouse + keyboard) → progress persists on reopen.
- [ ] Server (hybrid) mode on desktop: add a CB8 connection, log in (cookie), browse, read, confirm progress sync.
- [ ] Window resize / multi-monitor / DPI-scaling sanity check on each OS.
- [ ] CI matrix: build macOS (on macOS runner), Windows (windows runner), Linux (ubuntu runner) on tag; attach artifacts.

## Phase 8 — Polish
- [ ] Keyboard-shortcut help/cheat-sheet; settings (default reading mode, theme, library location).
- [ ] App auto-update story (Sparkle/macOS, Squirrel/Windows, or just release notes).
- [ ] Crash/error reporting + logging to a per-OS log file.
- [ ] Accessibility pass (focus order, screen-reader labels) at desktop scale.

---

## Mobile deployment (iOS / Android)
This app is **mobile-first** — the desktop work above is additive. These are the
deployment-readiness / polish items for shipping the iOS and Android builds.
State below reflects the current `ios/` and `android/` config (checked 2026-06-26).

### Shared
- [ ] **App icons + splash**: no `flutter_launcher_icons` / `flutter_native_splash` wired yet — add them and generate icon sets + launch screens for both platforms (still the default Flutter icon).
- [ ] **Display name**: Android label is still `cb8_flutter`; set a proper "CB8" name on both (iOS already has `CFBundleDisplayName`).
- [ ] **Versioning**: drive store `versionName`/`versionCode` (Android) and `CFBundle*Version` (iOS) from `pubspec.yaml` `version:`; pick a bump strategy.
- [ ] **Open-in / file associations**: register CBZ/PDF/EPUB so the OS share sheet / Files can hand a file to the importer (import is in-app only today).
- [ ] **`.local` server reachability**: the app connects to `mars.local:8002` over **plain HTTP** — see the per-platform cleartext/ATS + local-network items below (this is the most likely "works in debug, fails in release" trap).

### Phase 9 — iOS (TestFlight / App Store)
- [ ] **Signing**: Apple Developer team + bundle id + provisioning set in `Runner.xcodeproj` (currently unset for distribution).
- [ ] **Tighten ATS**: `Info.plist` currently sets `NSAllowsArbitraryLoads = true` (wide open). Scope it to the server host (`NSExceptionDomains`) or use `NSAllowsLocalNetworking`; App Store review pushes back on blanket arbitrary loads.
- [ ] **Local-network permission**: add `NSLocalNetworkUsageDescription` (+ `NSBonjourServices` if discovering) — connecting to a `.local` host triggers the iOS 14+ local-network prompt; without the string the connection silently fails.
- [ ] **App privacy manifest**: add the app's own `PrivacyInfo.xcprivacy` (only a Pod's exists today) — declare required-reason APIs (UserDefaults, file timestamps) and "no data collected"; required by App Store.
- [ ] **App icon set** (`Assets.xcassets/AppIcon`, all sizes) + launch screen.
- [ ] **Usage strings** for any `file_picker`/photo access actually used (document picker needs none; add photo strings only if reached).
- [ ] **Files-app integration**: `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` if users should drop files into the app's Documents folder.
- [ ] **Deployment target / iPad**: target is iOS 13.0 — confirm that's intended; sanity-check iPad size classes + supported orientations.
- [ ] **Ship**: `flutter build ipa` → App Store Connect / TestFlight; content rating + privacy-policy URL.

### Phase 10 — Android (Play Store)
- [ ] **Cleartext to the server** *(blocker for release)*: no `usesCleartextTraffic` / `networkSecurityConfig` set — Android 9+ blocks the `mars.local:8002` HTTP call in release. Add a `network_security_config.xml` allowing that host (or move to HTTPS).
- [ ] **INTERNET permission**: the main `AndroidManifest.xml` has no `uses-permission` — INTERNET is only present via the debug manifest, so **release builds can't reach the server**. Add `<uses-permission android:name="android.permission.INTERNET"/>` to the main manifest.
- [ ] **Release signing**: `signingConfig` is still `debug`. Create a keystore + `key.properties` (git-ignored) and a release `signingConfig` in `android/app/build.gradle`.
- [ ] **SDK levels**: `minSdk/targetSdk/compileSdk` inherit the Flutter defaults — pin and confirm `targetSdk` meets the current Play floor.
- [ ] **Adaptive icon** (foreground/background + monochrome) across mipmap densities; splash.
- [ ] **R8/ProGuard**: enable release shrinking + keep rules for drift/sqlite3, pdfrx (pdfium), and the inappwebview EPUB engine; verify a release build still reads all three formats.
- [ ] **16 KB page size**: confirm bundled native libs (sqlite3, pdfium) are 16 KB-aligned for the Android 15 requirement.
- [ ] **Edge-to-edge / predictive back**: handle the Android 15 edge-to-edge default; opt into predictive back if desired.
- [ ] **Ship**: `flutter build appbundle` → Play Console listing, data-safety form, content rating.

### Phase 11 — Mobile testing
- [ ] On a real iOS + a real Android device: import CBZ/PDF/EPUB → cover → open → page (touch) → progress persists on reopen.
- [ ] Server (hybrid) mode over the LAN: add the CB8 connection, log in, browse, read, confirm progress sync.
- [ ] **Release-build** smoke test on both (signed, shrinking on) — this is what surfaces the ATS / cleartext / INTERNET / ProGuard issues that debug builds hide.

---

### Suggested order of attack
1. Phase 0 (get it launching everywhere) → 2. Phase 1 (data works) → 3. **Phase 2 EPUB** (the real risk; decide the Linux story early) → 4. Phase 3 + 4 (make it feel native) → 5. Phase 5 → 6. Phase 6 packaging → 7–8 testing/polish.

**Lowest-risk MVP:** ship **macOS first** (everything works, including EPUB via WKWebView), then Windows (add WebView2), then Linux (after solving the EPUB engine).
