# CB8 — Readium reader adoption

Plan to replace the fragile epub.js EPUB reader with a Readium-based reader, and
(later) unify PDF + CBZ under the same engine. Organized as a **spike → Phase 1 →
Phase 2** sequence so the engine earns each increment before we commit to it.

> Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` cut/deferred

---

## Decisions & constraints (the context that shapes everything below)

- **Engine:** Readium, via **`flureadium`** (a modernized fork of `flutter_readium`,
  Readium 3.x, Preferences + Decorator APIs). `flutter_readium` (BSD-3) is the
  upstream alternative — same engine — to reconsider at Phase 2 if remote/OPDS
  exposure becomes the deciding axis.
- **License:** LGPL-3.0 (flureadium) is **accepted** for how CB8 is distributed.
- **macOS:** **dropped** as a target for the Readium reader — flureadium's macOS
  native side is a stub. Mobile-first (iOS/Android) is the scope.
- **Dictionary-on-selection:** **not required** — flureadium exposes no selection
  callback, and we're fine losing it.
- **The unification gate:** Readium consumes **Publications/manifests**, but the CB8
  server speaks a bespoke REST API (`/api/comics/:id/pages/:n`), not WebPub/OPDS.
  So **remote streaming through Readium requires server-side WebPub/OPDS** — that's
  Phase 2, and it overlaps the existing `OPDS feeds` item in `FEATURES.md`.
- **Position data resets once:** epub.js **CFI** → Readium **Locator** are not
  interchangeable; existing `lastLocation` values are lost on cutover.
- **PDF is a lateral trade:** `pdfrx` (native pdfium) is best-in-class; moving PDF
  onto Readium in Phase 2 is a deliberate trade for unification, not an upgrade.

---

## Phase 0 — Spike (gate before any adoption)

**Epic 0.1 — De-risk Readium on mobile**
Goal: prove the engine on real devices before committing to the reader rewrite.
- [ ] Branch `spike/readium-epub`; add `flureadium`; native setup (iOS Podfile
      Readium pods; Android `MainActivity` → `FlutterFragmentActivity`, minSdk 24).
- [ ] Debug screen: `openPublication` a sample EPUB → `ReadiumReaderWidget`.
- [ ] Build + run on the **iPad simulator** and the **Android tablet**.
- [ ] Verify **Locator resume**: capture `onTextLocatorChanged`, `goToLocator` back.
- [ ] Verify a **dark preference** applies via `setEPUBPreferences`.
- [ ] **Remote probe:** can it open a resource from a **URL with a custom auth
      header** at all? (Determines how much Phase 2 server work is really needed.)
- [ ] Go/No-Go writeup. If No-Go, fall back to "own the epub.js bridge" instead.

---

## Phase 1 — EPUB on Readium (local + download-first)

The low-risk win: swap only the EPUB engine, keep the hybrid model intact by
reading remote EPUBs as **downloaded local files** (reusing the existing
download-to-device feature). No server changes.

**Epic 1.1 — Integrate flureadium**
- [ ] Add dependency + iOS/Android native setup, committed and documented.
- [ ] Confirm `flutter analyze` + `flutter test` clean; app builds on iOS/Android.
- [ ] Update `AGENTS.md` / `ARCHITECTURE.md` notes for the new engine.

**Epic 1.2 — New EPUB reader behind the existing seam**
- [ ] Rewrite `features/reader/epub/epub_reader_screen.dart` on `ReadiumReaderWidget`.
- [ ] Keep `ReaderDispatcher` routing unchanged (still dispatches `epub` → this screen).
- [ ] Preserve shared chrome (top/bottom bars, `ReaderMessage`) and immersive mode.
- [ ] **Delete** the fragile epub.js machinery: CFI gating, the relocate watchdog,
      the mode-remount workaround, and the macOS WKWebView sub-resource hack.

**Epic 1.3 — Progress model (Locator ↔ lastLocation)**
- [ ] Map Readium `Locator` → `ComicSummary.lastLocation`; resume via `goToLocator`.
- [ ] One-time migration/reset of stored CFIs (local DB + treat server CFIs as stale).
- [ ] Keep `setProgress` semantics (completed bool, history append, guest-write 401).

**Epic 1.4 — Reading preferences**
- [ ] Map dark/light/sepia + font family/size onto `EPUBPreferences`
      (`backgroundColor`/`textColor`/`fontFamily`/`fontSize`/`verticalScroll`).
- [ ] Map reading mode (scroll vs paginated) onto Readium's nav config.
- [ ] Persist via the existing `readingModeProvider` / settings.

**Epic 1.5 — Remote EPUB via download-first**
- [ ] Route remote EPUB opens through download-to-device, then read the local file.
- [ ] Reconcile with the reader's existing per-open temp cache (unify the two paths).
- [ ] Graceful offline/error states.

**Epic 1.6 — Tests, cleanup, ship**
- [ ] Remove `flutter_epub_viewer` (and epub.js assets) once nothing references them.
- [ ] Widget/integration test for EPUB open + Locator resume (extend the fake server).
- [ ] Manual pass on iOS + Android; update `FEATURES.md`.

---

## Phase 2 — Unify PDF + CBZ + remote streaming

The bigger re-platforming: teach the server to emit Readium manifests, then fold the
other formats into one reader and stream remote content natively. Only commit once
Phase 1 has proven the engine.

**Epic 2.1 — Server: emit Readium WebPub/OPDS manifests** *(separate repo: CB8 server)*
- [ ] WebPub manifest per publication (reading order + resource URLs, auth-aware).
- [ ] OPDS feed for the library (enables interop + remote browsing).
- [ ] Versioned alongside the existing REST contract (don't break current clients).

**Epic 2.2 — Client: remote streaming via manifests**
- [ ] Open remote publications from a WebPub/OPDS URL with the better-auth cookie/header.
- [ ] Re-evaluate plugin here (flutter_readium exposes resource-fetch-with-headers;
      flureadium's OPDS is "not yet exposed" — upstream a PR or switch).
- [ ] Retire whole-file download as the *only* remote path (keep it as offline pin).

**Epic 2.3 — Fold PDF into the Readium reader**
- [ ] Render PDF via Readium; compare quality/perf/zoom against `pdfrx` honestly.
- [ ] Decide: migrate, or keep `pdfrx` if Readium is a regression (no dogma).

**Epic 2.4 — Fold CBZ into the Readium reader**
- [ ] Local CBZ via Readium image navigator (replaces `photo_view` + `cbz_archive`).
- [ ] Remote CBZ via manifest streaming (replaces `ComicPageSource` page-by-page).
- [ ] Preserve RTL/manga, single/double/scroll modes, first-page-as-cover.

**Epic 2.5 — Collapse the reader layer**
- [ ] One reader screen; `ReaderDispatcher` stops branching by extension.
- [ ] Remove `pdfrx`, `photo_view`, `scrollable_positioned_list`, archive-for-reading
      where no longer used; unify progress entirely on Locators.

**Epic 2.6 — OPDS interoperability (the bonus payoff)**
- [ ] Browse external OPDS catalogs in-app.
- [ ] Document CB8's OPDS feed so third-party readers can read the library.
- [ ] Close the `OPDS feeds` item in `FEATURES.md`.

---

## Cross-cutting risks / open questions

- **Remote streaming** depends on the separate server project; without it, Phase 2
  remote is download-only.
- **Plugin maturity:** flureadium is a small-publisher fork; `flutter_readium` is a
  recent reboot. Pin versions; watch both.
- **App size / build complexity:** Readium native pods add weight and CocoaPods friction.
- **Web/desktop:** Readium PDF has no web; macOS/Windows/Linux readers would need a
  fallback if those targets ever ship.

## Out of scope / explicitly deferred

- macOS / Windows / Linux EPUB rendering on Readium.
- Dictionary-lookup-on-selection.
- TTS / audiobooks / media overlays (available in the engine; not a current goal).
