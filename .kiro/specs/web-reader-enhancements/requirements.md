# Requirements Document

## Introduction

The CB8 web comic reader currently displays pages in a single fixed layout: one page at a time, fit-to-contain, with no zoom controls, no reading direction options, and no way to keep the screen awake during long reading sessions. This feature enhances the core reading experience with zoom modes, pinch-to-zoom, double-page spread mode for comics, a vertical scroll mode for webtoon-style content, fullscreen support, configurable page transitions, reading direction toggle, and screen wake lock. It also adds reading progress management (mark as read/unread, per-page bookmarks, reading history), library filtering by read status, series auto-detection with grouped display, pull-to-refresh on mobile, orientation lock, and server-side image resizing for performance. Additionally, the system transitions from a single hardcoded admin password to proper multi-user support with user registration, per-user reading progress and bookmarks, role-based access control (admin vs. regular user), configurable guest access, and per-user favorites. These enhancements target the vanilla-JS web UI served from `src/web/` and the Node.js/SQLite backend.

## Glossary

- **Comic_Reader**: The image-based page viewer rendered by `src/web/views/reader.js` for CBZ/CBR archives, contained within the `div.comic-reader` element.
- **Page_Image**: The `<img>` element (`#comic-page-img`) displaying the current comic page inside the Comic_Reader.
- **Zoom_Mode**: One of three display strategies for the Page_Image: `fit-width` (scale to fill viewport width), `fit-height` (scale to fill viewport height), or `original` (render at native image resolution with scrolling if needed).
- **Pinch_Gesture**: A two-finger touch interaction where the distance between touch points changes, used to zoom in or out on the Page_Image.
- **Spread_Mode**: A comic display mode where two consecutive pages are rendered side by side within the Comic_Reader, simulating a physical book spread.
- **Webtoon_Mode**: A vertical scroll reading mode where all pages of a comic are rendered in a single scrollable column, suited for manhwa, manhua, and other long-strip formats.
- **Fullscreen_API**: The browser `Element.requestFullscreen()` and `document.exitFullscreen()` APIs used to display the reader overlay without browser chrome.
- **Page_Transition**: A visual animation applied when navigating between pages, either `slide` (horizontal translate) or `fade` (opacity crossfade), stored as a user preference.
- **Reading_Direction**: The horizontal navigation order for page turns: `ltr` (left-to-right, western comics) or `rtl` (right-to-left, manga). Affects swipe direction, tap zones, and arrow key mapping.
- **Wake_Lock**: A browser `navigator.wakeLock.request('screen')` sentinel that prevents the device screen from dimming or locking while the reader is open.
- **Bookmark**: A user-saved reference to a specific page within a comic, stored server-side with an optional text note and a creation timestamp.
- **Reading_History**: A chronological server-side log recording each time a comic is opened or a reading session ends, with timestamps.
- **Read_Status**: A derived classification of a comic's reading state: `unread` (lastPage is null and lastLocation is null), `in-progress` (lastPage or lastLocation is set but the comic is not finished), or `completed` (lastPage equals pageCount − 1 for comics, or explicitly marked complete).
- **Series**: A group of comics that share a common series name, detected by parsing filenames. Each comic in a Series has an optional volume number and chapter number.
- **Series_Card**: A single card in the Card_Grid representing a Series, showing the cover of the first volume and an item count badge. Clicking a Series_Card expands to show individual volume/chapter cards.
- **Pull_To_Refresh**: A touch gesture on mobile where the user pulls down from the top of the library scroll area to trigger a data reload.
- **Orientation_Lock**: A user preference that requests the browser to lock screen orientation via the `screen.orientation.lock()` API — `portrait` for single-page reading, `landscape` for Spread_Mode.
- **Resized_Image**: A server-generated version of a comic page image scaled to a requested width, served via a query parameter on the page endpoint.
- **Virtual_Grid**: An optimized rendering strategy for the Card_Grid that only creates DOM nodes for cards visible in the viewport (plus a buffer), using IntersectionObserver to recycle or create cards as the user scrolls.
- **Reader_Toolbar**: The `div.reader-toolbar` overlay at the top of the Comic_Reader containing the back button, title, page slider, and page count.
- **Web_App**: The vanilla-JS single-page application served from `src/web/`, accessed via a browser.
- **Card_Grid**: The CSS grid of comic/book cards rendered by `src/web/views/library.js`.
- **User**: A registered account in the `users` table, identified by a unique integer `id`, a unique `username`, a hashed password, and a boolean `is_admin` flag. Each User authenticates via username and password and receives a session cookie.
- **Admin_User**: A User whose `is_admin` flag is true. Admin_Users can manage the library (scan, upload, delete comics), manage libraries/folders/tags, and manage other Users (create, list, delete, promote, demote).
- **Guest_User**: An unauthenticated visitor accessing the Web_App when guest access is enabled. Guest_Users can browse the library and read comics in read-only mode but cannot track progress, create bookmarks, or perform write operations.
- **User_Progress**: A per-user reading state for a specific comic, stored in a `user_progress` junction table with columns: `user_id`, `comic_id`, `last_page`, `last_location`, `last_read`, `completed`. Replaces the former global progress fields on the `comics` table.
- **Favorites**: A per-user boolean association between a User and a comic, stored in a `user_favorites` table with columns: `user_id`, `comic_id`, `created_at`. Allows each User to maintain a personal list of favorited comics independent of the shared library structure.
- **Continue_Reading_Shelf**: A horizontal row of small cards displayed at the top of the main library view (`#/`) showing the most recently read comics. Each card displays a cover thumbnail, title, and progress indicator. The shelf is horizontally scrollable on mobile and links to the reader at the last-read page. It is only visible to authenticated users who have reading history.
- **Comic_Metadata**: A set of descriptive fields stored on the `comics` table that describe a comic beyond its file properties. Includes `author` (text), `artist` (text), `genre` (JSON array of strings), `year` (integer), `summary` (text), `external_id` (text), and `external_source` (text). These fields are nullable and default to null when no metadata has been applied.
- **Metadata_Source**: An external API service used to look up Comic_Metadata by title or series name. Supported sources are ComicVine, AniList, and MangaDex. Each source is identified by a string key (`comicvine`, `anilist`, `mangadex`) stored in the `external_source` column when metadata is applied from that source.

