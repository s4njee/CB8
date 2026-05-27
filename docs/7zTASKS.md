# 7z Migration Task List

Goal: use the `node-7z` package as the Node wrapper around a native 7-Zip
binary for comic archive reads. CBZ and CBR now share the same archive backend
instead of splitting ZIP through `yauzl` and RAR through `node-unrar-js`.

## Decisions

- [x] Use `node-7z` as the wrapper package.
- [x] Require a native 7-Zip executable on PATH or through
      `CB8_SEVENZIP_PATH`.
- [x] Use the same backend for CBZ and CBR.
- [x] Remove `node-unrar-js`.
- [x] Keep `yauzl` only where it is still needed for EPUB internals.

## Implementation

- [x] Add `src/main/sevenZipPath.ts`.
  - [x] Resolve `CB8_SEVENZIP_PATH` first.
  - [x] Look for packaged `resources/7z/{7zz,7z,7za}` candidates.
  - [x] Fall back to `7z` on PATH.
  - [x] Probe the binary once and report a clear setup error.
- [x] Replace archive listing in `src/main/archiveLoader.ts`.
  - [x] Use `node-7z` `list(..., { techInfo: true })`.
  - [x] Filter directory records and non-image entries.
  - [x] Preserve natural sort ordering.
- [x] Replace page extraction in `src/main/archiveLoader.ts`.
  - [x] Extract a single selected page into a temporary directory.
  - [x] Keep the existing 64 MiB per-handle LRU page cache.
  - [x] Decode JXL pages through the existing image decoder.
  - [x] Clean temporary extraction directories after each miss.
- [x] Route both `openCbz` and `openCbr` through the shared 7-Zip backend.
- [x] Update ingest error comments from WASM-specific language to archive
      backend language.

## Packaging And Runtime

- [x] Add `node-7z` to application dependencies.
- [x] Remove `node-unrar-js` from dependencies and bundler externals.
- [x] Add `node-7z` and its runtime helper packages to Forge native externals.
- [x] Add `node-7z` to the standalone build external list.
- [x] Install `p7zip-full` in the Docker image.
- [x] Set Docker `CB8_SEVENZIP_PATH=/usr/bin/7z`.
- [x] Document the system 7-Zip requirement for desktop and standalone runs.

## Verification

- [x] `pnpm run typecheck`
- [x] `pnpm test`
- [x] `pnpm run build:standalone`
- [ ] Add deterministic archive fixtures for `src/main/archiveLoader.test.ts`.
  - [ ] Tiny CBZ fixture with natural-sort page names.
  - [ ] Tiny RAR fixture.
  - [ ] Optional multi-volume RAR fixture.
- [ ] Smoke-test against a real library import and compare
      `ingest-errors.jsonl` before and after the migration.

## Follow-Ups

- Password-protected archives: classify 7-Zip password errors distinctly and
  surface a UI hint later.
- Extraction concurrency: native child processes remove the WASM memory ceiling,
  but very high ingest concurrency can still pressure process and file-handle
  limits.
- Page prefetching: the shared 7-Zip backend extracts on demand; read-ahead can
  warm the existing LRU cache for smoother forward reading.
