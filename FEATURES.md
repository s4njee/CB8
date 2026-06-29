# Feature gaps

A checklist of features common in other self-hosted comic/e-book readers — **Kavita**,
**Komga**, **Calibre-Web**, **Mihon/Tachiyomi** — measured against CB8. It started as a
pure wishlist; some items have since been implemented.

Legend: `[x]` done · `[~]` partially done (see the note on the line) · `[ ]` not started.

For what CB8 *does* have, see [`README.md`](README.md). Architecture context for several of
these is in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Formats

- [~] **CBR / RAR** comic archives (and 7z / CB7, CBT/tar) — **CBT (tar) added**; CBR/RAR and CB7/7z still need a native decoder
- [ ] **MOBI / AZW3 / KEPUB / FB2** e-book formats
- [ ] **Loose image folders** as a "comic" (directory of JP/PNG/WebP)
- [~] **AVIF / JXL** page images — extensions recognized + undecodable pages degrade gracefully; full JXL decode still needs a native codec
- [ ] **Audiobook** support (M4B / MP3) — Kavita-style

## Reading experience

- [x] **Right-to-left / manga reading direction**
- [ ] **Webtoon / long-strip** vertical mode with no page gaps
- [ ] **Wide-page splitting** (auto-split or swipe across double-spread pages)
- [x] **First-page-as-cover** offset for two-page spread mode
- [ ] **Image fit options** — fit width / fit height / original / fill
- [x] **Reading themes for EPUB** — dark / light / sepia
- [ ] **Per-book brightness / blue-light / color filters**
- [ ] **EPUB typography controls** beyond font size — font family, line spacing, margins, justification, custom CSS
- [ ] **In-book bookmarks UI** (the DB has a `bookmarks` table, but no reader UI to add/list/jump to them)
- [ ] **Highlights, annotations & notes**
- [ ] **Text-to-speech / read-aloud**
- [x] **Dictionary lookup** on selection (EPUB) — looks the selection up via dictionaryapi.dev
- [ ] **Margin cropping / auto-trim** for comic pages
- [ ] **Auto-scroll** (hands-free) for webtoons/long pages

## Library & organization

- [ ] **Multi-user accounts** with per-user progress and permissions/roles
- [ ] **Reading lists** — ordered, cross-series curated lists
- [ ] **Want-to-read / on-deck** shelf
- [ ] **Ratings & reviews**
- [ ] **Reading stats dashboard** — time read, pages, streaks, per-series progress
- [ ] **Saved / smart filters** (persisted, composable query filters)
- [ ] **Metadata editing UI** — edit title, series, authors, tags, summary in-app
- [ ] **External metadata scraping** — ComicVine / Google Books / AniList / Open Library
- [ ] **ComicInfo.xml & EPUB OPF ingestion** for rich metadata (genres, age rating, people, publisher)
- [ ] **Multiple libraries / watched folders** with scheduled rescans and file-watching
- [ ] **Duplicate detection**
- [ ] **Custom / selectable covers** per item and series
- [ ] **Age-rating / content restrictions**

## Sync & ecosystem

- [ ] **OPDS / OPDS-PS feeds** (read the library in third-party apps)
- [ ] **Mihon/Tachiyomi extension API** (browse CB8 as a source in those apps)
- [ ] **Kobo sync** (Kavita-style native Kobo device sync)
- [ ] **KOReader progress sync**
- [ ] **Managed offline downloads** — pin items for offline on mobile (currently remote books only cache to a temp file per open)
- [ ] **Send-to-device / email** a book

## Platform & app

- [ ] **First-class Windows & Linux** builds (currently scaffolded; Linux EPUB engine unfinished)
- [ ] **Web / browser reader** from the Flutter client (the separate CB8 server has its own SPA)
- [ ] **Light theme / theme switching** (app is `ThemeMode.dark` only)
- [ ] **Localization / i18n**
- [ ] **Accessibility pass** — screen-reader labels, font scaling, high-contrast

---

> Notes: items reflect CB8 as of this writing. A few primitives exist in the schema or
> server contract but lack client UX (e.g. the `bookmarks` table, parsed/scraped metadata
> fields) — those are called out inline above. Update the relevant box when a gap is closed.
