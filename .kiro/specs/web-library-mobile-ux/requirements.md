# Requirements Document

## Introduction

The CB8 web library UI currently hides most navigation behind a hamburger-menu sidebar on mobile, forces users to open an overlay to switch between libraries/folders/tags, and uses small 130px cards that are hard to scan quickly. This feature replaces the mobile navigation model with a tab bar and horizontal pill strips so that switching between books, comics, folders, and libraries is always one tap away, and the card grid is optimized for fast visual scanning on phone-sized screens.

## Glossary

- **Web_App**: The vanilla-JS single-page application served from `src/web/`, accessed via a browser on any device.
- **Tab_Bar**: A fixed bottom navigation bar visible only on mobile viewports (≤ 640px) that provides single-tap access to top-level sections (All, Recent, Collections, Folders, Tags).
- **Media_Strip**: A horizontally scrollable row of pill-shaped filter buttons (All / Comics / Books) displayed inline above the card grid on mobile, replacing the navbar media-toggle buttons.
- **Card_Grid**: The CSS grid of comic/book cards rendered by `views/library.js`.
- **Sort_Sheet**: A small bottom-sheet or dropdown triggered from the mobile UI that exposes the sort options currently hidden on mobile.
- **Sidebar**: The `<aside id="sidebar">` element used for navigation on desktop viewports.
- **Navbar**: The `<nav id="navbar">` element at the top of the page.
- **Viewport_Breakpoint**: The 640px max-width CSS media query that distinguishes mobile from desktop layout.
- **File_Type_Chip**: A tappable pill-shaped filter button representing a specific file format (EPUB, PDF, CBZ, CBR, MOBI), displayed in a horizontal strip to narrow the Card_Grid by format.
- **Progress_Badge**: A visual indicator overlaid on a card thumbnail showing reading progress — a percentage for comics and PDFs (derived from `lastPage` / `pageCount`), or an "In progress" label for EPUBs with a saved `lastLocation`.
- **Format_Badge**: A small label overlaid on a card thumbnail showing the item's file format (e.g., "EPUB", "CBZ"), derived from the `fileExt` field of the API response.
- **Empty_State**: A placeholder view displayed when a section has no content to show, with a contextual message and icon appropriate to the reason (no connection, no results, no recent items, or no cover image).
- **CLS**: Cumulative Layout Shift — an undesirable visual effect where page elements move after initial render, typically caused by images loading late and changing the size of their containers.

## Requirements

### Requirement 1: Bottom Tab Bar for Mobile Navigation

**User Story:** As a mobile user, I want a fixed bottom tab bar so that I can switch between All, Recent, Collections, Folders, and Tags with a single tap without opening a sidebar.

#### Acceptance Criteria

