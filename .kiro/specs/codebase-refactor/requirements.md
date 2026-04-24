# Requirements Document

## Introduction

This specification covers a set of behavior-preserving refactoring efforts for the CB8 Electron comic/book reader codebase. The goals are to reduce code duplication, improve module boundaries, clarify naming conventions, and make the codebase easier to maintain and extend. Each requirement is independently implementable and must not change any user-visible behavior. All existing tests must continue to pass after each change.

## Glossary

- **CB8**: The Electron + TypeScript + React comic and book reader application.
- **Schema_Module**: The database schema management code currently in `src/main/db/schema.ts`, responsible for DDL, migrations, repairs, and database opening.
- **Ingest_Service**: A unified service responsible for adding comics and books to the library from any entry point (file scanner, web server upload, IPC drag-and-drop).
- **IPC_Handlers**: The Electron IPC handler registration code currently in `src/main/ipcHandlers.ts`.
- **Media_Types_Module**: A shared module (`src/shared/mediaTypes.ts`) that owns all supported file extension definitions, media type detection, display labels, and drag-and-drop validation.
- **Library_Item**: The proposed unified naming for records that represent both comics and books in the database and type system (replacing the current `ComicRecord` naming).
- **LibraryView**: The React component `src/renderer/components/LibraryView.tsx` that renders the main library grid UI.
- **DB_Startup**: The database initialization sequence executed by `openOrRecreate` in the Schema_Module.
- **DDL**: Data Definition Language — the SQL statements that create tables and indexes.
- **Migration**: An ALTER TABLE or data transformation applied to an existing database to bring it to the current schema version.
- **Repair_Job**: A one-shot backfill or data-fix operation (e.g., thumbnail regeneration, completed-flag backfill) that runs once and records completion in `app_meta`.

## Requirements

### Requirement 1: Separate Schema Creation from Migrations

**User Story:** As a developer, I want the database schema code split into focused modules, so that I can locate and modify DDL, migrations, and repair jobs independently without risk of unintended side effects.

#### Acceptance Criteria

1. THE Schema_Module SHALL be split into four files: `schema/create.ts` for fresh DDL, `schema/migrations.ts` for ALTER TABLE migrations, `schema/repairs.ts` for one-shot Repair_Job operations, and `schema/open.ts` for the `openOrRecreate` entry point.
2. WHEN `openOrRecreate` is called, THE `schema/open.ts` module SHALL execute DDL creation, then migrations, then repair jobs, in that fixed order.
3. THE `schema/create.ts` module SHALL contain only the `SCHEMA` constant with CREATE TABLE and CREATE INDEX statements.
4. THE `schema/migrations.ts` module SHALL contain only ALTER TABLE column additions and post-migration index creation logic.
5. THE `schema/repairs.ts` module SHALL contain only one-shot backfill and repair functions (`repairExistingThumbnails`, `backfillCompletedOnFinalPage`, `backfillAccountFromPasswordHash`).
6. WHEN the split is complete, THE Schema_Module SHALL produce a database identical in schema and data to the pre-refactor version for both fresh creation and migration paths.
7. THE `LibraryDatabase` constructor SHALL continue to call `openOrRecreate` from `schema/open.ts` with no change to its public API.

### Requirement 2: Unify Ingest, Add, and Scan Logic

**User Story:** As a developer, I want a single Ingest_Service that handles adding comics and books to the library, so that bug fixes and new format support only need to be implemented once.

#### Acceptance Criteria