## Requirements

### Requirement 1: Comic Page Zoom Modes

**User Story:** As a reader, I want to choose between fit-to-width, fit-to-height, and original-size zoom modes so that I can view comic pages at the scale that best suits my screen and reading preference.

#### Acceptance Criteria

1. THE Comic_Reader SHALL support three Zoom_Mode values: `fit-width`, `fit-height`, and `original`.
2. WHEN the Zoom_Mode is `fit-width`, THE Page_Image SHALL scale so that its width equals the Comic_Reader viewport width, allowing vertical scrolling if the image is taller than the viewport.
3. WHEN the Zoom_Mode is `fit-height`, THE Page_Image SHALL scale so that its height equals the Comic_Reader viewport height, allowing horizontal scrolling if the image is wider than the viewport.
4. WHEN the Zoom_Mode is `original`, THE Page_Image SHALL render at its native pixel dimensions (1:1), allowing both horizontal and vertical scrolling if the image exceeds the viewport.
5. WHEN the Reader_Toolbar is visible, THE Comic_Reader SHALL display a zoom mode toggle control that cycles through `fit-width`, `fit-height`, and `original` on each tap.
6. THE Comic_Reader SHALL persist the selected Zoom_Mode in `localStorage` and restore it on the next reader session.
7. WHEN the Zoom_Mode changes, THE Comic_Reader SHALL apply the new scaling to the current Page_Image without reloading it.

### Requirement 2: Pinch-to-Zoom on Touch Devices

**User Story:** As a mobile reader, I want to pinch-to-zoom on a comic page so that I can examine fine details without switching zoom modes.

#### Acceptance Criteria

1. WHEN a user performs a Pinch_Gesture on the Comic_Reader, THE Comic_Reader SHALL scale the Page_Image proportionally to the change in distance between the two touch points.
2. THE Comic_Reader SHALL clamp the pinch zoom scale to a minimum of 1× (no smaller than the current Zoom_Mode fit) and a maximum of 5×.
3. WHILE the Page_Image is zoomed beyond the viewport via pinch, THE Comic_Reader SHALL allow panning by single-finger drag to scroll the zoomed image.
4. WHEN a user double-taps the Page_Image, THE Comic_Reader SHALL toggle between the current Zoom_Mode fit scale and 2× zoom centered on the tap point.
5. WHILE the Page_Image is zoomed beyond 1× via pinch, THE Comic_Reader SHALL suppress page-turn swipe gestures to prevent accidental navigation.

### Requirement 3: Double-Page Spread Mode for Comics

**User Story:** As a reader on a wide screen or tablet in landscape, I want to view two comic pages side by side so that I can read spreads as the artist intended.

#### Acceptance Criteria

1. WHEN the Reader_Toolbar is visible, THE Comic_Reader SHALL display a Spread_Mode toggle button.
2. WHEN Spread_Mode is enabled, THE Comic_Reader SHALL display two consecutive pages side by side (current page on the left, next page on the right for LTR; reversed for RTL).
3. WHEN Spread_Mode is enabled AND the current page is the first page (cover) or the last page (odd total), THE Comic_Reader SHALL display that page alone, centered.
4. WHEN Spread_Mode is enabled, THE page navigation controls (tap zones, swipe, keyboard) SHALL advance or retreat by two pages at a time.
5. THE Comic_Reader SHALL persist the Spread_Mode preference in `localStorage` and restore it on the next reader session.
6. WHEN Spread_Mode is enabled, THE page slider and page label SHALL reflect the left-most visible page number.

### Requirement 4: Webtoon Vertical Scroll Mode

**User Story:** As a reader of manhwa or manhua, I want a vertical scroll mode that loads pages in a continuous strip so that I can scroll through chapters without page-by-page navigation.

#### Acceptance Criteria

1. WHEN the Reader_Toolbar is visible, THE Comic_Reader SHALL display a Webtoon_Mode toggle button.
2. WHEN Webtoon_Mode is enabled, THE Comic_Reader SHALL replace the single-page viewer with a vertically scrollable container where each page is rendered as a full-width image stacked top to bottom.
3. WHEN Webtoon_Mode is enabled, THE Comic_Reader SHALL lazily load page images as they approach the viewport (within a 2-page buffer above and below the visible area) using IntersectionObserver.
4. WHEN Webtoon_Mode is enabled, THE Comic_Reader SHALL update the current page number and reading progress as the user scrolls, based on which page image is most visible in the viewport.
5. WHEN Webtoon_Mode is enabled, THE tap zones and swipe gestures for page navigation SHALL be disabled; scrolling SHALL be the sole navigation method.
6. THE Comic_Reader SHALL persist the Webtoon_Mode preference in `localStorage` and restore it on the next reader session.
7. WHEN Webtoon_Mode is enabled AND the user scrolls past the last page, THE Comic_Reader SHALL not wrap around or navigate away.

