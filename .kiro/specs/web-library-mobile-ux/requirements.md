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
- **Drop_Zone**: A full-viewport overlay (`<div id="drop-overlay">`) that appears when a user drags files over the Web_App, providing a visual target and instructional label ("Drop to add to library") for the drag-and-drop upload interaction.
- **Context_Menu**: A floating menu (`<div class="context-menu">`) that appears on right-click (desktop) or long-press (mobile) on a card or list item, providing contextual actions such as "Add to collection…", "Add to folder…", "Rename", and "Delete".
- **Confirmation_Dialog**: A browser-native `window.confirm()` dialog used to confirm destructive operations (delete library, delete folder, remove comics) before executing them.
- **Tag_Editor**: A UI component within the card Context_Menu or comic detail view that allows admin users to add, remove, and manage tags on selected comics.

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

### Requirement 15: Admin Upload via Modal

**User Story:** As an admin user, I want to upload files through a modal dialog with a file picker and progress tracking so that I can add items to the library from any device without drag-and-drop.

#### Acceptance Criteria

1. WHEN an authenticated admin user opens the admin menu and selects "Upload comics", THE Web_App SHALL display a modal dialog containing a drop zone, file picker buttons ("Choose files…" and "Choose folder…"), and an upload queue.
2. WHEN the admin selects files via the file picker or drops files onto the modal drop zone, THE Web_App SHALL add only files with supported extensions (.epub, .pdf, .cbz, .cbr, .mobi) to the upload queue and display each file's name and size.
3. WHEN the admin clicks the "Upload" button, THE Web_App SHALL upload each queued file sequentially to `POST /api/admin/upload` using a raw-body POST with `X-CB8-Filename` and `X-CB8-Relpath` headers (percent-encoded), and display per-file progress and an overall progress bar.
4. WHEN a file upload completes, THE Web_App SHALL mark the file as "Added", "Already in library" (skipped), or display the error message.
5. WHEN all uploads complete with zero failures, THE Web_App SHALL auto-close the modal after a short delay and show a toast notification with the count of added items.
6. IF any upload fails, THEN THE Web_App SHALL keep the modal open, display the failure count, and allow the admin to close manually.
7. WHEN at least one file is successfully added, THE Web_App SHALL dispatch a `cb8:library-changed` event to refresh the sidebar and Card_Grid.

### Requirement 16: Drag-and-Drop File Upload to Library

**User Story:** As an admin user, I want to drag and drop files (EPUB, PDF, CBZ, CBR, MOBI) onto the web UI library view so that I can quickly add items to the library without navigating through menus.

#### Acceptance Criteria

1. THE Web_App SHALL prevent the browser's default drag-and-drop behaviour (file download dialog or navigation) on the `document` by calling `preventDefault()` on `dragover` and `drop` events.
2. WHILE an authenticated admin user drags files over the Web_App, THE Web_App SHALL display the Drop_Zone overlay with the label "Drop to add to library".
3. WHEN a non-authenticated user drags files over the Web_App, THE Web_App SHALL NOT display the Drop_Zone overlay and SHALL allow the browser's default drag-and-drop behaviour.
4. WHEN an authenticated admin user drops files onto the Web_App, THE Web_App SHALL gather all dropped files (including files within dropped folders, recursively) and filter to only files with supported extensions (.epub, .pdf, .cbz, .cbr, .mobi).
5. IF the drop contains zero supported files, THEN THE Web_App SHALL display a toast notification with the message "No supported files in drop (.cbz .cbr .epub .pdf .mobi)".
6. WHEN supported files are gathered from a drop, THE Web_App SHALL upload each file to the server via `POST /api/admin/upload` and display a toast notification indicating the upload count (e.g., "Uploading 3 files…").
7. WHEN the server receives a `POST /api/admin/upload` request, THE server SHALL validate that the request is authenticated, that the `X-CB8-Filename` header is present and percent-encoded, and that the file extension is one of .epub, .pdf, .cbz, .cbr, or .mobi.
8. WHEN the server receives a valid upload, THE server SHALL save the file to the `web-uploads/` directory inside the user data directory, preserving any relative path structure from the `X-CB8-Relpath` header.
9. WHEN the server saves an uploaded file, THE server SHALL add the file to the library database using the same ingestion logic as the `library:add-files` IPC handler (cover extraction, page count detection, metadata population).
10. IF the uploaded file already exists in the library database (matched by destination path), THEN THE server SHALL skip the file without error and return `{ added: false, skipped: true }`.
11. IF the uploaded file has an unsupported extension, THEN THE server SHALL return HTTP 415 with an error message "Unsupported file type".
12. IF the resolved destination path escapes the `web-uploads/` base directory (path traversal), THEN THE server SHALL return HTTP 400 with an error message.
13. WHEN all uploads from a drop complete, THE Web_App SHALL display a toast notification summarizing the result (e.g., "Added 3 files" or "Added 2, failed 1") and dispatch a `cb8:library-changed` event to refresh the sidebar and Card_Grid.
14. WHEN the user drags files away from the Web_App or the drop completes, THE Web_App SHALL hide the Drop_Zone overlay.

