# Requirements Document

## Introduction

The CB8 web library UI currently hides most navigation behind a hamburger-menu sidebar on mobile, forces users to open an overlay to switch between libraries/folders/tags, and uses small 130px cards that are hard to scan quickly. This feature replaces the mobile navigation model with a bottom tab bar and horizontal pill strips so that switching between books, comics, folders, and libraries is always one tap away, and enlarges the card grid for faster visual scanning on phone-sized screens. The feature also adds progress and format badges, improved empty states, a "Recently Read" sort option, and a headless server mode so CB8 can run on a NAS or server without the Electron GUI.

## Glossary

- **Web_App**: The vanilla-JS single-page application served from `src/web/`, accessed via a browser on any device.
- **Viewport_Breakpoint**: The CSS media query `max-width: 640px`. "Mobile" means the viewport width is ≤ 640px; "desktop" means > 640px.
- **Tab_Bar**: A `<nav id="tab-bar">` element fixed to the bottom of the viewport on mobile, containing five tabs: All, Recent, Collections, Folders, Tags.
- **Tab_Panel**: A `<div id="tab-panel">` element that slides up from above the Tab_Bar, covering the main content area, used to display a scrollable list of collections, folders, or tags.
- **Media_Strip**: A `<div class="media-strip">` containing three horizontal pill buttons (All, Comics, Books), rendered inside the library view above the Card_Grid on mobile, replacing the Navbar media-toggle buttons.
- **File_Type_Strip**: A `<div class="filetype-strip">` containing six horizontally scrollable pill buttons (All, EPUB, PDF, CBZ, CBR, MOBI) that filter the Card_Grid by file extension. Displayed on mobile only.
- **Card_Grid**: The CSS grid of comic/book cards rendered by `src/web/views/library.js` (`div.comics-grid`).
- **Sort_Sheet**: A bottom-sheet overlay (`<div id="sort-sheet">`) triggered by the mobile sort button, listing all sort options as tappable rows.
- **Sidebar**: The `<aside id="sidebar">` element used for navigation on desktop.
- **Navbar**: The `<nav id="navbar">` at the top of the page containing the brand, search input, and desktop sort/media controls.
- **Progress_Badge**: A small pill overlaid on the bottom-left of a card thumbnail showing reading progress — a rounded percentage for comics and PDFs (derived from `lastPage` / `pageCount`), or the label "In progress" for EPUBs with a saved `lastLocation`.
- **Format_Badge**: A small pill overlaid on the top-right of a card thumbnail showing the uppercase file extension (e.g., "EPUB", "CBZ"), derived from the `fileExt` field of the API response.
- **Empty_State**: A placeholder view with an icon and contextual message displayed when a section has no content to show.
- **CLS**: Cumulative Layout Shift — an undesirable visual effect where page elements move after initial render, typically caused by images loading late and resizing their containers.

## Requirements

### Requirement 1: Bottom Tab Bar for Mobile Navigation

**User Story:** As a mobile user, I want a fixed bottom tab bar so that I can switch between All, Recent, Collections, Folders, and Tags with a single tap without opening a sidebar.

#### Acceptance Criteria

1. WHILE the viewport is mobile, THE Web_App SHALL display the Tab_Bar fixed to the bottom of the viewport with five tabs in this order: All, Recent, Collections, Folders, Tags.
2. WHILE the viewport is mobile, THE Web_App SHALL hide the Sidebar and the hamburger toggle button.
3. WHEN a user taps the All tab, THE Web_App SHALL set `window.location.hash` to `#/`.
4. WHEN a user taps the Recent tab, THE Web_App SHALL set `window.location.hash` to `#/recent`.
5. WHEN a user taps the Collections, Folders, or Tags tab, THE Web_App SHALL open the corresponding Tab_Panel (see Requirement 2) without changing the hash route.
6. THE Tab_Bar SHALL visually highlight the currently active tab using the accent colour. The active tab is determined by the current hash route for All/Recent and by whether the corresponding Tab_Panel is open for Collections/Folders/Tags.
7. WHILE the viewport is desktop, THE Web_App SHALL hide the Tab_Bar and continue to display the Sidebar.
8. WHILE the reader overlay (`#reader-overlay`) is visible, THE Web_App SHALL hide the Tab_Bar.

### Requirement 2: Collections, Folders, and Tags Sub-Navigation