### Requirement 5: Fullscreen Reading

**User Story:** As a reader, I want to enter fullscreen mode so that I can read without browser chrome distracting from the content.

#### Acceptance Criteria

1. WHEN the Reader_Toolbar is visible, THE Comic_Reader SHALL display a fullscreen toggle button.
2. WHEN the user activates the fullscreen toggle, THE Comic_Reader SHALL call `Element.requestFullscreen()` on the reader overlay element (`#reader-overlay`).
3. WHEN the browser is in fullscreen mode AND the user activates the fullscreen toggle again or presses Escape, THE Comic_Reader SHALL call `document.exitFullscreen()`.
4. IF the Fullscreen_API is not supported by the browser, THEN THE Comic_Reader SHALL hide the fullscreen toggle button.
5. WHEN the fullscreen state changes (via the `fullscreenchange` event), THE Comic_Reader SHALL update the toggle button icon to reflect the current state.

### Requirement 6: Smooth Page Transitions

**User Story:** As a reader, I want smooth animated transitions between pages so that navigation feels polished rather than abrupt.

#### Acceptance Criteria

1. THE Comic_Reader SHALL support three Page_Transition modes: `none` (instant swap, current behavior), `slide` (horizontal translate), and `fade` (opacity crossfade).
2. WHEN Page_Transition is `slide`, THE Comic_Reader SHALL animate the outgoing page sliding out and the incoming page sliding in from the direction of navigation, completing within 250ms.
3. WHEN Page_Transition is `fade`, THE Comic_Reader SHALL crossfade the outgoing page to the incoming page, completing within 200ms.
4. THE Comic_Reader SHALL persist the selected Page_Transition in `localStorage` and restore it on the next reader session.
5. WHILE a Page_Transition animation is in progress, THE Comic_Reader SHALL ignore additional page navigation inputs to prevent animation stacking.
6. WHEN Webtoon_Mode is enabled, THE Page_Transition setting SHALL have no effect (scrolling provides its own continuity).

### Requirement 7: Reading Direction Toggle

**User Story:** As a manga reader, I want to switch reading direction to right-to-left so that page turns match the original reading order.

#### Acceptance Criteria

1. WHEN the Reader_Toolbar is visible, THE Comic_Reader SHALL display a Reading_Direction toggle button showing the current direction (LTR or RTL).
2. WHEN Reading_Direction is `rtl`, THE Comic_Reader SHALL reverse the tap zone mapping: the left tap zone advances to the next page and the right tap zone goes to the previous page.
3. WHEN Reading_Direction is `rtl`, THE Comic_Reader SHALL reverse the swipe gesture mapping: swipe-right advances to the next page and swipe-left goes to the previous page.
4. WHEN Reading_Direction is `rtl`, THE keyboard arrow key mapping SHALL remain unchanged (ArrowRight = next, ArrowLeft = previous) to match physical key position expectations.
5. WHEN Reading_Direction is `rtl` AND Spread_Mode is enabled, THE Comic_Reader SHALL place the current page on the right and the next page on the left.
6. THE Comic_Reader SHALL persist the Reading_Direction preference in `localStorage` and restore it on the next reader session.

### Requirement 8: Screen Wake Lock

**User Story:** As a reader on a mobile device, I want the screen to stay on while I am reading so that it does not dim or lock during long pages.

#### Acceptance Criteria

1. WHEN the Comic_Reader is opened AND `navigator.wakeLock` is available, THE Comic_Reader SHALL request a Wake_Lock sentinel.
2. WHILE the Wake_Lock is active, THE device screen SHALL not dim or lock due to inactivity.
3. WHEN the Comic_Reader is closed (user navigates back to the library), THE Comic_Reader SHALL release the Wake_Lock sentinel.
4. WHEN the document visibility changes to `hidden` (e.g., user switches tabs), THE Wake_Lock SHALL be released automatically by the browser. WHEN visibility returns to `visible` AND the Comic_Reader is still open, THE Comic_Reader SHALL re-acquire the Wake_Lock.
5. IF `navigator.wakeLock` is not supported by the browser, THEN THE Comic_Reader SHALL silently skip wake lock acquisition without displaying an error.


### Requirement 9: Mark as Read / Mark as Unread

**User Story:** As a reader, I want to mark a comic as read or clear its progress so that my library accurately reflects what I have and have not finished.

#### Acceptance Criteria

