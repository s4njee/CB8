# PLAN2: In-App EPUB and PDF Reader

Goal: render EPUB and PDF books directly inside CB8 instead of delegating to external applications. The reader should feel consistent with the existing comic reader while respecting the different nature of reflowable (EPUB) and fixed-layout (PDF) content.

Baseline docs:
- `AGENTS.md`
- `src/renderer/components/App.tsx` — view switching and reader state
- `src/renderer/components/ReaderView.tsx` — existing comic page renderer
- `src/shared/types.ts` — `ComicRecord` with `mediaType` field
- `src/shared/ipcTypes.ts` — IPC channel definitions

Libraries:
- **EPUB**: `epubjs` (BSD license, renders EPUB in the browser, handles pagination, CFI-based location tracking)
- **PDF**: `pdfjs-dist` (Apache 2.0, Mozilla's PDF renderer, canvas-based page rendering)

## Phase 1: Install Dependencies and IPC Plumbing

Problem: the renderer cannot currently read raw book file bytes. EPUB.js needs a file URL or ArrayBuffer. PDF.js needs the same. The preload bridge only exposes whitelisted IPC channels.

Changes:
- `pnpm add epubjs pdfjs-dist`
- `pnpm add -D @types/epubjs` (if available, otherwise declare a module shim in `src/renderer/env.d.ts`)
- Add IPC channel `book:read-file` that takes a file path and returns the file contents as an ArrayBuffer via the main process (`fs.readFile`).
- Register the handler in `src/main/ipcHandlers.ts`.
- Add the channel to `IpcInvokeMap` and `IPC_INVOKE_CHANNELS` in `src/shared/ipcTypes.ts`.
- Add a renderer wrapper `readBookFile(filePath: string): Promise<ArrayBuffer>` in `src/renderer/ipcClient.ts`.

Acceptance checks:
- `readBookFile` returns an ArrayBuffer for a test `.epub` and `.pdf` file.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

## Phase 2: EPUB Reader Component

Problem: there is no renderer component for EPUB content.

Changes:
- Create `src/renderer/components/EpubReaderView.tsx`.
- Accept props: `filePath`, `onBack` callback, `initialLocation` (optional CFI string for resume).
- On mount, call `readBookFile(filePath)` to get the ArrayBuffer.
- Initialize an `ePub(arrayBuffer)` book instance from `epubjs`.
- Call `book.renderTo(containerRef)` with a rendition targeting a DOM element.
- Set rendition theme styles to match the dark CB8 aesthetic (dark background, light text).
- Implement keyboard navigation: ArrowRight/Space → `rendition.next()`, ArrowLeft/Backspace → `rendition.prev()`.
- Implement click navigation: click left third → prev, right third → next (matching comic reader UX).
- Display a bottom status bar showing current chapter name and percentage progress.
- On `rendition.on('relocated', location)`, persist the CFI location string via `reading:update-progress` (reuse the existing IPC channel, storing CFI in a new `lastLocation` column or encoding it into `lastPage`).
- Wire Escape key and a "← Library" button to call `onBack`.

Acceptance checks:
- An EPUB file renders with dark theme, paginated layout.
- Arrow keys and click zones navigate between pages.
- Chapter title and progress percentage display in the status bar.
- Pressing Escape returns to the library.
- `pnpm run typecheck` passes.

## Phase 3: PDF Reader Component

Problem: there is no renderer component for PDF content.

Changes:
- Create `src/renderer/components/PdfReaderView.tsx`.
- Accept props: `filePath`, `onBack` callback, `initialPage` (number for resume).
- On mount, call `readBookFile(filePath)` to get the ArrayBuffer.
- Load the document with `pdfjs.getDocument({ data: arrayBuffer })`.
- Configure the PDF.js worker. Either:
  - Copy the worker file to a static asset location and set `GlobalWorkerOptions.workerSrc`, or
  - Use the bundled worker from `pdfjs-dist/build/pdf.worker.min.mjs` via a Vite import.
- Render one page at a time onto an HTML `<canvas>` element, scaled to fit the viewport (reuse `scaleToFit` from `src/shared/scaleFit.ts`).
- Implement keyboard navigation: ArrowRight/Space → next page, ArrowLeft/Backspace → previous page, Home/End → first/last page.
- Implement click navigation: left/right click zones like the comic reader.
- Display a bottom status bar showing page number and total pages (reuse `StatusBar` or `formatStatusBar`).
- On page change, persist progress via `reading:update-progress`.
- Wire Escape key and "← Library" button to `onBack`.

Acceptance checks:
- A PDF file renders one page at a time, scaled to fit.
- Arrow keys and click zones navigate between pages.
- Page number and total display in the status bar.
- Pressing Escape returns to the library.
- `pnpm run typecheck` passes.

## Phase 4: View Routing in App.tsx

Problem: `App.tsx` currently only switches between `'library'` and `'reader'` (comic reader). It needs to route to the correct reader based on file type.

Changes:
- Extend the `View` type to `'library' | 'reader' | 'epub-reader' | 'pdf-reader'`.
- Update `onOpenComic` (rename to `onOpenFile` or keep the name) to detect file extension:
  - `.cbz`, `.cbr` → set view to `'reader'`, use existing comic reader flow.
  - `.epub` → set view to `'epub-reader'`.
  - `.pdf` → set view to `'pdf-reader'`.
- Look up the record in the DB via `getComicByPath` to get saved progress (lastPage / lastLocation).
- Render `<EpubReaderView>` or `<PdfReaderView>` conditionally based on the active view.
- Both new readers call `onBack` which resets to `'library'` view.
- Ensure the global F11 fullscreen toggle works in all reader views.

Acceptance checks:
- Double-clicking an EPUB in the library opens the EPUB reader.
- Double-clicking a PDF in the library opens the PDF reader.
- Double-clicking a CBZ/CBR still opens the comic reader.
- Back button from any reader returns to the library.
- `pnpm run typecheck` passes.

## Phase 5: Reading Progress Persistence for Books

Problem: the existing `lastPage` column stores an integer page index. EPUB progress is a CFI string, not a page number. PDF progress is a page number and fits the existing model.

Changes:
- Add a `last_location` TEXT column to the `comics` table (nullable, for CFI strings).
- Add `lastLocation` to `ComicRecord` in `src/shared/types.ts`.
- Update `rowToRecord` in `libraryDatabase.ts` to include `last_location`.
- Update all SELECT statements that fetch comic rows to include `last_location`.
- Add IPC channel `reading:update-location` that takes `(comicId, location: string)` and writes to `last_location`.
- For PDF: continue using `reading:update-progress` with `lastPage` (integer).
- For EPUB: use `reading:update-location` with the CFI string.
- On open, pass `lastLocation` to `EpubReaderView` as `initialLocation` and `lastPage` to `PdfReaderView` as `initialPage`.
- Update `ContinueReadingShelf` to handle book entries (show them, open with the correct reader).

Acceptance checks:
- Closing and reopening an EPUB resumes at the saved CFI location.
- Closing and reopening a PDF resumes at the saved page number.
- The "Continue Reading" shelf shows recently read books and opens them correctly.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

## Phase 6: EPUB Thumbnail Generation

Problem: books added via scan have no cover thumbnail, so they show as blank cards in the library grid.

Changes:
- During book scanning in `fileScanner.ts`, for EPUB files:
  - Use `epubjs` or direct ZIP extraction (EPUBs are ZIPs) to find the cover image from the OPF manifest.
  - Extract the cover image bytes.
  - Run through `generateThumbnail` to produce a bounded-size thumbnail.
  - Store in `cover_thumbnail`.
- For PDF files:
  - Use `pdfjs-dist` in the main process (Node.js canvas or a headless render) to render page 1 to a buffer.
  - Alternatively, use a simpler approach: render page 1 to an OffscreenCanvas or use `pdf2pic` / `sharp` if available.
  - Run through `generateThumbnail`.
  - Store in `cover_thumbnail`.
- If extraction fails, fall back to null (the grid already handles missing thumbnails).

Acceptance checks:
- Newly scanned EPUBs show cover art in the library grid.
- Newly scanned PDFs show the first page as a thumbnail.
- Failed extraction does not abort the scan.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

## Phase 7: Reader Polish

Problem: the initial reader implementations will be minimal. This phase adds quality-of-life features.

Changes:
- EPUB reader:
  - Add font size controls (increase/decrease via keyboard shortcuts or UI buttons).
  - Add a table of contents sidebar or dropdown for chapter navigation.
  - Add a progress slider for scrubbing through the book.
  - Support light/dark/sepia theme toggle.
- PDF reader:
  - Add zoom controls (fit width, fit page, manual zoom level).
  - Add a page number input for direct navigation.
  - Add smooth page transitions.
  - Consider continuous scroll mode as an alternative to single-page view.
- Both readers:
  - Add a loading spinner while the file is being read and parsed.
  - Handle corrupt or invalid files gracefully with an error message and back button.
  - Ensure window title updates to show the book name.

Acceptance checks:
- Font size changes in EPUB reader persist across page turns.
- TOC navigation jumps to the correct chapter.
- PDF zoom works without breaking page navigation.
- Corrupt files show an error instead of a white screen.
- `pnpm run typecheck` passes.
- `pnpm test` passes.

## Suggested Implementation Order

1. Phase 1: Install Dependencies and IPC Plumbing.
2. Phase 2: EPUB Reader Component.
3. Phase 3: PDF Reader Component.
4. Phase 4: View Routing in App.tsx.
5. Phase 5: Reading Progress Persistence for Books.
6. Phase 6: EPUB Thumbnail Generation.
7. Phase 7: Reader Polish.

Phases 2 and 3 are independent and can be built in parallel. Phase 4 ties them into the app. Phase 5 adds persistence. Phase 6 improves the library browsing experience. Phase 7 is iterative polish.

## Verification Checklist for Each Phase

```sh
pnpm run typecheck
pnpm test
```

Manual testing with at least one EPUB and one PDF file after each phase. Keep test files outside the repo (do not commit copyrighted books).

## Packaging Notes

- `epubjs` is a pure JS library — no native modules, works in the renderer process directly.
- `pdfjs-dist` includes a web worker file that needs to be accessible at runtime. Ensure the Vite renderer config either bundles it or copies it to the output. The worker can be loaded from a CDN URL as a fallback, but for an offline Electron app it should be bundled.
- Neither library needs to be added to the `nativeExternals` list in `forge.config.ts`.
- Both libraries should be listed in `dependencies` (not `devDependencies`) in `package.json` since they run in the renderer at runtime.
