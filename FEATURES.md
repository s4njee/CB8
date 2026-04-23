# Feature Ideas

Rough list — not prioritized, not committed to.

---

## Reading Experience

- **Continuous scroll mode** for manga/webtoon strips (vertical infinite scroll instead of page-at-a-time)
- **Double-page cover detection** — treat page 0 as single even in spread mode
- **Page cropping / auto-trim** — strip white/black borders automatically so content fills the screen
- **Brightness & contrast controls** — useful for scanned comics on OLED screens
- **Sepia / night tint overlay** — reduces eye strain without relying on OS dark mode
- **Guided view (panel-by-panel)** — automatically detect and step through individual panels
- **Fit-to-content zoom** — detect aspect ratio of each page and auto-pick fit-width vs fit-height
- **Persistent zoom per comic** — remember zoom level per book between sessions
- **Reading time estimate** — "~12 min left at your reading speed"
- **Auto-advance timer** — slideshow mode for fixed-layout comics

---

## Organization

- **Reading lists / queues** — ordered lists separate from unordered libraries
- **Series auto-detection** — group volumes by parsed series name from filename
- **Duplicate detection** — flag same file added twice under different paths
- **Smart collections** — saved filter presets (e.g. "unread · CBZ · added this month")
- **Star ratings** — 1–5 per comic, filterable
- **Custom cover** — override thumbnail with a specific page or an uploaded image
- **Bulk metadata edit** — select many, set series/tags/rating at once
- **Import from Calibre / Komga** — read their metadata.opf / series.json

---

## Discovery

- **"Continue reading" shelf** — in-progress items sorted by most recently opened
- **"New additions" shelf** — last N items added, separate from date-sorted grid
- **Random pick button** — open a random unread comic from current view
- **Reading streak / stats** — pages read per day, session history chart
- **Related by series** — sidebar showing other volumes when a comic is open

---

## EPUB Improvements

- **Custom fonts** — load a font file and apply it to EPUB body
- **Line-height / margin controls** — separate from font size
- **Highlight & annotation** — save highlighted passages with notes; exportable to Markdown
- **Dictionary lookup** — right-click word → definition (using system dictionary or bundled one)
- **Table of contents panel** — show EPUB NCX/nav as a sidebar tree
- **Reading progress by chapter** — not just % but "Chapter 4 of 11"

---

## Web UI Specific

- **Offline PWA** — service worker cache so recently read items work without server
- **Keyboard shortcut reference** — `?` to open cheat sheet overlay
- **Per-user reading preferences** — font size, zoom, direction stored server-side (follow the user across devices)
- **Shared reading / sync** — two users reading the same book see each other's position (book club mode)
- **Download for offline** — serve CBZ/EPUB to browser for local fallback
- **Mobile home screen install prompt** — PWA add-to-homescreen nudge

---

## Electron Specific

- **System tray** — background scan notification without keeping window open
- **Hardware media keys** — Page Up/Down on keyboard or presentation clicker
- **Touch Bar support** (Mac) — page slider, zoom, bookmark on Touch Bar
- **Local file watching** — inotify/FSEvents on scan folders, auto-ingest new files
- **Export reading log** — CSV of what you read, when, and how far
- **Printing** — send current page or range to system print dialog

---

## Admin / Library Management

- **Scan scheduling** — cron-style "rescan every night at 2 AM"
- **Storage analytics** — breakdown by format, series, library; identify space hogs
- **Broken file detection** — flag CBZs that fail to extract during scan
- **Cover regeneration** — re-extract thumbnails for selected items
- **Multi-user invite links** — time-limited token instead of manual user creation
- **Read-only guest mode toggle** — per-library public access without login
- **Audit log** — who opened what, when (opt-in)

---

## Accessibility

- **High-contrast UI theme**
- **Screen reader labels on all controls**
- **Configurable swipe sensitivity** (for motor accessibility)
- **Large-text UI mode** independent of OS scaling