1. WHEN an authenticated admin user or any user opens the card Context_Menu for a comic, THE Web_App SHALL display a "Mark as read" option if the comic's Read_Status is not `completed`, and a "Mark as unread" option if the comic's Read_Status is `completed` or `in-progress`.
2. WHEN the user selects "Mark as read", THE Web_App SHALL send a `PUT /api/comics/:id/progress` request with `{ page: pageCount - 1, completed: true }` and THE server SHALL set `last_page` to `page_count - 1`, set `last_read` to the current timestamp, and set a `completed` flag to true.
3. WHEN the user selects "Mark as unread", THE Web_App SHALL send a `DELETE /api/comics/:id/progress` request and THE server SHALL set `last_page` to null, `last_location` to null, `last_read` to null, and `completed` to false.
4. WHEN a comic's Read_Status changes, THE Web_App SHALL update the card's Progress_Badge and progress bar in the Card_Grid without a full page reload.

### Requirement 10: Bookmarks Within a Comic

**User Story:** As a reader, I want to bookmark specific pages with optional notes so that I can quickly return to memorable panels or important scenes.

#### Acceptance Criteria

1. WHEN the Reader_Toolbar is visible, THE Comic_Reader SHALL display a bookmark toggle button that indicates whether the current page is bookmarked.
2. WHEN the user taps the bookmark button on an un-bookmarked page, THE Comic_Reader SHALL send a `POST /api/comics/:id/bookmarks` request with `{ page: currentPage }` and THE server SHALL create a Bookmark record.
3. WHEN the user taps the bookmark button on an already-bookmarked page, THE Comic_Reader SHALL send a `DELETE /api/comics/:id/bookmarks/:bookmarkId` request and THE server SHALL delete the Bookmark record.
4. WHEN the user long-presses the bookmark button, THE Comic_Reader SHALL display a text input allowing the user to add or edit a note for the current page's Bookmark, sending a `PUT /api/comics/:id/bookmarks/:bookmarkId` request with `{ note }`.
5. THE server SHALL store Bookmarks in a `bookmarks` table with columns: `id`, `comic_id`, `page`, `note`, `created_at`.
6. WHEN the Reader_Toolbar is visible, THE Comic_Reader SHALL provide a bookmarks list button that opens a panel listing all Bookmarks for the current comic, sorted by page number, each showing the page number, note (if any), and a thumbnail preview.
7. WHEN the user taps a Bookmark in the list, THE Comic_Reader SHALL navigate to that page.

### Requirement 11: Reading History Log

**User Story:** As a reader, I want to see a chronological log of what I read and when so that I can recall my reading activity over time.

#### Acceptance Criteria

1. WHEN a user opens a comic in the Comic_Reader, THE Web_App SHALL send a `POST /api/history` request with `{ comicId, action: 'opened' }` and THE server SHALL insert a row into a `reading_history` table with columns: `id`, `comic_id`, `action`, `page`, `timestamp`.
2. WHEN a user closes the Comic_Reader (navigates back to the library), THE Web_App SHALL send a `POST /api/history` request with `{ comicId, action: 'closed', page: currentPage }`.
3. THE Web_App SHALL provide a "History" view accessible from the sidebar (desktop) and Tab_Bar (mobile) that displays Reading_History entries in reverse chronological order, grouped by date, showing the comic title, action, page number, and timestamp.
4. WHEN the user taps a Reading_History entry, THE Web_App SHALL navigate to `#/read/:comicId/:page`.
5. THE server SHALL expose a `GET /api/history` endpoint that returns Reading_History entries with pagination (`offset`, `limit`), sorted by `timestamp` descending.

### Requirement 12: Filter Library by Read Status

**User Story:** As a reader, I want to filter the library by unread, in-progress, or completed so that I can find what to read next or revisit finished items.

#### Acceptance Criteria

1. THE Web_App SHALL add a Read_Status filter control to the library view, displayed as a set of pill buttons (All, Unread, In Progress, Completed) below the existing Media_Strip on mobile and in the Sidebar on desktop.
2. WHEN the user selects a Read_Status filter, THE Web_App SHALL send the `readStatus` parameter to the `GET /api/comics` endpoint and THE server SHALL filter results accordingly.
3. WHEN `readStatus=unread`, THE server SHALL return comics where `last_page IS NULL AND last_location IS NULL AND completed = 0`.
4. WHEN `readStatus=in-progress`, THE server SHALL return comics where `(last_page IS NOT NULL OR last_location IS NOT NULL) AND completed = 0`.
5. WHEN `readStatus=completed`, THE server SHALL return comics where `completed = 1`.
6. THE Read_Status filter SHALL compose with existing filters (mediaType, fileExt, tag, search) using logical AND.

### Requirement 13: Series Auto-Detection

**User Story:** As a reader with many volumes of the same series, I want the system to automatically detect series from filenames so that related volumes are grouped together.

#### Acceptance Criteria

1. WHEN a comic is added to the library (via scan or upload), THE server SHALL parse the filename to extract a series name, volume number, and chapter number using common naming patterns (e.g., "Title v01.cbz", "Title Vol. 3 Ch. 12.cbz", "Title #005.cbr").
2. THE server SHALL store the parsed `series_name`, `volume_number`, and `chapter_number` in new columns on the `comics` table, with null values when parsing fails to detect a component.
3. THE server SHALL normalize series names by trimming whitespace and collapsing multiple spaces, so that "Chainsaw Man" and "Chainsaw  Man" resolve to the same series.
4. WHEN a comic's filename does not match any known series pattern, THE server SHALL set `series_name`, `volume_number`, and `chapter_number` to null, and the comic SHALL appear as a standalone item in the library.
5. THE server SHALL expose a `GET /api/series` endpoint that returns a list of distinct series names with the count of comics in each series, the cover thumbnail URL of the lowest-numbered volume, and the series' combined read progress.

