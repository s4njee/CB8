# Ideas

Performance improvements, feature ideas, and quality-of-life enhancements for CB8.

---

## Performance

### Page prefetching / read-ahead cache

`getPage` extracts a single page on demand each time the user navigates forward.
Prefetch the next 2-3 pages into a bounded LRU cache while the current page is displayed so that forward navigation feels instant.
Backward navigation benefits too if recently viewed pages stay in the cache.

### CBR on-demand extraction

> See also: **REFACTOR.md § Large Archive Memory Use**

`openCbr` extracts every image into memory at open time. For a 200 MB RAR with
50 pages, this spikes resident memory. Switch to a two-pass model:

1. First pass reads the file header list (entry names + offsets) without extracting.
2. `getCbrPage` extracts a single entry when requested, backed by the read-ahead cache above.

`node-unrar-js` may not support single-entry extraction today; if not, keep a
bounded sliding window of extracted pages instead of the full set.

### Thumbnail generation at scan time — resize before storing

`processFile` stores the raw cover image bytes straight from the archive.
A full-resolution 3000×4500 JPEG cover wastes space and slows grid rendering.
Resize covers to ~300 px wide (preserving aspect ratio) before inserting the BLOB.
Options: `sharp` (fastest, native), or an in-process canvas encoder.

### FTS5 full-text search

> See also: **REFACTOR.md § Library Query Scalability**

`queryComics` uses `LIKE '%term%'` which forces a full table scan on every
keystroke. Add an SQLite FTS5 virtual table mirroring `title` and `file_path`,
then use `MATCH` queries. This keeps substring-ish search while using an
inverted index under the hood.

### Debounced search input

Even with FTS5, firing a DB query on every keypress is wasteful. Debounce the
search input in the renderer (200-300 ms) so the query only runs when the user
pauses typing.

### Batch `rowToRecord` tag loading

`rowToRecord` runs a separate `SELECT ... FROM tags` query for *every* comic
record returned by a query. For a page of 50 results, that's 50 extra round
trips to SQLite. Fetch all tags for the returned IDs in a single query and join
them in-memory.

### Virtual scrolling — finish the migration

> See also: **REFACTOR.md § Library Grid Virtualization**

`LibraryView.tsx` is 50 KB and appears to do its own infinite-loading grid.
Replace it with `@tanstack/react-virtual` (already in `package.json`) so only
visible rows plus one buffer row render. This is critical for the 100K-comic
goal.

### Lazy thumbnail loading in the grid

