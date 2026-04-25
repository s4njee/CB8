# CB8

CB8 is a desktop comic book reader for CBZ and CBR archives. It is built with Electron, TypeScript, and React, with a local SQLite library for organizing comics on your machine.

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

Server configuration is environment-variable driven. The bootstrap admin
password must be provided via `CB8_INITIAL_ADMIN_PASSWORD` when creating a new
database or repairing the built-in `admin` account.

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

## Environment

- `CB8_HOST`: bind address, defaults to `0.0.0.0`
- `CB8_PORT`: listen port, defaults to `8008`
- `CB8_DATA_DIR`: data directory, defaults to `/data`
- `CB8_INITIAL_ADMIN_PASSWORD`: required bootstrap password for the built-in `admin` account

## Project Layout

- `src/main/`: Electron main process, archive loading, scanning, SQLite database, IPC handlers, and preload bridge.
- `src/renderer/`: React UI for the library and reader views.
- `src/shared/`: shared types and utility logic used by both main and renderer processes.
- `.kiro/specs/comic-book-reader/`: product requirements and architecture notes.
- `REFACTOR.md`: larger follow-up work that should stay separate from small fixes.

## Notes

The root `CMakeLists.txt` is from an older Qt/C++ prototype and is not used by the current Electron implementation.
