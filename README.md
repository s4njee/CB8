# CB8

CB8 is a desktop comic book reader for CBZ and CBR archives. It is built with Electron, TypeScript, and React, with a local SQLite library for organizing comics on your machine.

Non-Generated AI - I made this project for myself mainly. I've found it hard to use many of the manga readers that are out there, so I figured I'd make a simple one since its just extracting a zip file and showing you images. There may be bugs. File an issue or make a pull request. I'm only going to fix bugs that I run across.

## What It Does

- Opens CBZ and CBR comic archives for page-by-page reading.
- Builds a local comic library by scanning folders or adding archive files.
- Shows generated cover thumbnails for faster browsing.
- Supports search, selection, drag-and-drop organization, and virtual folders.
- Lets you group comics into libraries without moving or deleting the original files.
- Keeps library removal database-only; comic archive files stay on disk.

## Supported Archives

CB8 currently supports:

- `.cbz` ZIP-based comic archives
- `.cbr` RAR-based comic archives

Image entries are sorted with natural filename ordering so pages like `page2.jpg` come before `page10.jpg`.

## Development

Install dependencies:

```sh
pnpm install
```

Run the app in development:

```sh
pnpm start
```

Run TypeScript checks:

```sh
pnpm run typecheck
```

Run tests:

```sh
pnpm test
```

Package the app:

```sh
pnpm run package
```

## Project Layout

- `src/main/`: Electron main process, archive loading, scanning, SQLite database, IPC handlers, and preload bridge.
- `src/renderer/`: React UI for the library and reader views.
- `src/shared/`: shared types and utility logic used by both main and renderer processes.
- `.kiro/specs/comic-book-reader/`: product requirements and architecture notes.
- `REFACTOR.md`: larger follow-up work that should stay separate from small fixes.

## Notes

The root `CMakeLists.txt` is from an older Qt/C++ prototype and is not used by the current Electron implementation.

