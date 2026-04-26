# CB8

CB8 is a desktop comic book reader for CBZ and CBR archives. It is built with Electron and TypeScript, with a vanilla-JS SPA frontend served by an embedded HTTP server and a local SQLite library for organizing comics on your machine. The same SPA is used by the desktop window and by remote browser clients.

Non-Generated AI - I made this project for myself mainly. I've found it hard to use many of the manga readers that are out there, so I figured I'd make a simple one since its just extracting a zip file and showing you images. There may be bugs. File an issue or make a pull request. I'm only going to fix bugs that I run across.

<img width="1152" height="907" alt="Screenshot_20260421_144424" src="https://github.com/user-attachments/assets/b1530423-9744-40ad-a74b-9fb1ea0664d7" />
<img width="1152" height="907" alt="Screenshot_20260421_144202" src="https://github.com/user-attachments/assets/7c66a69b-1859-4364-b4d6-d91992c5eacf" />


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

- `src/main/`: Electron main process, archive loading, scanning, SQLite database, embedded HTTP server, IPC handlers, and preload bridge.
- `src/web/`: vanilla-JS SPA for the library and reader views, served by the embedded HTTP server and loaded by the Electron window.
- `src/shared/`: shared types and utility logic used by main and the SPA build.
- `.kiro/specs/comic-book-reader/`: product requirements and architecture notes.
- `REFACTOR.md`: larger follow-up work that should stay separate from small fixes.

## Notes

The root `CMakeLists.txt` is from an older Qt/C++ prototype and is not used by the current Electron implementation.