**User Story:** As a mobile user, I want tapping the Collections, Folders, or Tags tab to show me a scrollable list so that I can quickly pick one without opening a sidebar.

#### Acceptance Criteria

1. WHEN a user taps the Collections tab, THE Web_App SHALL open the Tab_Panel populated with a scrollable list of all libraries, each rendered as an `<a>` linking to `#/library/:id` with the library name and item count.
2. WHEN a user taps the Folders tab, THE Web_App SHALL open the Tab_Panel populated with a scrollable list of all folders, each rendered as an `<a>` linking to `#/folder/:id` with the folder name.
3. WHEN a user taps the Tags tab, THE Web_App SHALL open the Tab_Panel populated with a scrollable list of all tags, each rendered as an `<a>` linking to `#/tag/:name` with the tag name.
4. WHEN a user taps an item inside an open Tab_Panel, THE Web_App SHALL navigate to the item's hash route AND close the Tab_Panel.
5. WHEN a user taps the currently-active Collections/Folders/Tags tab a second time, THE Web_App SHALL close the Tab_Panel.
6. IF a Tab_Panel list is empty, THEN THE Web_App SHALL display a single line of muted text in place of the list ("No collections", "No folders", or "No tags").
7. WHILE a Tab_Panel is open, THE Tab_Bar SHALL remain visible on top of the Tab_Panel so the user can switch tabs or close the panel.

### Requirement 3: Inline Media-Type Filter Strip on Mobile

**User Story:** As a mobile user, I want to filter by All, Comics, or Books directly above the grid so that I can narrow results without reaching for the navbar.

#### Acceptance Criteria

1. WHILE the viewport is mobile AND the current view is a library view (All/Recent/Library/Folder/Tag), THE Web_App SHALL display the Media_Strip between the library header and the Card_Grid.
2. WHILE the viewport is mobile, THE Web_App SHALL hide the `.media-toggle` button group in the Navbar.
3. WHEN a user taps a pill in the Media_Strip, THE Web_App SHALL filter the Card_Grid to show only items matching the selected media type AND visually highlight that pill with the accent colour.
4. THE Media_Strip SHALL share state with the desktop Navbar media-toggle (switching on one resizes correctly to the other).
5. WHILE the viewport is desktop, THE Web_App SHALL hide the Media_Strip and display the Navbar `.media-toggle` buttons.

### Requirement 4: Larger, Scannable Card Grid on Mobile

**User Story:** As a mobile user, I want larger cover thumbnails so that I can visually identify books and comics at a glance while scrolling.

#### Acceptance Criteria

1. WHILE the viewport is mobile, THE Card_Grid SHALL use a minimum card width of 150px (increased from the current 130px).
2. WHILE the viewport is mobile, THE Card_Grid SHALL use a grid gap of at least 12px.
3. THE Card_Grid SHALL continue to use `grid-template-columns: repeat(auto-fill, minmax(var(--card-w), 1fr))` so the number of columns adapts to the available screen width.
4. WHILE the viewport is mobile, THE Card_Grid SHALL apply horizontal padding of at least 10px on each side.

### Requirement 5: Accessible Sort Control on Mobile

**User Story:** As a mobile user, I want to access sort options so that I can reorder the grid by title, date added, file size, page count, or recently read.

#### Acceptance Criteria

1. WHILE the viewport is mobile, THE Web_App SHALL display a sort button in the Navbar in place of the `<select id="sort-select">`. The button SHALL show a sort icon and the label of the currently active sort option.
2. WHEN a user taps the sort button, THE Web_App SHALL open the Sort_Sheet listing five options in this order: Title, Date added, File size, Pages, Recently Read.
3. WHEN a user selects an option from the Sort_Sheet, THE Web_App SHALL update the sort, re-render the Card_Grid, close the Sort_Sheet, and update the sort button label.
4. THE Sort_Sheet SHALL visually highlight the currently active sort option using the accent colour.
5. WHEN a user taps outside the Sort_Sheet or on a close affordance, THE Web_App SHALL close the Sort_Sheet without changing the sort.

### Requirement 6: Sticky, Search-Accessible Navbar on Mobile

**User Story:** As a mobile user, I want the search bar to remain visible at the top of the screen while I scroll so that I can start a search at any point.

#### Acceptance Criteria