1. THE Ingest_Service SHALL be implemented as a single module at `src/main/ingestService.ts`.
2. THE Ingest_Service SHALL support adding individual files (comics and books) with cover extraction, page count detection, and series parsing.
3. THE Ingest_Service SHALL support scanning directories for comics and books with progress reporting.
4. WHEN a file is added through the Ingest_Service, THE Ingest_Service SHALL detect the media type from the file extension using the Media_Types_Module.
5. WHEN a comic archive is added, THE Ingest_Service SHALL extract the cover image and generate a thumbnail.
6. WHEN a PDF or EPUB book is added, THE Ingest_Service SHALL extract the cover and determine the page count.
7. WHEN a file already exists in the database, THE Ingest_Service SHALL skip it without error.
8. WHEN a file path has been dismissed by the user, THE Ingest_Service SHALL skip it without error.
9. THE IPC_Handlers `library:add-files` handler SHALL delegate to the Ingest_Service instead of containing inline ingest logic.
10. THE web server `ingest.ts` module SHALL delegate to the Ingest_Service instead of containing inline ingest logic.
11. THE `FileScannerImpl` SHALL delegate individual file processing to the Ingest_Service.
12. AFTER the unification, THE Ingest_Service SHALL produce identical database records to the pre-refactor code for all supported file types (CBZ, CBR, PDF, EPUB, MOBI).

### Requirement 3: Break Up IPC Handlers

**User Story:** As a developer, I want IPC handlers organized by domain, so that I can find and modify handlers for a specific feature area without scrolling through unrelated code.

#### Acceptance Criteria

1. THE IPC_Handlers SHALL be split into domain-specific modules: `ipc/archiveHandlers.ts`, `ipc/libraryHandlers.ts`, `ipc/readingHandlers.ts`, and `ipc/webServerHandlers.ts`.
2. THE `ipc/archiveHandlers.ts` module SHALL contain handlers for `archive:open`, `archive:page`, `archive:close`, and `book:read-file` channels.
3. THE `ipc/libraryHandlers.ts` module SHALL contain handlers for `library:*`, `libraries:*`, `folders:*`, `dialog:*`, and tag-related channels.
4. THE `ipc/readingHandlers.ts` module SHALL contain handlers for `reading:*` channels.
5. THE `ipc/webServerHandlers.ts` module SHALL contain handlers for `webserver:*` channels and the web server auto-start logic.
6. WHEN all domain modules are registered, THE IPC_Handlers SHALL handle the same set of IPC channels as the pre-refactor single file.
7. THE main entry point SHALL register all domain handler modules through a single `registerIpcHandlers` function or a coordinating module that calls each domain registration function.
8. IF a handler for `window:*` or `app-meta:*` channels exists, THEN THE IPC_Handlers SHALL place those handlers in an appropriate domain module or a shared `ipc/appHandlers.ts` module.

### Requirement 4: Clarify Comic vs Book Naming

**User Story:** As a developer, I want type and function names to reflect that the application handles both comics and books, so that the naming does not cause confusion when working with book-related features.

#### Acceptance Criteria

1. THE `ComicRecord` type in `src/shared/types.ts` SHALL be renamed to `MediaRecord` with a type alias `ComicRecord = MediaRecord` for backward compatibility during the transition.
2. THE database query functions (`queryComics`, `addComic`, `comicExistsByPath`, `getComic`, `getComicByPath`) SHALL have new aliases using `Item` or `Media` naming (e.g., `queryItems`, `addItem`) while preserving the original function names as deprecated aliases.
3. THE `LibraryDatabase` facade SHALL expose the new naming alongside the existing method names so that callers can migrate incrementally.
4. WHEN new code is written after this refactor, THE new code SHALL use the `MediaRecord` / `LibraryItem` naming exclusively.
5. THE TypeScript types SHALL be updated so that `MediaRecord` is the canonical type and `ComicRecord` is a type alias.
6. THE IPC channel names SHALL remain unchanged to avoid breaking the preload bridge whitelist.

### Requirement 5: Centralize File Type Support

**User Story:** As a developer, I want a single source of truth for supported file extensions and media type detection, so that adding a new format requires changes in only one place.

#### Acceptance Criteria

