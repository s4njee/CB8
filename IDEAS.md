# CB8 Expansion Ideas

Ideas for growing CB8 beyond the current comic/book reader, grouped by the kind
of product surface they would expand. The project already has multi-user web
access, local/headless deployment, progress tracking, metadata editing, search,
series grouping, and solid reader basics, so these ideas focus on the next
layers rather than re-listing shipped features.

## Library Automation

### Local file watching

Watch configured library folders with native filesystem events and automatically
queue scans when new files appear, existing files move, or deleted files vanish.
This would make CB8 feel more like a managed media server than a manual import
tool.

### Scheduled rescans

Add a server-side scheduler for nightly or weekly rescans. Keep it simple:
per-library scan interval, last run, next run, and an admin-only "run now"
button.

### Broken file health checks

Store scan/open failures on each library item, then expose a "Needs attention"
view for corrupt archives, unsupported PDFs, missing paths, and files that fail
cover extraction.

### Duplicate detection

Detect likely duplicates using file size, page count, normalized title, and
sampled page hashes. Start with "possible duplicate" groups instead of automatic
deduplication so users keep control over their files.

### Cover regeneration

Let admins regenerate covers for selected items or whole libraries. This is
useful after metadata refreshes, image-resize changes, or failed early imports.

## Reading Experience

### Continuous scroll mode

Add a vertical strip reader for manga, webtoons, and fast skimming. Reuse the
existing page endpoints and image resize cache, but load pages around the
viewport with an `IntersectionObserver`.

### Page auto-crop

Detect and trim white/black borders around pages before fitting them. Make it a
reader toggle first, then consider caching cropped dimensions per page if it is
slow.

### Reader display filters

Add brightness, contrast, gamma, grayscale, and sepia controls for eye comfort.
These can be CSS filters in the web reader and should be persisted per user.

### Persistent per-user reader prefs

Move reader preferences from local storage into the user profile: comic spread
mode, direction, transition, EPUB font/theme, PDF zoom, and display filters.
That makes switching devices less annoying.

### Reading time estimates

Use reading history to estimate pace and show "about N minutes left" for the
current book or comic. Keep it optional and quiet in the toolbar.

## Metadata & Organization

### Bulk metadata editor

Extend the existing multi-select flow to set series, volume, chapter, author,
year, publisher, tags, and rating across many items at once.

### Ratings

Add 1-5 star ratings with filtering and sorting. This pairs well with smart
collections and "random unread from high-rated series" flows.

### Smart collections

Persist named filter presets such as "Unread EPUBs", "Favorites from this
month", or "CBZ without metadata". These should behave like virtual shelves and
update automatically as the library changes.

### Reading lists

Add ordered queues independent of folders and tags. A list can mix comics and
books, preserve manual ordering, and support "read next" workflows.

### Related items panel

While reading, show adjacent issues, other books in the same series, and items
with shared tags. This helps users continue without returning to the library.

## Multi-User & Server Features

### Invite links

Let admins create expiring invite links with a role, optional library access,
and usage count. This is easier than manually creating every account.

### Per-library permissions

Move beyond global admin/guest roles by allowing users or groups to access only
specific libraries. Useful when the same CB8 instance serves multiple people.

### Audit log

Add an opt-in admin view for account events, library changes, failed logins, and
metadata edits. Keep reading history separate from security events.

### OPDS feed

Expose libraries through OPDS so external readers can browse and download from
CB8. Start read-only and authenticated.

### Direct downloads

Add a permission-controlled "download original file" action for web users. This
fits headless/NAS deployments where CB8 is also the archive browser.

## Offline & Mobile

### Offline PWA cache

Use a service worker to cache the shell, thumbnails, metadata, and recently read
pages. The first version can be "recent items keep working" rather than full
offline library sync.

### Download for offline

Let a signed-in user mark individual books/comics for offline use in the browser.
Track storage use and provide a clear cleanup screen.

### Mobile install prompt

Surface an unobtrusive add-to-home-screen prompt on mobile browsers after the
user has opened CB8 more than once.

### Mobile reader ergonomics

Add configurable tap zones, swipe sensitivity, and toolbar placement. These
settings should help phone and tablet users without changing the desktop reader.

## EPUB Enhancements

### Table of contents panel

Add a reader side panel or sheet for EPUB navigation. It should show chapters,
current location, and quick jumps.

### Highlights and notes

Support EPUB text selection, highlights, annotations, and Markdown export. Store
notes per user so shared libraries do not mix annotations.

### Typography controls

Add line height, margins, custom fonts, paragraph spacing, and hyphenation
settings for EPUBs.

### Dictionary lookup

Add text lookup for selected words in EPUBs. Start with a browser-based lookup
action, then consider local dictionaries later.

## Import & Interop

### Calibre import

Read Calibre `metadata.opf` files and map authors, series, tags, cover images,
and descriptions into CB8 metadata fields.

### Komga import

Import Komga-style series metadata and preserve existing collection structure
where possible.

### Export library data

Export metadata, tags, folders, ratings, progress, and reading history to JSON
or CSV. Keep original media files out of the export by default.

### Metadata provider accounts

Allow API keys or account settings for metadata providers that need them. Store
credentials in app settings and avoid hard-coding provider assumptions.

## Analytics & Admin Tools

### Storage dashboard

Show disk usage by library, file type, series, and largest items. Include
thumbnail/cache usage so admins can make cleanup decisions.

### Reading stats

Use the existing history data for pages read over time, completed items, streaks,
favorite formats, and active series.

### Cache management

Expose controls for image resize cache size, clear cache, and cache location.
This matters for low-storage servers and containers.

### Import queue view

Show active, pending, completed, and failed import jobs with cancellation and
retry. The current scan progress can become the foundation for this.

## Accessibility

### High-contrast theme

Add a high-contrast UI theme for library and reader controls. Keep it separate
from EPUB page themes.

### Screen-reader pass

Audit buttons, menus, sheets, cards, dialogs, and reader controls for labels,
roles, focus management, and keyboard-only operation.

### Large-text UI mode

Provide a UI-scale option independent of page zoom or EPUB font size.

### Reduced-motion mode

Respect `prefers-reduced-motion` and add an explicit setting for users who want
instant page transitions and no animated sheets.

## Developer & Operations

### CI release checks

Run typecheck, tests, packaging smoke checks, and standalone build validation on
every release tag.

### Migration test harness

Keep sample old databases and test every schema migration against them. This is
especially important now that CB8 has users, auth tables, progress, and metadata.

### Web API contract tests

Add integration tests for the embedded HTTP server: auth, upload, search,
metadata edit, progress, favorites, and admin-only surfaces.

### Demo library fixture

Create a tiny fixture library with fake CBZ/EPUB/PDF inputs for screenshots,
tests, docs, and manual QA.

### Plugin/provider interface

Define a small interface for metadata providers and importers so ComicVine,
AniList, MangaDex, Calibre, and future sources do not grow into one large
metadata module.

