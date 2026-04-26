# Refactor Notes

Audit baseline: `.kiro/specs/comic-book-reader/requirements.md`, `design.md`, and `tasks.md`.

## ~~Library Grid Virtualization~~ ✅

Completed. `LibraryView.tsx` now uses `@tanstack/react-virtual` (`useVirtualizer`) with row-based virtualization. Column count is computed from container width via `ResizeObserver`, items are sliced into rows, and only visible rows plus one overscan row above/below are rendered. The old `IntersectionObserver` sentinel has been replaced with virtualizer-range-based infinite loading.

## JPEG XL Decode Pipeline

`src/main/imageDecoder.ts` is still a pass-through stub, so `.jxl` pages and covers are not converted into a Chromium-displayable format despite the spec requiring transparent JXL support. This should be implemented as a real main-process decode pipeline using the installed `@jsquash/jxl` package, plus a browser-native output encoder and Forge/Vite packaging for the WASM assets.

## Large Archive Memory Use

`openCbr` extracts every image in a RAR archive into memory during open. That is simple but can be expensive for large comics and does not match an on-demand page extraction model. Refactor CBR handling to keep archive metadata separately from page bytes and extract individual pages as requested, or add an explicit bounded cache.

## Library Query Scalability

`LibraryDatabase.queryComics` uses `%term%` `LIKE` searches, which prevents normal B-tree indexes from satisfying substring queries efficiently. To meet the 100,000-record and sub-200ms search requirements, introduce SQLite FTS5 or a normalized search table, then benchmark query and sort paths against a generated large library.

## Build System Cleanup

The root `CMakeLists.txt` still references the old Qt/C++ prototype files (`src/main.cpp`, `src/MainWindow.cpp`, etc.) that are no longer present. Remove it or replace it with current Electron build documentation so contributors do not try to use a stale build path.