1. THE Media_Types_Module SHALL be implemented at `src/shared/mediaTypes.ts`.
2. THE Media_Types_Module SHALL export the set of supported comic extensions (cbz, cbr) and book extensions (pdf, epub, mobi).
3. THE Media_Types_Module SHALL export a function to detect media type (`'comic'` or `'book'` or `null`) from a file extension or filename.
4. THE Media_Types_Module SHALL export a function to determine if a filename is a supported file.
5. THE Media_Types_Module SHALL export display labels for each supported extension (e.g., `"Comic Archive (CBZ)"`, `"PDF Document"`).
6. THE Media_Types_Module SHALL export a function for drag-and-drop validation that returns whether a list of filenames contains supported files.
7. WHEN the Media_Types_Module is complete, THE `src/shared/dropValidator.ts` SHALL delegate to the Media_Types_Module for extension checks instead of maintaining its own extension sets.
8. WHEN the Media_Types_Module is complete, THE `src/main/fileScanner.ts` SHALL import extension sets from the Media_Types_Module instead of defining local constants.
9. WHEN the Media_Types_Module is complete, THE `src/main/webServer/ingest.ts` SHALL import extension sets from the Media_Types_Module instead of defining local constants.
10. WHEN the Media_Types_Module is complete, THE dialog file filter in IPC_Handlers SHALL derive its extension list from the Media_Types_Module.

### Requirement 6: Extract Library UI State from LibraryView

**User Story:** As a developer, I want the LibraryView component's query, filter, and selection logic extracted into custom hooks, so that I can modify UI behavior without risking regressions in unrelated concerns.

#### Acceptance Criteria

1. THE LibraryView SHALL extract query and pagination logic into a custom hook (e.g., `useLibraryQuery`).
2. THE LibraryView SHALL extract filter and sort state management into a custom hook (e.g., `useLibraryFilters`).
3. THE LibraryView SHALL extract item selection state and multi-select logic into a custom hook (e.g., `useLibrarySelection`).
4. WHEN the hooks are extracted, THE LibraryView component SHALL use the extracted hooks and produce identical rendering output to the pre-refactor version.
5. THE extracted hooks SHALL be placed in `src/renderer/components/library/hooks/`.
6. THE extracted hooks SHALL have clearly typed return values so that the LibraryView component's props and state dependencies are explicit.

### Requirement 7: Improve DB Startup Diagnostics

**User Story:** As a developer and user, I want the database startup sequence to report specific failure categories, so that I can distinguish between a corrupt SQLite file, a migration error, and a repair job failure without confusion.

#### Acceptance Criteria

1. WHEN the SQLite file cannot be opened or is corrupt, THEN THE DB_Startup SHALL report a diagnostic message identifying the failure as an unreadable or corrupt database file.
2. WHEN the fresh DDL creation succeeds but a Migration fails, THEN THE DB_Startup SHALL report a diagnostic message identifying the failure as a schema migration error, including the specific migration that failed.
3. WHEN DDL and migrations succeed but a Repair_Job fails, THEN THE DB_Startup SHALL report a diagnostic message identifying the failure as a repair or backfill error, including the specific repair that failed.
4. THE DB_Startup SHALL NOT use the phrase "database corrupted" for failures that are not SQLite file corruption (e.g., migration errors, Vite bundling errors).
5. WHEN a Repair_Job fails, THE DB_Startup SHALL continue operation with the database in a usable state, logging the repair failure for retry on next startup.
6. WHEN a Migration fails, THEN THE DB_Startup SHALL NOT silently destroy and recreate the database; the failure SHALL be surfaced to the caller.
7. THE diagnostic messages SHALL be structured (e.g., an error object with a `category` field) so that callers can programmatically distinguish failure types.

### Requirement 8: Behavior Preservation and Test Continuity

**User Story:** As a developer, I want assurance that all refactoring is behavior-preserving, so that users experience no functional changes and the test suite remains green.

#### Acceptance Criteria

1. AFTER each refactoring requirement is implemented, THE existing test suite SHALL pass without modification to test assertions.
2. THE refactoring SHALL NOT change any user-visible behavior, IPC channel contracts, database schema, or web server API responses.
3. WHEN files are moved or renamed, THE imports across the codebase SHALL be updated to reference the new locations.
4. WHEN TypeScript types are renamed, THE type definitions SHALL maintain backward-compatible aliases until all references are migrated.
5. THE refactoring SHALL be implementable incrementally — each requirement SHALL be completable independently without requiring other requirements to be done first.
