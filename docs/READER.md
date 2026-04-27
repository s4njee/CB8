# Reader Guide

CB8 has two reader modes: a **page reader** for `.cbz` / `.cbr` / `.pdf` and an **EPUB reader** for `.epub` / `.mobi`. Both are served by the embedded web UI, so the same shortcuts work in the desktop window and in any browser.

## Page reader (comics, PDFs)

### Navigation

| Input | Action |
| --- | --- |
| `→` / `Space` / click right side | Next page |
| `←` / click left side | Previous page |
| `Home` / `End` | First / last page |
| `f` | Toggle fullscreen |
| `Esc` | Close reader |

Touch devices: swipe left/right to turn pages, pinch to zoom, drag to pan when zoomed. **Tap** (without swiping) anywhere on the page to bring up the toolbar; the toolbar stays out of the way during swipes.

### View options

The toolbar exposes:

- **Zoom mode** — `fit-height`, `fit-width`, or `original`.
- **Direction** — `ltr` or `rtl` (manga).
- **Spread** — `single` page or `double` page facing layout.
- **Transition** — `slide`, `fade`, or `none`.

Preferences are stored per-browser in `localStorage` (`cb8.reader.prefs.v2`).

## EPUB reader

EPUBs render via [epub.js](https://github.com/futurepress/epub.js/) inside an iframe. Mobi files are converted to EPUB on import.

### Navigation

| Input | Action |
| --- | --- |
| `→` / `Space` | Next page |
| `←` | Previous page |
| `Esc` | Close reader |

The Table of Contents button opens the EPUB's nav document; click any chapter to jump.

### Typography

- **Theme** — Black or White. Applied to the page background, body text, and links.
- **Font size** — percentage of base; scales the entire book.
- **Font family** — pick from a list of 30+ Google Fonts (Bitter, Cormorant Garamond, Merriweather, Inter, etc.) with autocomplete. The font is fetched from `fonts.googleapis.com` and injected into the rendered chapter; subsequent chapters reuse the cached stylesheet.
- **Spread** — single page or two-page facing layout.

EPUB prefs are stored in `localStorage` under `cb8.epub.prefs.v1`.

## Library

### Multi-select

Hold `Shift` or `Ctrl`/`Cmd` while clicking to select a range or toggle individual entries. With one or more entries selected, the action bar shows **Add to folder**, **Add to collection**, **Tag**, and **Remove from library**.

### Folders and collections

Both are virtual — they don't move files on disk.

- **Folders** are personal: only you see your folders.
- **Collections** are shared across all users on the instance.

Right-click an entry (or use the action bar) to add it to a new or existing folder/collection. The "Add to folder" / "Add to collection" pickers open a modal with the existing names; a "+ New" entry at the top creates one inline.

### Search and tags

The top search bar matches title, author, and tag. Tags are user-set and free-form; click a tag in the entry detail panel to filter the library by it.

### Removing entries

**Remove from library** deletes the database row only. The file on disk is untouched, and a re-scan will pick it back up. There is no destructive delete from the UI.
