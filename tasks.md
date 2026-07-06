# CB8 — Readium reader adoption

Plan to replace the fragile epub.js EPUB reader with a Readium-based reader, and
(later) unify PDF + CBZ under the same engine. Organized as a **spike → Phase 1 →
Phase 2** sequence so the engine earns each increment before we commit to it.

> Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` cut/deferred

**Status (2026-07-06): Phase 0 and Phase 1 are DONE** — shipped 2026-06-30 (commit
`916ea97`, "feat: Readium EPUB reader…"), hardened 2026-07-01 (bugs.md #6–#9, #14)
and 2026-07-05/06 (debounced progress writes, whole-book "Ch 7/38 · 42%" scrubber
label). What shipped differently from the plan:

- **Engine: upstream `flutter_readium` (^0.1.1), not flureadium.** The plan picked
  the flureadium fork; the shipped reader is on `flutter_readium` (see
  `pubspec.yaml`), which the plan had flagged as the Phase-2 reconsideration — that
  re-evaluation effectively happened at Phase 1.
- **The reader is `lib/features/reader/unified_reader_screen.dart`** (named for the
  eventual Phase-2 unification; today it handles EPUB only), not a rewrite of
  `epub/epub_reader_screen.dart` — that file and all epub.js machinery are deleted.
- **Scroll mode was cut for EPUB**, not mapped: Readium scroll is per-resource
  (chapter), so EPUB offers only single/two-column paginated. Decision + the
  deferred custom-scroll idea live in [`later.md`](later.md).
- **Beyond the plan:** the shipped reader also gained ToC, in-book search, TTS
  (voice + rate), a full typography sheet, and a per-chapter scrubber with a
  whole-book position label.
- **Phase 2's server prerequisite partially exists already:** the CB8 server (now
  vendored under `webui/`, not a separate repo) serves per-comic **WebPub
  manifests** (`/api/comics/:id/manifest`) and an **OPDS feed** — see Epic 2.1.
  The Flutter client does not consume them yet.

Phase 2 (client-side manifest streaming, PDF/CBZ unification, OPDS browsing) is
the remaining open work.

---

## Decisions & constraints (the context that shapes everything below)

- **Engine:** ~~Readium, via **`flureadium`**~~ → **shipped on upstream
  `flutter_readium`** (BSD-3). The plan chose the flureadium fork with
  `flutter_readium` as the Phase-2 alternative; the cutover landed on upstream
  directly, which also moots the license point below.
- **License:** ~~LGPL-3.0 (flureadium) is **accepted**~~ — n/a; `flutter_readium`
  is BSD-3.
- **macOS:** **dropped** as a target for the Readium reader — flureadium's macOS
  native side is a stub. Mobile-first (iOS/Android) is the scope.
- **Dictionary-on-selection:** **not required** — the Readium plugin exposes no
  selection callback, and we're fine losing it. *(Confirmed lost: no dictionary
  code remains in `lib/` after the cutover.)*
- **The unification gate:** Readium consumes **Publications/manifests**, but the CB8
  server speaks a bespoke REST API (`/api/comics/:id/pages/:n`), not WebPub/OPDS.
  So **remote streaming through Readium requires server-side WebPub/OPDS** — that's
  Phase 2, and it overlaps the existing `OPDS feeds` item in `FEATURES.md`.
- **Position data resets once:** epub.js **CFI** → Readium **Locator** are not
  interchangeable; existing `lastLocation` values are lost on cutover.
- **PDF is a lateral trade:** `pdfrx` (native pdfium) is best-in-class; moving PDF
  onto Readium in Phase 2 is a deliberate trade for unification, not an upgrade.

---

## Phase 0 — Spike (gate before any adoption) — ✅ DONE (Go; late June 2026)

**Epic 0.1 — De-risk Readium on mobile**
Goal: prove the engine on real devices before committing to the reader rewrite.
- [x] Branch `spike/readium-epub`; add `flureadium`; native setup (iOS Podfile
      Readium pods; Android `MainActivity` → `FlutterFragmentActivity`, minSdk 24).
- [x] Debug screen: `openPublication` a sample EPUB → `ReadiumReaderWidget`.
- [x] Build + run on the **iPad simulator** and the **Android tablet**.
- [x] Verify **Locator resume**: capture `onTextLocatorChanged`, `goToLocator` back.
- [x] Verify a **dark preference** applies via `setEPUBPreferences`.
- [x] **Remote probe:** can it open a resource from a **URL with a custom auth
      header** at all? (Determines how much Phase 2 server work is really needed.)
- [x] Go/No-Go writeup. If No-Go, fall back to "own the epub.js bridge" instead.

---

## Phase 1 — EPUB on Readium (local + download-first) — ✅ DONE (2026-06-30)

The low-risk win: swap only the EPUB engine, keep the hybrid model intact by
reading remote EPUBs as **downloaded local files** (reusing the existing
download-to-device feature). No server changes.

**Epic 1.1 — Integrate the Readium plugin** *(shipped as `flutter_readium`, not
flureadium — see the status note up top)*
- [x] Add dependency + iOS/Android native setup, committed and documented.
- [x] Confirm `flutter analyze` + `flutter test` clean; app builds on iOS/Android.
- [x] Update `AGENTS.md` / `ARCHITECTURE.md` notes for the new engine.

**Epic 1.2 — New EPUB reader behind the existing seam**
- [x] Rewrite ~~`features/reader/epub/epub_reader_screen.dart`~~ on the Readium
      widget — landed as a new file, `features/reader/unified_reader_screen.dart`
      (the old screen + `epub/` dir are gone).
- [x] Keep `ReaderDispatcher` routing unchanged (still dispatches `epub` → this screen).
- [x] Preserve shared chrome (top/bottom bars, `ReaderMessage`) and immersive mode.
- [x] **Delete** the fragile epub.js machinery: CFI gating, the relocate watchdog,
      the mode-remount workaround, and the macOS WKWebView sub-resource hack.

**Epic 1.3 — Progress model (Locator ↔ lastLocation)**
- [x] Map Readium `Locator` → `ComicSummary.lastLocation`; resume via `goToLocator`.
- [x] One-time migration/reset of stored CFIs (local DB + treat server CFIs as stale).
- [x] Keep `setProgress` semantics (completed bool, history append, guest-write 401).

**Epic 1.4 — Reading preferences**
- [x] Map dark/light/sepia + font family/size onto `EPUBPreferences`
      (`backgroundColor`/`textColor`/`fontFamily`/`fontSize`/`verticalScroll`).
- [-] Map reading mode (scroll vs paginated) onto Readium's nav config —
      **scroll was cut for EPUB** (Readium scroll is per-chapter only; see
      `later.md`); only single/two-column paginated are mapped.
- [x] Persist via the existing `readingModeProvider` / settings.

**Epic 1.5 — Remote EPUB via download-first**
- [x] Route remote EPUB opens through download-to-device, then read the local file.
- [x] Reconcile with the reader's existing per-open temp cache (unify the two paths).
- [x] Graceful offline/error states.

**Epic 1.6 — Tests, cleanup, ship**
- [x] Remove `flutter_epub_viewer` (and epub.js assets) once nothing references them.
- [x] Widget/integration test for EPUB open + Locator resume (extend the fake server).
- [x] Manual pass on iOS + Android; update `FEATURES.md`.

---

## Phase 2 — Unify PDF + CBZ + remote streaming

The bigger re-platforming: teach the server to emit Readium manifests, then fold the
other formats into one reader and stream remote content natively. Only commit once
Phase 1 has proven the engine.

**Epic 2.1 — Server: emit Readium WebPub/OPDS manifests** *(the server now lives
in this repo under `webui/`, not a separate one — and this epic largely exists)*
- [x] WebPub manifest per publication (reading order + resource URLs, auth-aware) —
      `GET /api/comics/:id/manifest` (`webui/src/main/webServer/routes/webpub.ts`),
      served as `application/webpub+json`, upscale-aware.
- [x] OPDS feed for the library — `webui/src/main/webServer/routes/opds.ts`, served
      as `application/opds+json`, behind the same guest/auth gate as the REST API.
- [x] Versioned alongside the existing REST contract (registered as additional
      routes; nothing existing changed).

**Epic 2.2 — Client: remote streaming via manifests** *(the open half: the Flutter
client still downloads whole files — `RemoteSource` never touches `/manifest`)*
- [ ] Open remote publications from a WebPub/OPDS URL with the better-auth cookie/header.
- [x] Re-evaluate plugin here — resolved early: we're already on `flutter_readium`
      (which exposes resource-fetch-with-headers).
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
- [ ] Document CB8's OPDS feed so third-party readers can read the library
      (the feed itself exists — Epic 2.1).
- [ ] Update the OPDS gap note in `FEATURES.md` (server side is done; client-side
      OPDS browsing is what remains listed under Known gaps).

---

## Cross-cutting risks / open questions

- **Remote streaming** depends on the server side — now vendored under `webui/` and
  already emitting manifests (Epic 2.1); the remaining risk is client-side
  (Epic 2.2). Until then, Phase 2 remote is download-only.
- **Plugin maturity:** `flutter_readium` (what we ship on) is a recent reboot at
  ^0.1.1 — pin versions and watch releases; flureadium remains the fork fallback.
- **App size / build complexity:** Readium native pods add weight and CocoaPods friction.
- **Web/desktop:** Readium PDF has no web; macOS/Windows/Linux readers would need a
  fallback if those targets ever ship.

## Out of scope / explicitly deferred

- macOS / Windows / Linux EPUB rendering on Readium.
- Dictionary-lookup-on-selection.
- TTS / audiobooks / media overlays (available in the engine; not a current goal).