1. WHILE the viewport width is at or below the Viewport_Breakpoint, THE Web_App SHALL display a Tab_Bar fixed to the bottom of the screen with tabs for All, Recent, Collections, Folders, and Tags.
2. WHILE the viewport width is at or below the Viewport_Breakpoint, THE Web_App SHALL hide the Sidebar and the hamburger toggle button.
3. WHEN a user taps a tab in the Tab_Bar, THE Web_App SHALL navigate to the corresponding route (#/, #/recent, or display the relevant list for Collections/Folders/Tags).
4. THE Tab_Bar SHALL visually highlight the currently active tab using the accent colour.
5. WHILE the viewport width is above the Viewport_Breakpoint, THE Web_App SHALL hide the Tab_Bar and continue to display the Sidebar.
6. WHILE the reader overlay is open, THE Web_App SHALL hide the Tab_Bar.

### Requirement 2: Collections, Folders, and Tags Sub-Navigation

**User Story:** As a mobile user, I want tapping the Collections, Folders, or Tags tab to show me a list of items so that I can quickly pick one without scrolling through a sidebar.

#### Acceptance Criteria

1. WHEN a user taps the Collections tab in the Tab_Bar, THE Web_App SHALL display a scrollable list of all library collections, each linking to its #/library/:id route.
2. WHEN a user taps the Folders tab in the Tab_Bar, THE Web_App SHALL display a scrollable list of all folders, each linking to its #/folder/:id route.
3. WHEN a user taps the Tags tab in the Tab_Bar, THE Web_App SHALL display a scrollable list of all tags, each linking to its #/tag/:name route.
4. WHEN a user selects an item from a Collections, Folders, or Tags list, THE Web_App SHALL navigate to the selected route and display the corresponding card grid.
5. IF no collections, folders, or tags exist, THEN THE Web_App SHALL display a short empty-state message in place of the list (e.g., "No collections").

### Requirement 3: Inline Media-Type Filter Strip on Mobile

**User Story:** As a mobile user, I want to filter by All, Comics, or Books directly above the grid so that I can narrow results without reaching for the navbar.

#### Acceptance Criteria

1. WHILE the viewport width is at or below the Viewport_Breakpoint, THE Web_App SHALL display a Media_Strip of horizontally scrollable pill buttons (All, Comics, Books) between the library header and the Card_Grid.
2. WHILE the viewport width is at or below the Viewport_Breakpoint, THE Web_App SHALL hide the media-toggle button group in the Navbar.
3. WHEN a user taps a pill in the Media_Strip, THE Web_App SHALL filter the Card_Grid to show only items matching the selected media type.
4. THE Media_Strip SHALL visually highlight the currently active media-type pill using the accent colour.
5. WHILE the viewport width is above the Viewport_Breakpoint, THE Web_App SHALL continue to display the media-toggle buttons in the Navbar and hide the Media_Strip.

### Requirement 4: Larger, Scannable Card Grid on Mobile

**User Story:** As a mobile user, I want larger cover thumbnails so that I can visually identify books and comics at a glance while scrolling.

#### Acceptance Criteria

1. WHILE the viewport width is at or below the Viewport_Breakpoint, THE Card_Grid SHALL use a minimum card width of 150px (up from 130px).
2. WHILE the viewport width is at or below the Viewport_Breakpoint, THE Card_Grid SHALL use a gap of at least 12px between cards.
3. THE Card_Grid SHALL continue to use `auto-fill` so the number of columns adapts to the available screen width.
4. WHILE the viewport width is at or below the Viewport_Breakpoint, THE Card_Grid SHALL apply horizontal padding of at least 10px.

### Requirement 5: Accessible Sort Control on Mobile

**User Story:** As a mobile user, I want to access sort options so that I can reorder the grid by title, date added, file size, or page count.

#### Acceptance Criteria

1. WHILE the viewport width is at or below the Viewport_Breakpoint, THE Web_App SHALL display a sort button (e.g., an icon or label) in the library header area or the Navbar.
2. WHEN a user taps the sort button, THE Web_App SHALL open a Sort_Sheet or dropdown listing all sort options (Title, Date added, File size, Pages).
3. WHEN a user selects a sort option from the Sort_Sheet, THE Web_App SHALL re-sort the Card_Grid using the selected criterion and close the Sort_Sheet.
4. THE sort button SHALL indicate the currently active sort option.

### Requirement 6: Search Remains Accessible on Mobile

**User Story:** As a mobile user, I want the search input to remain accessible so that I can find items by name.

#### Acceptance Criteria

1. WHILE the viewport width is at or below the Viewport_Breakpoint, THE Navbar SHALL continue to display the search input.
2. THE search input SHALL span the available width in the Navbar after accounting for the brand logo and any action buttons.

### Requirement 7: No Desktop Regression

**User Story:** As a desktop user, I want the existing sidebar and navbar layout to remain unchanged so that my workflow is not disrupted.

#### Acceptance Criteria

1. WHILE the viewport width is above the Viewport_Breakpoint, THE Web_App SHALL render the Sidebar, Navbar media-toggle buttons, and sort select exactly as they appear today.
2. WHILE the viewport width is above the Viewport_Breakpoint, THE Web_App SHALL NOT render the Tab_Bar, Media_Strip, or Sort_Sheet.


### Requirement 8: File-Type Filter Chips

**User Story:** As a mobile user, I want to filter the grid by specific file format (EPUB, PDF, CBZ, CBR, MOBI) so that I can quickly find items in the format I want to read.

#### Acceptance Criteria

1. THE Web_App SHALL display a horizontally scrollable row of File_Type_Chip buttons for the formats: All, EPUB, PDF, CBZ, CBR, and MOBI.
2. WHEN a user taps a File_Type_Chip, THE Web_App SHALL filter the Card_Grid to show only items whose `fileExt` matches the selected format.
3. WHEN the "All" File_Type_Chip is active, THE Web_App SHALL display items of every file format.
4. THE File_Type_Chip row SHALL visually highlight the currently active chip using the accent colour.
5. THE File_Type_Chip row SHALL be independent of the Media_Strip, allowing both a media-type filter and a file-type filter to be active simultaneously.

### Requirement 9: Progress Badges on Cards

**User Story:** As a user, I want to see my reading progress directly on each card so that I can tell at a glance which items I have started and how far along I am.

#### Acceptance Criteria

1. WHEN a comic or PDF item has a `lastPage` greater than zero and a `pageCount` greater than zero, THE Card_Grid SHALL display a Progress_Badge on the card showing the percentage read (computed as `lastPage / pageCount`).
2. WHEN an EPUB item has a non-null `lastLocation`, THE Card_Grid SHALL display a Progress_Badge on the card with the label "In progress".
3. WHEN an item has no recorded reading progress, THE Card_Grid SHALL NOT display a Progress_Badge on the card.
4. THE Progress_Badge SHALL be positioned so that it does not obscure the card title or the Format_Badge.

### Requirement 10: Format Badges on Cards

**User Story:** As a user, I want to see the file format on each card so that I can distinguish between EPUB, PDF, CBZ, CBR, and MOBI items without opening them.

#### Acceptance Criteria

1. THE Card_Grid SHALL display a Format_Badge on each card showing the uppercase file extension derived from the `fileExt` field (e.g., "EPUB", "CBZ", "PDF").
2. THE Format_Badge SHALL replace the current media-type badge ("Comic" / "Book") with the more specific format label.
3. THE Format_Badge SHALL be styled distinctly for book formats (EPUB, PDF, MOBI) and comic formats (CBZ, CBR) so that the two categories remain visually distinguishable.

### Requirement 11: Improved Empty States

**User Story:** As a user, I want clear, contextual messages when there is nothing to display so that I understand why the screen is empty and what I can do about it.

#### Acceptance Criteria

1. IF the Web_App cannot reach the server, THEN THE Web_App SHALL display an Empty_State with a message indicating the server is unreachable and a suggestion to check the connection.
2. WHEN a search or filter produces zero results, THE Web_App SHALL display an Empty_State with a message indicating no items match the current criteria.
3. WHEN the Recently Read list contains no items, THE Web_App SHALL display an Empty_State with a message indicating no items have been read yet.
4. WHEN a card thumbnail fails to load, THE Web_App SHALL display a placeholder graphic in the card thumbnail area instead of a broken image.
5. EACH Empty_State SHALL include an icon or illustration appropriate to the specific empty condition.

### Requirement 12: Stable Card Dimensions

**User Story:** As a user, I want the card grid to remain visually stable while thumbnails load so that items do not jump around and I can tap the correct card.

#### Acceptance Criteria

1. THE Card_Grid SHALL reserve a fixed aspect-ratio space for each card thumbnail before the image loads, preventing CLS when the image arrives.
2. WHILE a card thumbnail is loading, THE Card_Grid SHALL display a neutral placeholder background in the reserved thumbnail space.
3. WHEN a card thumbnail finishes loading, THE Card_Grid SHALL fade the image in without changing the dimensions of the card.

### Requirement 13: Sticky Search Bar on Mobile

**User Story:** As a mobile user, I want the search bar to remain visible at the top of the screen while I scroll so that I can start a search at any point without scrolling back up.

#### Acceptance Criteria

1. WHILE the viewport width is at or below the Viewport_Breakpoint, THE Navbar SHALL remain fixed at the top of the viewport so that the search input stays accessible during scrolling.
2. WHILE the viewport width is at or below the Viewport_Breakpoint, THE Navbar SHALL use a compact height to maximise the visible Card_Grid area.
3. THE Navbar SHALL not overlap or obscure the first row of cards in the Card_Grid.

### Requirement 14: Sort by Recently Read

**User Story:** As a user, I want to sort the library grid by "Recently Read" so that I can quickly return to items I was reading.

#### Acceptance Criteria

1. THE Sort_Sheet SHALL include a "Recently Read" option in addition to the existing sort options (Title, Date added, File size, Pages).
2. WHEN the user selects the "Recently Read" sort option, THE Web_App SHALL request items sorted by `sortBy=lastRead` from the API.
3. WHEN sorted by "Recently Read", THE Card_Grid SHALL display items with the most recently read item first.
4. IF an item has never been read, THEN THE Web_App SHALL place the item after all items that have a `lastRead` timestamp when sorted by "Recently Read".

### Requirement 15: Headless Server Mode

**User Story:** As a user running CB8 on a server, NAS, or headless machine, I want to start CB8 without the Electron GUI so that I can access my library purely through the web UI from any device on the network.

#### Acceptance Criteria

1. THE CB8 application SHALL accept a `--headless` command-line flag or a `CB8_HEADLESS=1` environment variable to start in headless mode.
2. WHEN headless mode is active, THE CB8 application SHALL NOT create a BrowserWindow or display any Electron GUI.
3. WHEN headless mode is active, THE CB8 application SHALL initialize the LibraryDatabase and register IPC handlers so that the web server can serve API requests.
4. WHEN headless mode is active, THE CB8 application SHALL start the embedded HTTP web server automatically on the configured port, regardless of the stored `web_server_enabled` setting.
5. WHEN the web server starts in headless mode, THE CB8 application SHALL print the local URL and LAN URL to the console (e.g., `[CB8] Web UI: http://localhost:8008` and `[CB8] LAN: http://<lan-ip>:8008`).
6. WHILE headless mode is active, THE CB8 application SHALL keep the process alive serving HTTP requests until it receives a termination signal.
7. WHEN the CB8 application receives a SIGINT or SIGTERM signal in headless mode, THE CB8 application SHALL close the HTTP server and release all resources before exiting.
8. WHEN headless mode is active and no BrowserWindow exists, THE CB8 application SHALL NOT quit in response to the `window-all-closed` event.
9. WHEN headless mode is active on macOS, THE CB8 application SHALL hide the dock icon.