### Requirement 14: Series Grouping in Library

**User Story:** As a reader, I want series to appear as a single card in the library grid so that my view is not cluttered with dozens of individual volume cards for the same series.

#### Acceptance Criteria

1. WHEN the Card_Grid renders comics that belong to a Series (non-null `series_name`), THE Card_Grid SHALL display one Series_Card per series instead of individual cards for each volume.
2. THE Series_Card SHALL display the cover thumbnail of the lowest-numbered volume in the series, the series name as the title, and a badge showing the number of volumes (e.g., "12 vols").
3. WHEN the user clicks a Series_Card, THE Web_App SHALL navigate to a series detail view (`#/series/:name`) that displays all volumes and chapters in the series, sorted by volume number then chapter number.
4. THE series detail view SHALL display individual comic cards with volume/chapter labels and per-volume reading progress.
5. WHEN a comic does not belong to any series (null `series_name`), THE Card_Grid SHALL display it as a standalone card as it does today.
6. THE series grouping SHALL respect active filters (mediaType, fileExt, readStatus, search, tag): if all comics in a series are filtered out, the Series_Card SHALL not appear.

### Requirement 15: Pull-to-Refresh on Mobile Library

**User Story:** As a mobile user, I want to pull down on the library view to refresh the data so that I can see newly added comics without reloading the page.

#### Acceptance Criteria

1. WHILE the viewport is mobile AND the library scroll position is at the top (scrollTop ≤ 0), WHEN the user performs a pull-down touch gesture exceeding 80px of overscroll, THE Web_App SHALL trigger a library data refresh.
2. WHILE the pull gesture is in progress, THE Web_App SHALL display a visual indicator (a spinner or arrow icon) above the Card_Grid that tracks the pull distance.
3. WHEN the refresh is triggered, THE Web_App SHALL re-fetch the current view's data from the API, reset the Card_Grid offset to 0, and re-render the grid with fresh results.
4. WHEN the refresh completes, THE Web_App SHALL hide the pull indicator with a smooth transition.
5. WHILE a refresh is already in progress, THE Web_App SHALL ignore additional pull-to-refresh gestures.
6. WHILE the viewport is desktop, THE pull-to-refresh gesture SHALL be disabled.

### Requirement 16: Orientation Lock

**User Story:** As a mobile reader, I want to lock the screen orientation to portrait for single-page reading or landscape for spread mode so that accidental rotation does not disrupt my reading.

#### Acceptance Criteria

1. WHEN the Reader_Toolbar is visible AND `screen.orientation.lock` is available, THE Comic_Reader SHALL display an orientation lock toggle button.
2. WHEN the user activates the orientation lock in single-page mode (Spread_Mode disabled), THE Comic_Reader SHALL call `screen.orientation.lock('portrait')`.
3. WHEN the user activates the orientation lock in Spread_Mode, THE Comic_Reader SHALL call `screen.orientation.lock('landscape')`.
4. WHEN the user deactivates the orientation lock or closes the Comic_Reader, THE Comic_Reader SHALL call `screen.orientation.unlock()`.
5. IF `screen.orientation.lock` is not supported or the call is rejected (e.g., not in fullscreen on some browsers), THEN THE Comic_Reader SHALL hide the orientation lock button or display a toast explaining the limitation.

### Requirement 17: Server-Side Image Resizing

**User Story:** As a reader on a mobile device with limited bandwidth, I want the server to resize comic page images to my viewport width so that pages load faster and use less data.

#### Acceptance Criteria

1. WHEN the `GET /api/comics/:id/pages/:page` endpoint receives a `width` query parameter, THE server SHALL resize the page image to the specified pixel width (maintaining aspect ratio) before sending the response.
2. WHEN the `width` parameter is absent, THE server SHALL serve the original unmodified page image (current behavior).
3. THE server SHALL clamp the `width` parameter to a minimum of 200 and a maximum of 4000 pixels. IF the value is outside this range, THEN THE server SHALL clamp it silently.
4. THE server SHALL use an in-memory image processing approach (e.g., sharp or canvas) to resize JPEG and PNG images, and SHALL set appropriate `Content-Type` headers on the response.
5. THE server SHALL cache resized images in a temporary directory keyed by `comicId`, `page`, and `width`, and serve cached versions on subsequent requests for the same parameters.
6. WHEN the Comic_Reader loads a page, THE Comic_Reader SHALL include a `width` parameter set to `Math.round(window.innerWidth * devicePixelRatio)` for single-page mode, or `Math.round(window.innerWidth * devicePixelRatio / 2)` for Spread_Mode.
7. THE server SHALL also accept a `width` parameter on the `GET /api/comics/:id/thumbnail` endpoint, resizing the cover thumbnail to the requested width for the Card_Grid.

### Requirement 18: Virtual Scrolling Grid for Large Libraries

**User Story:** As a user with a large library, I want the card grid to use virtual scrolling so that the page remains responsive even with thousands of items.

#### Acceptance Criteria