### Requirement 17: Create, Rename, and Delete Libraries (Collections) via Web UI

**User Story:** As an admin user, I want to create, rename, and delete libraries (collections) from the web UI so that I can organize my content without needing the desktop Electron GUI.

#### Acceptance Criteria

1. WHEN an authenticated admin user activates the "New collection" action from the Collections Tab_Panel or Sidebar, THE Web_App SHALL display a prompt for the collection name and media type (comic or book), and send a `POST /api/libraries` request with `{ name, mediaType }` to create the library.
2. WHEN an authenticated admin user long-presses (mobile) or right-clicks (desktop) a library item in the Tab_Panel or Sidebar, THE Web_App SHALL display a Context_Menu with "Rename" and "Delete" options.
3. WHEN an authenticated admin user selects "Rename" from the library Context_Menu, THE Web_App SHALL display an inline text input pre-filled with the current name, and on confirmation send a `PUT /api/libraries/:id` request with `{ name }`.
4. WHEN the server receives a `PUT /api/libraries/:id` request, THE server SHALL validate that the request is authenticated, that the `name` field is a non-empty string, and update the library name in the database.
5. WHEN an authenticated admin user selects "Delete" from the library Context_Menu, THE Web_App SHALL display a Confirmation_Dialog with the message "Delete library \"{name}\"? This will not delete any files." and on confirmation send a `DELETE /api/libraries/:id` request.
6. WHEN the server receives a `DELETE /api/libraries/:id` request, THE server SHALL validate that the request is authenticated and delete the library and its comic associations from the database without deleting any files on disk.
7. WHEN a library is successfully created, renamed, or deleted, THE Web_App SHALL dispatch a `cb8:library-changed` event to refresh the Sidebar, Tab_Panel, and Card_Grid.
8. IF a non-authenticated user attempts to create, rename, or delete a library, THEN THE server SHALL return HTTP 401 with the message "Unauthorized".
9. IF the library name conflicts with an existing library, THEN THE server SHALL return HTTP 409 with the message "A collection with that name already exists".

### Requirement 18: Create, Rename, and Delete Folders via Web UI

**User Story:** As an admin user, I want to create, rename, and delete folders from the web UI so that I can organize comics into folder groups without needing the desktop Electron GUI.

#### Acceptance Criteria

1. WHEN an authenticated admin user activates the "New folder" action from the Folders Tab_Panel, Sidebar, or card Context_Menu, THE Web_App SHALL display a prompt for the folder name and send a `POST /api/folders` request with `{ name, comicIds }` to create the folder.
2. WHEN the server receives a `POST /api/folders` request, THE server SHALL validate that the request is authenticated, that the `name` field is a non-empty string, create the folder in the database, and optionally add the provided `comicIds` to the folder.
3. WHEN an authenticated admin user long-presses (mobile) or right-clicks (desktop) a folder item in the Tab_Panel or Sidebar, THE Web_App SHALL display a Context_Menu with "Rename" and "Delete" options.
4. WHEN an authenticated admin user selects "Rename" from the folder Context_Menu, THE Web_App SHALL display an inline text input pre-filled with the current name, and on confirmation send a `PUT /api/folders/:id` request with `{ name }`.
5. WHEN the server receives a `PUT /api/folders/:id` request, THE server SHALL validate that the request is authenticated, that the `name` field is a non-empty string, and update the folder name in the database.
6. WHEN an authenticated admin user selects "Delete" from the folder Context_Menu, THE Web_App SHALL display a Confirmation_Dialog with the message "Delete folder \"{name}\"? This will not delete any files." and on confirmation send a `DELETE /api/folders/:id` request.
7. WHEN the server receives a `DELETE /api/folders/:id` request, THE server SHALL validate that the request is authenticated and delete the folder and its comic associations from the database without deleting any files on disk.
8. WHEN a folder is successfully created, renamed, or deleted, THE Web_App SHALL dispatch a `cb8:library-changed` event to refresh the Sidebar, Tab_Panel, and Card_Grid.
9. IF a non-authenticated user attempts to create, rename, or delete a folder, THEN THE server SHALL return HTTP 401 with the message "Unauthorized".

### Requirement 19: Add and Remove Comics from Libraries via Web UI

**User Story:** As an admin user, I want to add comics to a library or remove them from a library through the web UI so that I can curate collections without needing the desktop Electron GUI.

#### Acceptance Criteria