1. WHILE the viewport is mobile, THE Navbar SHALL be fixed to the top of the viewport (`position: fixed`) with a `z-index` above the Card_Grid.
2. WHILE the viewport is mobile, THE Navbar SHALL continue to display the search input, and the search input SHALL expand to fill the available width after the brand and sort button.
3. THE Navbar SHALL NOT overlap the first row of the Card_Grid (main content SHALL be offset by at least the Navbar height).
4. WHILE the viewport is mobile, THE Navbar height SHALL remain at or below 52px.

### Requirement 7: No Desktop Regression

**User Story:** As a desktop user, I want the existing sidebar and navbar layout to remain unchanged so that my workflow is not disrupted.

#### Acceptance Criteria

1. WHILE the viewport is desktop, THE Web_App SHALL render the Sidebar, the Navbar `.media-toggle` buttons, and the `<select id="sort-select">` as they appear today, except that the sort select SHALL gain a new `<option value="lastRead">Recently Read</option>`.
2. WHILE the viewport is desktop, THE Web_App SHALL NOT render the Tab_Bar, Tab_Panel, Media_Strip, File_Type_Strip, or Sort_Sheet.
3. WHILE the viewport is desktop, THE desktop sort select SHALL remain in a flow position (not `position: fixed`).

### Requirement 8: File-Type Filter Chips

**User Story:** As a mobile user, I want to filter the grid by specific file format (EPUB, PDF, CBZ, CBR, MOBI) so that I can quickly find items in the format I want to read.

#### Acceptance Criteria

1. WHILE the viewport is mobile AND the current view is a library view, THE Web_App SHALL display the File_Type_Strip below the Media_Strip with six horizontally scrollable pill buttons in this order: All, EPUB, PDF, CBZ, CBR, MOBI.
2. WHEN a user taps a chip, THE Web_App SHALL filter the Card_Grid to show only items whose `fileExt` matches the selected format (case-insensitive), visually highlighting the selected chip with the accent colour.
3. WHEN the "All" chip is active, THE Web_App SHALL place no file-extension restriction on the query.
4. THE File_Type_Strip filter SHALL compose with the Media_Strip filter: both filters SHALL apply simultaneously to the Card_Grid (logical AND).
5. WHILE the viewport is desktop, THE Web_App SHALL NOT render the File_Type_Strip.

### Requirement 9: Progress Badges on Cards

**User Story:** As a user, I want to see my reading progress directly on each card so that I can tell at a glance which items I have started and how far along I am.

#### Acceptance Criteria

1. WHEN a card's record has `pageCount > 0` AND `lastPage !== null` AND `lastPage > 0`, THE Card_Grid SHALL render a Progress_Badge on the card with the text `Math.round((lastPage / pageCount) * 100) + '%'`, clamped to the range 1–100.
2. WHEN a card's record has `lastLocation !== null` AND the condition in 9.1 is not met, THE Card_Grid SHALL render a Progress_Badge on the card with the text "In progress".
3. WHEN a card's record has `lastPage === null` AND `lastLocation === null` (never opened), THE Card_Grid SHALL NOT render a Progress_Badge.
4. THE Progress_Badge SHALL be positioned at the bottom-left of the card thumbnail, above the existing `.progress-bar` and not overlapping the card title or the Format_Badge.

### Requirement 10: Format Badges on Cards

**User Story:** As a user, I want to see the file format on each card so that I can distinguish between EPUB, PDF, CBZ, CBR, and MOBI items without opening them.

#### Acceptance Criteria

1. WHEN a card's record has a non-empty `fileExt`, THE Card_Grid SHALL render a Format_Badge showing `fileExt.toUpperCase()` (e.g., "EPUB", "CBZ", "PDF").
2. WHEN a card's record has an empty or missing `fileExt`, THE Card_Grid SHALL render the Format_Badge with the fallback label `record.mediaType === 'book' ? 'Book' : 'Comic'`.
3. THE Format_Badge SHALL replace the current media-type badge in the card markup (no additional badge is rendered).
4. THE Format_Badge SHALL apply a book-style class (blue-tinted text) when `fileExt` is one of `epub`, `pdf`, `mobi`, and the default muted style otherwise.

### Requirement 11: Improved Empty States

**User Story:** As a user, I want clear, contextual messages when there is nothing to display so that I understand why the screen is empty.

#### Acceptance Criteria