1. WHEN the Card_Grid contains more than 200 items, THE Web_App SHALL activate Virtual_Grid rendering, creating DOM nodes only for cards within the visible viewport plus a buffer of 2 rows above and below.
2. THE Virtual_Grid SHALL use IntersectionObserver to detect which card positions are entering or leaving the viewport and create or remove card DOM nodes accordingly.
3. THE Virtual_Grid SHALL maintain a spacer element whose height equals the total grid height (based on total item count and computed row height), so that the scrollbar reflects the true content size.
4. WHEN the user scrolls, THE Virtual_Grid SHALL render newly visible cards within one animation frame, preventing visible blank gaps during normal scroll speeds.
5. THE Virtual_Grid SHALL support all existing Card_Grid interactions: click to open, admin selection, context menu, and keyboard navigation.
6. WHEN the Card_Grid contains 200 or fewer items, THE Web_App SHALL use the current non-virtualized rendering (all cards in the DOM).

### Requirement 19: User Registration and Login

**User Story:** As a server operator, I want to create named user accounts with passwords so that multiple people can use the same CB8 instance with separate identities.

#### Acceptance Criteria

1. THE server SHALL store users in a `users` table with columns: `id` (integer primary key), `username` (unique, case-insensitive), `password_hash` (bcrypt or equivalent), `is_admin` (boolean, default false), and `created_at` (timestamp).
2. WHEN the server starts for the first time and the `users` table is empty, THE server SHALL create an initial Admin_User account with the username `admin` and the password derived from the existing `CB8_ADMIN_PASSWORD` environment variable.
3. WHEN a `POST /api/auth/login` request is received with a valid `username` and `password`, THE server SHALL create a session, associate the session with the User's `id`, set a session cookie, and return `{ authenticated: true, user: { id, username, isAdmin } }`.
4. WHEN a `POST /api/auth/login` request is received with invalid credentials, THE server SHALL return HTTP 401 with `{ authenticated: false }` and SHALL NOT reveal whether the username or password was incorrect.
5. WHEN a `POST /api/auth/register` request is received from an authenticated Admin_User with `{ username, password }`, THE server SHALL create a new User with `is_admin` set to false and return `{ id, username, isAdmin }`.
6. WHEN a `POST /api/auth/register` request is received with a username that already exists, THE server SHALL return HTTP 409 with a descriptive error message.
7. WHEN a `POST /api/auth/logout` request is received, THE server SHALL invalidate the session and clear the session cookie.
8. THE server SHALL extend the existing session cookie mechanism to store the authenticated User's `id` alongside the session token, so that all subsequent API requests can identify the calling User.
9. WHEN the `GET /api/auth/session` endpoint is called, THE server SHALL return the current session state including `{ authenticated, user: { id, username, isAdmin }, host }` for authenticated users, or `{ authenticated: false }` for unauthenticated users.

### Requirement 20: Per-User Reading Progress and Bookmarks

**User Story:** As a reader sharing a CB8 server with others, I want my reading progress and bookmarks to be private to my account so that other users' activity does not overwrite mine.

#### Acceptance Criteria

1. THE server SHALL store per-user reading progress in a `user_progress` table with columns: `user_id` (foreign key to `users.id`), `comic_id` (foreign key to `comics.id`), `last_page` (integer), `last_location` (text), `last_read` (timestamp), `completed` (boolean, default false), with a composite primary key of (`user_id`, `comic_id`).
2. WHEN an authenticated User sends a `PUT /api/comics/:id/progress` request, THE server SHALL upsert a User_Progress row for the authenticated User's `id` and the specified comic, without affecting other users' progress.
3. WHEN an authenticated User sends a `DELETE /api/comics/:id/progress` request, THE server SHALL delete the User_Progress row for the authenticated User's `id` and the specified comic only.
4. WHEN an authenticated User sends a `GET /api/comics` request, THE server SHALL join User_Progress for the authenticated User's `id` and return `lastPage`, `lastLocation`, `lastRead`, and `completed` fields reflecting that User's progress.
5. WHEN a Guest_User or unauthenticated request sends a `GET /api/comics` request, THE server SHALL return null values for `lastPage`, `lastLocation`, `lastRead`, and `completed` fields.
6. THE `bookmarks` table SHALL include a `user_id` column (foreign key to `users.id`). WHEN an authenticated User creates, lists, or deletes Bookmarks, THE server SHALL scope all operations to the authenticated User's `id`.
7. THE `reading_history` table SHALL include a `user_id` column (foreign key to `users.id`). WHEN an authenticated User creates or queries Reading_History entries, THE server SHALL scope all operations to the authenticated User's `id`.
8. WHEN the Read_Status filter (Requirement 12) is applied, THE server SHALL evaluate Read_Status based on the authenticated User's User_Progress rows, not global comic fields.

### Requirement 21: Admin Role for User Management

**User Story:** As an admin, I want to manage user accounts so that I can control who has access to the server and what permissions each person has.

#### Acceptance Criteria

