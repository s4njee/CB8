# AGENTS.md

Guidance for coding agents working in this repository.

## Project Shape

This is an Electron + TypeScript + React comic reader. The active implementation is TypeScript under `src/`; the root `CMakeLists.txt` is stale Qt/C++ prototype configuration and should not be used for current work.

Specs live in `.kiro/specs/comic-book-reader/`:
- `requirements.md` is the product contract.
- `design.md` describes the intended architecture.
- `tasks.md` tracks implementation status and test expectations.

Large follow-up work that should not be mixed into small fixes is tracked in `REFACTOR.md`.

## Useful Commands

Run these from the repo root:

```sh
pnpm run typecheck
pnpm test
pnpm start
pnpm run package
```

Use `pnpm run typecheck` before trusting a renderer or IPC change. The test suite currently focuses on shared utilities, so TypeScript catches many integration mistakes that tests do not.

## Code Map

- `src/main/`: Electron main process, archive loading, SQLite library database, file scanning, IPC handlers, preload bridge.
- `src/renderer/`: React UI and typed renderer IPC client.
- `src/shared/`: code and types shared by main and renderer.
- `src/shared/ipcTypes.ts`: canonical IPC channel names, argument tuples, result types, and event payloads.
- `src/renderer/ipcClient.ts`: typed renderer-facing helper functions. Prefer adding wrappers here instead of calling `window.electronAPI` directly from components.

## IPC Rules

When adding or changing an IPC channel:

1. Update `src/shared/ipcTypes.ts`.
2. Register or update the handler in `src/main/ipcHandlers.ts`.
3. Add or update a helper in `src/renderer/ipcClient.ts`.
4. Use the helper from React components.
5. Run `pnpm run typecheck`.

The preload bridge whitelists channels from `IPC_INVOKE_CHANNELS` and `IPC_EVENT_CHANNELS`. If a channel is missing from those arrays, renderer calls will fail at runtime.

## Testing Expectations

Shared pure logic should have Vitest coverage under `src/shared/*.test.ts`. Prefer property-style tests where existing utilities already use them.

For main-process or archive/database behavior, add focused tests only when fixtures or temporary files make the behavior deterministic. Avoid relying on local comic collections.

## Implementation Notes

- Archive loading accepts CBZ and CBR files and filters image entries through `src/shared/imageFilter.ts`.
- Natural sort behavior is centralized in `src/shared/naturalSort.ts`.
- Cover selection behavior is centralized in `src/shared/coverSelection.ts`.
- Renderer drag/drop archive validation is centralized in `src/shared/dropValidator.ts`.
- JXL support is not complete; see `REFACTOR.md` before attempting partial fixes.
- Library virtualization is not complete; see `REFACTOR.md` before making performance claims for 100K comics.

## Safety Notes

Do not delete underlying comic files when removing library records. The requirements explicitly say library removal must only update the database.

Do not introduce new raw `any` casts or direct component-level `window.electronAPI.invoke` calls unless there is a clear reason and the type map cannot express the case.

Keep generated/build output out of commits: `node_modules/`, `dist/`, `.vite/`, and `out/` are ignored.