1. WHEN the initial API request for the current view rejects or returns a non-2xx status, THE Web_App SHALL display an Empty_State with a cloud-off icon and the message "Cannot reach the server. Check your connection.".
2. WHEN the current view returns zero records AND a search term OR any filter (mediaType / fileExt / tag) is active, THE Web_App SHALL display an Empty_State with a search icon and the message "No items match your search or filters.".
3. WHEN the Recently Read view returns zero records AND no filter is active, THE Web_App SHALL display an Empty_State with a clock icon and the message "Nothing read yet. Open a book or comic to get started.".
4. WHEN any other view returns zero records AND no filter is active, THE Web_App SHALL display an Empty_State with a book icon and the message "No items found.".
5. WHEN a card thumbnail `<img>` fires an `error` event, THE Card_Grid SHALL replace the `src` with an inline SVG data URI showing a book-placeholder icon and SHALL NOT change the card dimensions.
6. EACH Empty_State SHALL render within the `#view-container` and not shift when transitioning between loading and empty.

### Requirement 12: Stable Card Dimensions

**User Story:** As a user, I want the card grid to remain visually stable while thumbnails load so that items do not jump around and I can tap the correct card.

#### Acceptance Criteria

1. THE `.card-thumb-wrap` element SHALL have `aspect-ratio: 2 / 3` so that each card reserves a fixed thumbnail area before the image loads.
2. WHILE a card thumbnail is loading, THE `.card-thumb-wrap` SHALL display a neutral placeholder background (`var(--surface)`).
3. WHEN a card thumbnail finishes loading, THE `<img>` SHALL fade from `opacity: 0` to `opacity: 1` over 200ms without changing the dimensions of the card or its wrapper.

### Requirement 13: Sort by Recently Read

**User Story:** As a user, I want to sort the library grid by "Recently Read" so that I can quickly return to items I was reading.

#### Acceptance Criteria

1. THE desktop `<select id="sort-select">` AND the mobile Sort_Sheet SHALL both include a "Recently Read" option.
2. WHEN the user selects the "Recently Read" option, THE Web_App SHALL send `sortBy=lastRead` and `sortOrder=desc` to the API.
3. WHEN the API receives `sortBy=lastRead`, THE server SHALL order records by `last_read` descending with records whose `last_read IS NULL` appearing after all records with a non-null `last_read`.
4. WHEN `sortBy=lastRead` is combined with any `sortOrder` value other than `desc`, THE server SHALL still treat `last_read IS NULL` records as the lowest ordering key (so they appear first in `asc`, last in `desc`).

### Requirement 14: Headless Server Mode

**User Story:** As a user running CB8 on a server, NAS, or headless machine, I want to start CB8 without the Electron GUI so that I can access my library purely through the web UI from any device on the network.

#### Acceptance Criteria

1. THE CB8 application SHALL run in headless mode when either `process.argv` includes `--headless` OR `process.env.CB8_HEADLESS === '1'`.
2. WHEN headless mode is active, THE CB8 application SHALL NOT call `new BrowserWindow(...)` and SHALL NOT display any Electron GUI.
3. WHEN headless mode is active, THE CB8 application SHALL initialize the `LibraryDatabase` using `app.getPath('userData') + '/library.db'` AND call `registerIpcHandlers(db, webServerRef)` (no `onRecentFilesChanged` callback).
4. WHEN headless mode is active, THE CB8 application SHALL start the embedded HTTP web server via `startWebServer(db, port)` regardless of the stored `web_server_enabled` app_meta value. THE `port` SHALL be derived from the stored `web_server_port` app_meta value, clamped to the range 1024–65535, falling back to 8008 if missing or invalid.
5. WHEN the web server starts in headless mode, THE CB8 application SHALL print `[CB8] Web UI: http://localhost:<port>` and `[CB8] LAN: http://<lan-ip>:<port>` to the console (already provided by the existing `startWebServer` listen callback).
6. WHILE headless mode is active, THE CB8 application SHALL keep the process alive serving HTTP requests until it receives `SIGINT` or `SIGTERM`.
7. WHEN the CB8 application receives `SIGINT` or `SIGTERM` in headless mode, THE CB8 application SHALL call `app.quit()` so the existing `before-quit` handler closes the HTTP server and archive handles before exit.
8. WHEN headless mode is active, THE `window-all-closed` handler SHALL NOT call `app.quit()` (the process must stay alive).
9. WHEN headless mode is active on macOS, THE CB8 application SHALL call `app.dock?.hide()` at startup.
10. WHEN initialization fails in headless mode (database open or server listen), THE CB8 application SHALL log the error to stderr and exit with `process.exit(1)` so supervisors can detect the failure.