1. WHEN an authenticated Admin_User sends a `GET /api/users` request, THE server SHALL return a list of all Users with fields: `id`, `username`, `isAdmin`, `createdAt`.
2. WHEN an authenticated Admin_User sends a `POST /api/users` request with `{ username, password }`, THE server SHALL create a new User with `is_admin` set to false and return the created User record.
3. WHEN an authenticated Admin_User sends a `DELETE /api/users/:id` request, THE server SHALL delete the specified User and all associated User_Progress, Bookmarks, Reading_History, and Favorites records. THE server SHALL NOT allow an Admin_User to delete their own account.
4. WHEN an authenticated Admin_User sends a `PUT /api/users/:id/role` request with `{ isAdmin: true }`, THE server SHALL set the specified User's `is_admin` flag to true (promote to admin).
5. WHEN an authenticated Admin_User sends a `PUT /api/users/:id/role` request with `{ isAdmin: false }`, THE server SHALL set the specified User's `is_admin` flag to false (demote from admin). THE server SHALL NOT allow the last remaining Admin_User to be demoted.
6. WHEN a non-admin authenticated User sends a request to any user management endpoint (`GET /api/users`, `POST /api/users`, `DELETE /api/users/:id`, `PUT /api/users/:id/role`), THE server SHALL return HTTP 403.
7. THE Admin_User SHALL retain all existing admin capabilities: scanning server paths, uploading comics, deleting comics, and managing libraries, folders, and tags.
8. WHEN a non-admin authenticated User attempts to upload, scan, delete comics, or manage libraries, folders, or tags, THE server SHALL return HTTP 403.

### Requirement 22: Guest Access Mode

**User Story:** As a server operator, I want to optionally allow unauthenticated visitors to browse and read comics so that I can share my library without requiring everyone to create an account.

#### Acceptance Criteria

1. THE server SHALL store a `guest_access` key in the `app_meta` table with a value of `"true"` or `"false"` (default `"false"`).
2. WHEN guest access is enabled AND an unauthenticated request is received for a read-only API endpoint (`GET /api/comics`, `GET /api/comics/:id`, `GET /api/comics/:id/pages/:page`, `GET /api/comics/:id/thumbnail`, `GET /api/series`), THE server SHALL allow the request and return data without progress information.
3. WHEN guest access is disabled AND an unauthenticated request is received for any API endpoint other than `POST /api/auth/login` and `GET /api/auth/session`, THE server SHALL return HTTP 401.
4. WHEN guest access is enabled AND an unauthenticated request attempts a write operation (creating bookmarks, updating progress, posting history, uploading, deleting), THE server SHALL return HTTP 401.
5. WHEN an authenticated Admin_User sends a `PUT /api/settings/guest-access` request with `{ enabled: true }` or `{ enabled: false }`, THE server SHALL update the `guest_access` value in `app_meta`.
6. WHEN the Web_App loads and the user is not authenticated AND guest access is disabled, THE Web_App SHALL display the login page instead of the library view.
7. WHEN the Web_App loads and the user is not authenticated AND guest access is enabled, THE Web_App SHALL display the library in read-only mode, hiding progress indicators, bookmark controls, and admin functions.

### Requirement 23: Per-User Favorites

**User Story:** As a reader, I want to mark comics as favorites so that I can quickly find the titles I enjoy most without affecting the shared library organization.

#### Acceptance Criteria

1. THE server SHALL store favorites in a `user_favorites` table with columns: `user_id` (foreign key to `users.id`), `comic_id` (foreign key to `comics.id`), `created_at` (timestamp), with a composite primary key of (`user_id`, `comic_id`).
2. WHEN an authenticated User sends a `POST /api/comics/:id/favorite` request, THE server SHALL insert a row into `user_favorites` for the authenticated User's `id` and the specified comic. IF the row already exists, THE server SHALL return success without error.
3. WHEN an authenticated User sends a `DELETE /api/comics/:id/favorite` request, THE server SHALL delete the `user_favorites` row for the authenticated User's `id` and the specified comic.
4. WHEN an authenticated User sends a `GET /api/comics` request with `favorites=true`, THE server SHALL return only comics that the authenticated User has favorited.
5. WHEN an authenticated User sends a `GET /api/comics` request, THE server SHALL include a boolean `isFavorite` field for each comic indicating whether the authenticated User has favorited it.
6. THE Web_App SHALL display a favorite toggle (heart icon) on each comic card and in the Reader_Toolbar, reflecting the current User's favorite state.
7. THE Web_App SHALL provide a "My Favorites" filter option alongside the existing Read_Status filters, showing only the authenticated User's favorited comics.
8. WHEN a Guest_User views the library, THE Web_App SHALL hide the favorite toggle and the "My Favorites" filter.

### Requirement 24: Continue Reading Shelf on Library Home

**User Story:** As a reader, I want to see a horizontal shelf of my recently read comics at the top of the main library view so that I can quickly resume reading without navigating to a separate page.

#### Acceptance Criteria

1. WHEN an authenticated User navigates to the main library view (`#/`), THE Web_App SHALL render a Continue_Reading_Shelf above the Card_Grid, displaying up to 10 of the User's most recently read comics ordered by `last_read` descending.
2. THE Continue_Reading_Shelf SHALL display each item as a small horizontal card containing the comic's cover thumbnail (via `GET /api/comics/:id/thumbnail`), the comic title (truncated with ellipsis if it overflows), and a progress indicator showing the percentage of pages read.
3. WHEN the viewport is mobile, THE Continue_Reading_Shelf SHALL be horizontally scrollable via touch swipe (left and right) without triggering vertical page scroll.
4. WHEN the user taps a Continue_Reading_Shelf item, THE Web_App SHALL navigate to `#/read/:comicId/:lastPage`, opening the comic at the last-read page stored in the User's User_Progress.
5. WHEN the authenticated User has zero User_Progress records (no recently read comics), THE Continue_Reading_Shelf SHALL not render, and the Card_Grid SHALL appear at its normal position without an empty gap.
6. WHEN a Guest_User accesses the main library view (guest access enabled, unauthenticated), THE Web_App SHALL not render the Continue_Reading_Shelf, because Guest_Users have no User_Progress data.
7. THE Continue_Reading_Shelf SHALL be visually distinct from the Card_Grid: shelf cards SHALL use a smaller card size and a horizontal single-row layout, separated from the Card_Grid by a visible divider or spacing.
8. THE Continue_Reading_Shelf SHALL include a "See all" link that navigates to `#/recent`, allowing the user to view the full recently-read list.
9. WHEN the Web_App fetches data for the Continue_Reading_Shelf, THE Web_App SHALL call `GET /api/recently-read?limit=10` and THE server SHALL return results scoped to the authenticated User's User_Progress records.