1. WHEN an authenticated admin user opens the card Context_Menu, THE Web_App SHALL include an "Add to collection…" submenu listing all available libraries, each as a tappable option.
2. WHEN an authenticated admin user selects a library from the "Add to collection…" submenu, THE Web_App SHALL send a `POST /api/libraries/:id/comics` request with `{ comicIds }` containing the selected comic IDs and display a toast notification confirming the action.
3. WHEN an authenticated admin user selects "+ New collection…" from the "Add to collection…" submenu, THE Web_App SHALL prompt for a collection name, create the library via `POST /api/libraries`, then add the selected comics to the new library via `POST /api/libraries/:id/comics`.
4. WHILE viewing a library's contents (route `#/library/:id`), WHEN an authenticated admin user activates a "Remove from collection" action on selected cards, THE Web_App SHALL send a `DELETE /api/libraries/:id/comics` request with `{ comicIds }` and remove the cards from the grid.
5. WHEN the server receives a `DELETE /api/libraries/:id/comics` request, THE server SHALL validate that the request is authenticated and remove the specified comics from the library association without deleting the comic records or files.
6. WHEN comics are successfully added to or removed from a library, THE Web_App SHALL dispatch a `cb8:library-changed` event to refresh the Sidebar and Card_Grid.
7. IF a non-authenticated user attempts to add or remove comics from a library, THEN THE server SHALL return HTTP 401 with the message "Unauthorized".

### Requirement 20: Add and Remove Comics from Folders via Web UI

**User Story:** As an admin user, I want to add comics to a folder or remove them from a folder through the web UI so that I can organize comics into groups without needing the desktop Electron GUI.

#### Acceptance Criteria

1. WHEN an authenticated admin user opens the card Context_Menu, THE Web_App SHALL include an "Add to folder…" submenu listing all available folders plus a "+ New folder…" option, each as a tappable option.
2. WHEN an authenticated admin user selects a folder from the "Add to folder…" submenu, THE Web_App SHALL send a `POST /api/folders/:id/comics` request with `{ comicIds }` containing the selected comic IDs and display a toast notification confirming the action.
3. WHEN an authenticated admin user selects "+ New folder…" from the "Add to folder…" submenu, THE Web_App SHALL prompt for a folder name, create the folder via `POST /api/folders` with `{ name, comicIds: [] }`, then add the selected comics to the new folder via `POST /api/folders/:id/comics`.
4. WHILE viewing a folder's contents (route `#/folder/:id`), WHEN an authenticated admin user activates a "Remove from folder" action on selected cards, THE Web_App SHALL send a `DELETE /api/folders/:id/comics` request with `{ comicIds }` and remove the cards from the grid.
5. WHEN the server receives a `POST /api/folders/:id/comics` request, THE server SHALL validate that the request is authenticated and add the specified comics to the folder.
6. WHEN the server receives a `DELETE /api/folders/:id/comics` request, THE server SHALL validate that the request is authenticated and remove the specified comics from the folder association without deleting the comic records or files.
7. WHEN comics are successfully added to or removed from a folder, THE Web_App SHALL dispatch a `cb8:library-changed` event to refresh the Sidebar and Card_Grid.
8. IF a non-authenticated user attempts to add or remove comics from a folder, THEN THE server SHALL return HTTP 401 with the message "Unauthorized".

### Requirement 21: Tag Management via Web UI

**User Story:** As an admin user, I want to add, remove, and manage tags on comics through the web UI so that I can categorize and organize my library without needing the desktop Electron GUI.

#### Acceptance Criteria

1. WHEN an authenticated admin user opens the card Context_Menu, THE Web_App SHALL include a "Tags…" option that opens a Tag_Editor showing the current tags on the selected comic(s).
2. WHEN an authenticated admin user adds a tag in the Tag_Editor, THE Web_App SHALL send a `PUT /api/comics/:id/tags` request with `{ tags }` containing the full updated tag list for the comic.
3. WHEN an authenticated admin user removes a tag in the Tag_Editor, THE Web_App SHALL send a `PUT /api/comics/:id/tags` request with `{ tags }` containing the updated tag list with the tag removed.
4. WHEN the server receives a `PUT /api/comics/:id/tags` request, THE server SHALL validate that the request is authenticated, compute the diff between the current tags and the provided tags, and add or remove tags accordingly.
5. WHEN an authenticated admin user selects "Rename tag" from a tag Context_Menu in the Tags Tab_Panel, THE Web_App SHALL display an inline text input pre-filled with the current tag name, and on confirmation send a `PUT /api/tags/:name` request with `{ newName }`.
6. WHEN the server receives a `PUT /api/tags/:name` request, THE server SHALL validate that the request is authenticated and rename the tag across all comics in the database.
7. WHEN an authenticated admin user selects "Delete tag" from a tag Context_Menu in the Tags Tab_Panel, THE Web_App SHALL display a Confirmation_Dialog with the message "Delete tag \"{name}\"? This will remove the tag from all comics." and on confirmation send a `DELETE /api/tags/:name` request.
8. WHEN the server receives a `DELETE /api/tags/:name` request, THE server SHALL validate that the request is authenticated and remove the tag from all comics in the database.
9. WHEN tags are successfully modified, THE Web_App SHALL dispatch a `cb8:library-changed` event to refresh the Tags Tab_Panel and Card_Grid.
10. IF a non-authenticated user attempts to modify tags, THEN THE server SHALL return HTTP 401 with the message "Unauthorized".
