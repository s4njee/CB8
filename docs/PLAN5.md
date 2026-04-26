# PLAN5 — Web UI Comic Book Reader

Ideas and feature plan for a browser-based comic book reader that can run as a self-hosted web app (e.g. on a NAS, Raspberry Pi, or VPS), accessible from any device with a browser.

---

## Core Reading Experience

- Server-side CBZ/CBR extraction — stream pages as images over HTTP, no client-side archive handling needed
- Responsive page viewer that works on desktop, tablet, and phone
- Single-page and double-page (spread) reading modes
- Fit-to-width, fit-to-height, and original-size zoom modes
- Pinch-to-zoom on touch devices
- Swipe left/right for page navigation on mobile
- Keyboard shortcuts (arrow keys, space, home/end) on desktop
- Long-strip / webtoon vertical scroll mode for manhwa/manhua
- Dark background with no chrome in reading mode — tap edges or swipe to show controls
- Page preloading — fetch next 2-3 pages while current page is displayed
- Smooth page transitions (slide or fade, user-configurable)

## Library Management

- Scan configured directories for CBZ/CBR/PDF files on the server
- Auto-detect series by parsing filenames (e.g. "Chainsaw Man v01.cbz" → series "Chainsaw Man", volume 1)
- Series grouping — show one card per series, click to expand volumes/chapters
- Virtual folders — user-created groupings independent of filesystem layout
- Drag-and-drop upload from browser to add comics to the server
- Cover thumbnail generation on import (first page or designated cover image)
- Lazy thumbnail loading with placeholder shimmer
- Virtual scrolling grid for large libraries (100K+ items)
- Search by title, series, author, tags
- Sort by title, date added, date read, file size, page count
- Filter by read status (unread, in progress, completed)

## Reading Progress & Bookmarks

- Track last-read page per comic, persist server-side
- "Continue Reading" shelf at the top of the library — most recently read comics
- Progress bar on library cards showing percentage read
- Mark as read / mark as unread
- Bookmarks within a comic — save specific pages with optional notes
- Reading history — chronological log of what was read and when

## User Accounts & Multi-User

- User registration and login (JWT or session-based)
- Per-user reading progress, bookmarks, and library organization
- Admin role for managing users, scanning directories, server settings
- Guest access mode (read-only, no progress tracking)
- Per-user or global library visibility settings
- OPDS feed support for compatibility with external readers (Panels, Chunky, etc.)

## Metadata & Organization

- Scrape metadata from ComicVine, AniList, or MangaDex APIs
- Edit metadata manually — title, author, artist, genre, year, summary
- Tag system — assign multiple tags per comic
- Smart collections — auto-populated based on rules (e.g. "all unread horror comics")
- Series metadata — track reading order across volumes
- Rating system (1-5 stars or thumbs up/down)

## Server Architecture

- Node.js or Go backend with REST API
- SQLite or PostgreSQL for metadata and user data
- Filesystem-based comic storage — no need to re-upload, just point at directories
- Background job queue for scanning, thumbnail generation, metadata scraping
- WebSocket or SSE for real-time scan progress and notifications
- Docker image for easy deployment
- Config via environment variables or YAML file
- Automatic database migrations on startup

## API Design

- `GET /api/comics` — list/search/filter comics with pagination
- `GET /api/comics/:id` — comic metadata
- `GET /api/comics/:id/pages/:page` — serve page image (with caching headers)
- `GET /api/comics/:id/thumbnail` — cover thumbnail
- `POST /api/comics/:id/progress` — update reading position
- `GET /api/series` — list series with volume counts
- `GET /api/shelves/continue-reading` — recently read comics
- `POST /api/scan` — trigger directory scan
- `GET /api/scan/status` — scan progress (SSE stream)
- `CRUD /api/tags`, `/api/folders`, `/api/libraries`
- `CRUD /api/users` (admin only)
- `POST /api/auth/login`, `/api/auth/register`

## Frontend Tech

- React or Solid.js SPA
- TanStack Virtual for library grid
- Service worker for offline reading of downloaded comics
- PWA manifest — installable on mobile home screens
- Responsive CSS — single codebase for desktop and mobile
- Dark/light theme toggle
- Lazy image loading with IntersectionObserver

## Mobile-Specific Features

- Bottom navigation bar (Library, Continue Reading, Search, Settings)
- Pull-to-refresh on library view
- Download comics for offline reading (stored in browser cache or IndexedDB)
- Reading direction toggle (LTR for western comics, RTL for manga)
- Screen wake lock while reading
- Orientation lock option (portrait for single page, landscape for spreads)

## Performance & Caching

- Server-side image resizing — serve thumbnails at 200px wide, full pages at viewport width
- HTTP cache headers on page images (immutable content, long max-age)
- CDN-friendly URL structure
- Client-side LRU cache for recently viewed pages
- Lazy extraction — only extract requested pages, not the entire archive
- Background pre-extraction of next few pages when a comic is opened

## Nice-to-Have / Future

- PDF support (render pages server-side with pdf.js or poppler)
- EPUB support for text-heavy comics
- Panel-by-panel navigation using AI-based panel detection
- Text-to-speech for accessibility
- Comic info overlay — tap and hold a page to see filename, dimensions, file size
- Duplicate detection — flag comics with identical content but different filenames
- Import/export library data as JSON for backup
- Webhook notifications (new comics added, scan complete)
- Integration with download managers (e.g. watch a folder for new files)
- Multi-language UI
- Keyboard shortcut customization
- Reading statistics dashboard (comics read per week, pages per day, etc.)