### Requirement 25: Metadata Scraping from External APIs

**User Story:** As an admin, I want to look up and apply metadata from external databases so that my library has rich author, genre, and summary information without manual data entry.

#### Acceptance Criteria

1. WHEN an authenticated Admin_User triggers a metadata lookup for a comic (via context menu or detail view), THE Web_App SHALL send a `GET /api/comics/:id/metadata-search?query=<title>` request to the server, using the comic's title or detected series name as the default query.
2. WHEN the server receives a `GET /api/comics/:id/metadata-search` request, THE server SHALL search the configured Metadata_Source APIs (ComicVine, AniList, or MangaDex) using the provided query string and return an array of candidate matches, each containing: source key, external ID, title, author, artist, genre list, year, summary, and cover image URL.
3. WHEN the server returns metadata search results, THE Web_App SHALL present the candidate matches to the Admin_User in a selection dialog showing the title, source, year, and cover image for each candidate.
4. WHEN the Admin_User selects a candidate match and confirms, THE Web_App SHALL send a `PUT /api/comics/:id/metadata` request with the selected metadata fields: `author`, `artist`, `genre`, `year`, `summary`, `external_id`, `external_source`, and optionally `cover_url`.
5. WHEN the server receives a `PUT /api/comics/:id/metadata` request from an authenticated Admin_User, THE server SHALL update the comic's Comic_Metadata columns (`author`, `artist`, `genre`, `year`, `summary`, `external_id`, `external_source`) in the `comics` table.
6. WHEN the `PUT /api/comics/:id/metadata` request includes a `cover_url` field AND the Admin_User has opted to replace the cover, THE server SHALL download the image from the provided URL, generate a thumbnail, and replace the comic's `cover_thumbnail` in the `comics` table.
7. WHEN an authenticated Admin_User triggers a bulk "Refresh metadata" action for all comics or a selected subset, THE Web_App SHALL send individual `GET /api/comics/:id/metadata-search` requests for each comic and, where exactly one high-confidence match is returned, automatically apply the metadata via `PUT /api/comics/:id/metadata` without requiring per-comic confirmation.
8. IF a Metadata_Source API is unreachable or returns an error, THEN THE server SHALL return an empty results array for that source and include a warning message in the response indicating which source failed.
9. WHEN a non-admin authenticated User or Guest_User sends a `GET /api/comics/:id/metadata-search` or `PUT /api/comics/:id/metadata` request, THE server SHALL return HTTP 403.
10. THE server SHALL add the following columns to the `comics` table: `author` (text, nullable), `artist` (text, nullable), `genre` (text, nullable, stored as a JSON array of strings), `year` (integer, nullable), `summary` (text, nullable), `external_id` (text, nullable), `external_source` (text, nullable).

### Requirement 26: Manual Metadata Editing

**User Story:** As an admin, I want to manually edit a comic's metadata so that I can correct inaccurate scraped data or add information for comics not found in external databases.

#### Acceptance Criteria

1. WHEN an authenticated Admin_User opens the metadata edit view for a comic (via detail view or edit modal), THE Web_App SHALL display an editable form with fields for: title, author, artist, genre (multi-value input), year, and summary.
2. THE metadata edit form SHALL pre-fill each field with the comic's current values from the `comics` table, displaying empty fields for any null Comic_Metadata columns.
3. WHEN the Admin_User submits the metadata edit form, THE Web_App SHALL send a `PUT /api/comics/:id/metadata` request with the updated field values.
4. WHEN the server receives a `PUT /api/comics/:id/metadata` request with a `title` field, THE server SHALL update the comic's `title` column in addition to the Comic_Metadata columns.
5. WHEN the server receives a `PUT /api/comics/:id/metadata` request with a `genre` field, THE server SHALL validate that the value is a JSON array of strings and store it in the `genre` column. IF the value is not a valid JSON array of strings, THEN THE server SHALL return HTTP 400 with a descriptive error message.
6. WHEN any authenticated User (admin or non-admin) views a comic's detail view, THE Web_App SHALL display the comic's Comic_Metadata fields (author, artist, genre, year, summary) in a read-only format.
7. WHEN a non-admin authenticated User or Guest_User views the comic detail view, THE Web_App SHALL hide the edit controls and display Comic_Metadata in read-only mode only.
8. WHEN a non-admin authenticated User or Guest_User sends a `PUT /api/comics/:id/metadata` request, THE server SHALL return HTTP 403.