When a library cell scrolls into view, its cover thumbnail is fetched via IPC.
Use `IntersectionObserver` (or the virtualizer's visibility info) to load
thumbnails only for visible cells. Cancel in-flight requests for cells that
scroll away before the response arrives.

---

## New Features

### Reading progress / bookmarks

Save the last-read page index per comic in the database. When re-opening a
comic, offer to resume from the saved position. Schema change:

```sql
ALTER TABLE comics ADD COLUMN last_page INTEGER DEFAULT NULL;
ALTER TABLE comics ADD COLUMN last_read TEXT DEFAULT NULL;
```

Display a progress bar or badge on the library grid card.

### "Continue reading" shelf

Show a horizontal strip at the top of the library view with the most recently
read comics, sorted by `last_read DESC`. One click resumes where the user left
off.

### Two-page spread mode

Many comics are drawn for side-by-side reading. Add a toggle (e.g. `D` key) to
display two pages at once, scaling both to fit the viewport. Handle odd page
counts gracefully (first page solo, then pairs). Optionally detect landscape
pages and display them solo.

### Manga / right-to-left mode

Reverse the page navigation direction and two-page spread order for manga.
A per-comic or global toggle in settings. Store the preference in the database
or a config file.

### Zoom and pan

Allow the user to zoom into a page (scroll wheel or pinch) and pan around.
Reset zoom on page change. Even a simple 2× zoom with click-to-center would be
useful for reading dialog-heavy pages on smaller screens.

### Fit-width vs fit-height vs fit-page

The current scaling always fits the full page in the viewport. Add toggle modes:

- **Fit width**: scale so page width = viewport width (vertical scroll to read tall pages)
- **Fit height**: scale so page height = viewport height (horizontal scroll for wide pages)
- **Fit page** (current): scale so the full page is visible

### Slideshow / auto-advance mode

Auto-advance pages on a configurable timer (e.g. 5-30 seconds). Useful for
hands-free reading. Pause on any user input.

### Keyboard shortcut overlay

Show an overlay (toggle with `?` or `H`) listing all keyboard shortcuts:
navigation, fullscreen, view modes, etc.

### Smart collections / saved searches

Let users save search+tag filter combos as virtual shelves.
For example: tag = "Marvel" AND title contains "Spider". The saved search
re-executes when opened, so it always reflects the current library.

### Series grouping / auto-detect

Parse issue numbers from filenames (e.g. `Amazing Spider-Man #042 (2023).cbz`)
and group comics into series automatically. Display series as expandable groups
or as folders in the sidebar.

### Metadata extraction from ComicInfo.xml

Many CBZ files include a `ComicInfo.xml` (Comic Rack standard) with structured
metadata: series, issue number, writer, artist, publisher, year, etc.
Parse this file during scan and store the extra fields. This enables richer
sorting, filtering, and display.

### Import / export library

Export the library database (minus thumbnails) as JSON or CSV for backup or
migration. Import from the same format to merge into an existing DB.

### Duplicate detection

During scan, detect potential duplicates by comparing file size + page count (or
hash a few pages). Surface duplicates in the UI so the user can clean up.

### OPDS catalog support

Expose the library as an OPDS feed (local HTTP server) or connect to external
OPDS catalogs to browse and download comics. This is a bigger feature but it
integrates the reader into a wider ecosystem.

---

## UX / Visual Polish

### Dark / light theme toggle

The reader background is black, which is good for reading, but the library UI
could offer a light theme for daytime use. Store the preference and toggle via
a button or system theme detection.

### Animated page transitions

Add a subtle slide or crossfade transition between pages. Keep it fast (150-
200 ms CSS transition) and allow disabling in settings for users who prefer
instant rendering.

### Grid density control

Let the user adjust how many columns the library grid has (or the thumbnail
size). A slider in the toolbar that updates `--columns` CSS variable.

### Drag-and-drop reordering in folders

Allow reordering comics within a folder by drag-and-drop. Store the custom
sort order in a `position` column on `folder_comics`.

### Context menus

Right-click a comic in the grid to access actions: open, tag, move to folder,
remove, show in file manager, copy path. Electron's `Menu.buildFromTemplate`
makes this straightforward.

### Progress indicator during archive open

Large CBR files take time to extract. Show a loading spinner or progress bar
while `open()` runs so the user knows the app hasn't frozen.

### Toast notifications

Use a lightweight toast system instead of blocking alert dialogs for non-
critical messages: "Scan complete: 42 new comics added", "Tag removed", etc.

### Accessible keyboard focus indicators

Ensure all interactive elements (grid cells, buttons, inputs) have visible
focus rings for keyboard-only users. The virtual grid should support arrow-key
navigation between cells.

---

## Developer Experience

### Complete the property test suite

Tasks.md shows 14 property tests marked as optional (`*`). Writing these
improves confidence in the shared utilities and database layer. The `fast-check`
dependency is already installed.

### Storybook or component playground

A Storybook instance (or a simple `/dev` route) for developing and testing
UI components in isolation — useful for the library grid, status bar, reader
view, and any new components.

### CI pipeline

Set up GitHub Actions (or similar) to run `pnpm run typecheck`, `pnpm test`,
and `pnpm run package` on every push. Catch regressions before merge.

### Electron auto-update

Integrate `electron-updater` so the app can check for and install updates
without requiring the user to download a new installer manually.

### Logging infrastructure

Replace scattered `console.error` / `console.warn` calls with a structured
logger (e.g. `electron-log`) that writes to a file, respects log levels, and
can be tailed for debugging.

### JPEG XL decode pipeline

> See also: **REFACTOR.md § JPEG XL Decode Pipeline**

`imageDecoder.ts` is a pass-through stub. Implement the real WASM-based JXL
decode → PNG conversion pipeline so `.jxl` pages and covers display correctly.
The `@jsquash/jxl` package is already in `dependencies`.

### Build system cleanup

> See also: **REFACTOR.md § Build System Cleanup**

Remove the stale root `CMakeLists.txt` from the Qt/C++ prototype era. It
references deleted source files and misleads contributors.
