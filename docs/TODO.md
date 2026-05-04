# Refactor TODO — post-hierarchy cleanup

Cleanup opportunities visible in the code after the v7 hierarchy work landed and was collapsed to v1. None are blockers; they're prioritised roughly by leverage. Each item lists a short rationale, a sketch of the work, and the main gotcha so the next person can decide whether the juice is worth the squeeze.

## High-leverage

### 1. Split `MediaRecord` into list / detail variants

**What.** `MediaRecord` (`src/shared/types.ts`) currently carries both `coverThumbnail: Buffer | null` (full record) AND `hasThumbnail` / `thumbnailVersion` (list-shape). Only one set is meaningful at a time — list queries return rows where `coverThumbnail` is always `null` and the boolean flags are real; detail queries return rows where `coverThumbnail` is a Buffer and the flags are absent. The polymorphism is invisible to TypeScript.

**Why it matters.** Every consumer that reads from a `MediaRecord` has to know which path produced it. Bugs of the form "I expected the buffer but got null" or "I forgot to include `hasThumbnail` in this query" are not caught at compile time.

**How to implement.**
- Define `ComicListItem` and `ComicDetail` interfaces. `ComicListItem` keeps `hasThumbnail` + `thumbnailVersion`; `ComicDetail` keeps `coverThumbnail`. Both share the common fields (id, title, page_count, etc.) — extract a `ComicBase` interface and extend.
- Update `rowToRecord` to return `ComicDetail`; `rowToListRecord` returns `ComicListItem`.
- Touch every call site: `LibraryDatabase` facade methods, the routes that map to `WebComicRecord`, the SPA chapter rendering. The compiler will list them.
- Mirror the split in `WebComicRecord` (`src/main/webServer/mapping.ts`).

**Gotcha.** Roughly 30+ call sites. Compiler-driven, not destabilising — every break is a clear error. Worth doing in one PR with a single mechanical pass.

---

### 2. Carve up `db/comics.ts`

**What.** The module sits at ~700 lines and covers: CRUD (`addComic`, `removeComics`, `getComic`), query building (`queryComics`, `queryComicsForUser`), recently-read / continue-reading, FTS-query construction (`buildFtsQuery`), soft-delete primitives (`softDeleteByPath`, `cascadeSeriesVolumeDeletion`), cover resolution (`defaultSeriesCover`, `defaultVolumeCover`), and user-edit field tracking. Six different concerns, one file.

**Why it matters.** Hard to find things; merge conflicts cluster here; new contributors land in 700 lines and can't see the seams.

**How to implement.**
- Extract `db/comics/query.ts` — `queryComics`, `queryComicsForUser`, `buildFtsQuery`, the SORT_COLUMN_MAP usage.
- Extract `db/comics/recent.ts` — `getRecentlyRead`, `getContinueReading`, the by-user variants.
- Extract `db/comics/softDelete.ts` — `softDeleteByPath`, `restoreByPath`, `cascadeSeriesVolumeDeletion`.
- Extract `db/comics/covers.ts` — `defaultSeriesCover`, `defaultVolumeCover`, `getCoverThumbnail`.
- Extract `db/comics/userEdits.ts` — `addUserEditedFields`, `isFieldUserEdited`.
- Keep `db/comics/index.ts` (or `db/comics.ts`) as the barrel re-export, plus the core CRUD (`addComic`, `addComicFast`, `removeComics`, `getComic`, `getComicByPath`, `comicExistsByPath`, `rowToRecord`, `rowToListRecord`, `updateComicMetadata`, `getComicMetadata`).

**Gotcha.** The `LibraryDatabase` facade re-exports many of these by name. If you keep the import surface stable (`import * as comics from './db/comics'`), the facade doesn't change. Rename inside, not at the boundary.

---

### 3. Unify the `LibraryDatabase` facade on namespace style

**What.** `libraryDatabase.ts` mixes two patterns:
- **Per-method**: tags, libraries, folders, history, bookmarks, favorites — each surface adds 5-10 explicit methods that pass-through to the underlying module (`addTag`, `removeTag`, `getAllTags`, `renameTag`, `deleteTag`, …).
- **Namespace**: series and volume — exposed as `db.series.*` and `db.volume.*` accessors backed by `makeSeriesFacade(db)`.

The newer namespace pattern was added because per-method got verbose for ~16 functions. It's a clear win; the older domains never got the same treatment.

**Why it matters.** Adding a new function to a namespaced module is automatic. Adding a new function to a per-method module requires a facade edit *plus* a re-export consideration, and we have a long history of forgetting one. Inconsistency means readers have to remember which pattern each domain uses.

**How to implement.**
- Add `makeTagsFacade(db)`, `makeLibrariesFacade(db)`, `makeFoldersFacade(db)`, etc. — same pattern as `makeSeriesFacade`.
- Replace the per-method facades with `get tags() { return makeTagsFacade(this.db); }` etc.
- Update call sites: `db.addTag(comicId, tag)` → `db.tags.add(comicId, tag)`. Mostly find-and-replace; the compiler enforces correctness.
- Function names in the underlying modules can stay as they are (the namespace strips the verb prefix on call: `tags.addTag` becomes `db.tags.addTag` if you don't rename, or `db.tags.add` if you do).

**Gotcha.** Lots of call sites get touched. If the rename is purely mechanical (`db.X` → `db.domain.X`), it's a single PR. If you also strip verb prefixes from method names, that's a second decision worth making explicitly. I'd do the call-site move first and the rename second.

---

### 4. Port `src/web/` to TypeScript

**What.** The SPA is plain JS with JSDoc type hints. Everything from `app.js` to `views/series.js` to `api.js`. The main process is fully TypeScript with strict mode.

**Why it matters.** The new functions added in this work (`fetchSeries`, `fetchSeriesChapters`, `searchAll`, etc.) are documented with JSDoc but not enforced. The SPA freely passes `chapter.chapterNumber` even when the API response shape doesn't include it (we hit exactly this bug during Phase 8). A TS compiler would have caught it.

**How to implement.**
- Add a `tsconfig.json` for `src/web/` with browser target (ES2022, DOM lib).
- Rename `.js` → `.ts` in waves: `api.js` first (it has the cleanest types via the route shapes); then `app/router.js` and `app/state.js`; then views; then admin; finally `host/index.js`.
- Wire a build step: Vite or esbuild emitting ESM bundles. The current setup serves raw ES modules; that breaks under TS without a transpile step.
- Share types with the main process via `src/shared/`. The route response shapes (e.g. `WebComicRecord`, `SearchHit`) become the contract.

**Gotcha.** The build-step requirement is the real cost. Today the dev loop is "edit `.js`, refresh browser." TS adds a watch+transpile step. Use Vite's HMR to keep the loop fast. The benefit is cumulative — most bugs in SPA work this session were shape mismatches between API and view.

---

### 5. Replace per-route regex matching with a router

**What.** Each `webServer/routes/*.ts` exports a `handle: RouteHandler` that does its own `pathname.match(/^\/api\/series\/(\d+)$/)` chain. With 11 route files and ~50 endpoints, every request walks all 11 files in order, each running its regex chain until one returns true.

**Why it matters.** Dispatch is O(N) regex matches per request. Not slow at our scale, but the pattern is bug-prone — registration order matters (we hit this in Phase 7 where `seriesRoutes` had to register before `progressRoutes` to claim `/api/series/:id` ahead of the deprecation shim). Hard to see the route map at a glance; impossible to grep for "what handles `/api/foo/:id`" without reading every file.

**How to implement.**
- Adopt a small router. `find-my-way` is an obvious choice (already in fastify's transitive deps). It builds a radix tree and gives O(log N) lookups plus introspection.
- Each route file exports a `register(router)` function instead of a `handle` function. Inside: `router.on('GET', '/api/series/:id', handler)`.
- The dispatch chain in `webServer/server.ts` becomes a single `router.lookup(req, res)` call.
- Path params come back as a typed object instead of regex match groups.

**Gotcha.** The existing code uses raw `http.IncomingMessage` / `http.ServerResponse`; `find-my-way` works at that layer (it's not Fastify-specific). Migration can be incremental — register the new router *and* keep the existing chain, route-by-route move endpoints over.

---

## Smaller wins

### 6. `applyRunDetection` mutates `ResolvedMetadata` in place

**What.** Inside `IngestService.flushBatch`, `applyRunDetection(batch)` walks each prepared insert and *mutates* `m.volumeNumber` / `m.volumeLabel` on the resolver's output. The function returns void.

**Why it matters.** `ResolvedMetadata` is otherwise treated as immutable in the precedence chain. The mutation here is a footgun — if anyone caches a `ResolvedMetadata` somewhere else, they'll see the post-run-detection values, not the original.

**How to implement.** Change `applyRunDetection` to return a `Map<filePath, { volumeNumber, volumeLabel }>` (parallel to the deleted `computeRunBuckets`). The caller looks up each file's run assignment when constructing the volume. ~20 lines, no ABI change.

---

### 7. Factor a `bootstrap(db)` helper for the dual startup path in `index.ts`

**What.** `src/main/index.ts` has two near-identical startup paths — one for Electron desktop mode, one for headless. Both: `setImageCacheRoot(...)`, `new LibraryDatabase(dbPath)`, `db.initialize()`, `startSweeperSchedule(db)`. About 15 lines duplicated.

**Why it matters.** When something's added to the bootstrap (e.g. registering a new background job), it has to be added in two places.

**How to implement.** Extract `function bootstrap(userDataPath): LibraryDatabase` that returns the initialized handle. Both startup branches call it. ~10 minutes.

---

### 8. Commit `consolidate-marvel-backup.py` to the repo

**What.** The Python ops script we wrote earlier in this session lives at `~/consolidate-marvel-backup.py`, outside the repo. It's a real, working tool the user ran on their library.

**Why it matters.** External-to-repo scripts get lost. The tool documents an opinionated way to clean up the canonical Marvel-archive layout (YYYYMM-prefixed folders → consolidated series folders), which is referenced indirectly throughout `docs/hierarchy/requirements.md`.

**How to implement.** `mkdir scripts/`, copy the file in, add a short `scripts/README.md` explaining what each script does and its dry-run / apply protocol. ~5 minutes.

---

### 9. Consolidate the two FTS-query paths

**What.** `queryComics` (`db/comics.ts`) does its own FTS lookup against `comics_fts` for in-grid search. `unionSearch` (`db/search.ts`) does another FTS lookup against the same table for the cross-kind endpoint. The token-prep step (`buildFtsQuery`) is shared, but the SQL paths are independent.

**Why it matters.** Two implementations means two places to update if FTS5 syntax changes (e.g. column-weighted ranking, prefix-match toggles, snippets). Easy to drift.

**How to implement.** Extract a `searchComics(db, q, scope?, limit?)` helper in `db/search.ts` that returns chapter rows. `queryComics` calls it when `options.search` is set; `unionSearch`'s chapter half calls it. Tradeoff: `queryComics` returns rich list-shape rows including JOINed user-progress, so the helper signature has to support both shapes — easier to leave as is unless one path actively diverges.

---

### 10. Factor an `ftsTable(...)` helper

**What.** `comics_fts` and `series_fts` share a near-identical setup pattern: `CREATE VIRTUAL TABLE`, three triggers (insert / delete / update), a count-based rebuild check. Currently spelled out twice in `db/schema/migrations.ts`.

**Why it matters.** Adding a third FTS source (e.g. `tags_fts` for user-defined tags) means a third copy. The trigger SQL is mechanical.

**How to implement.** Helper signature: `ensureFtsTable(db, { name, source, rowid='id', columns: string[] })`. Generates the DDL with the right column lists in the table, the three triggers, and the rebuild check. Drop-in replacement for `ensureSearchIndex` and `ensureSeriesSearchIndex`.

**Gotcha.** Series FTS's triggers wrap each column in `COALESCE(col, '')` because some series fields are nullable; comics FTS doesn't do that. The helper has to either always-COALESCE (cheap but a tiny bit wasteful for non-null columns) or accept a per-column "nullable?" flag. I'd always-COALESCE — the cost is irrelevant.

---

### 11. Pure constructor for `LibraryDatabase`

**What.** `new LibraryDatabase(dbPath)` opens the DB inside the constructor (calls `openOrRecreate`). Side effects in constructors are awkward for testing — you can't construct the object without touching disk.

**Why it matters.** Tests work around this by passing `:memory:`, which is fine but obscures the disk-I/O dependency. Mocking is harder than it should be.

**How to implement.** Split into `new LibraryDatabase()` (pure, takes no args) plus `db.open(path)` (does the I/O). Optionally a static `LibraryDatabase.open(path)` for the common case. Real callers — there's only one in `index.ts` per startup path — change one line.

**Gotcha.** Backward compat is not a concern here (green-field), so this is purely an aesthetic/testability call. Lower priority than items 1-5.

---

## Suggested order

If you tackle these in series:

1. **Items 1 + 3 together** — `MediaRecord` split and the facade unification touch the same call sites. Doing them in one pass is cheaper than two.
2. **Item 7** (bootstrap helper) — trivial win, do anytime.
3. **Item 8** (commit the script) — trivial, do anytime.
4. **Item 6** (run-detection no-mutate) — small, isolated, do anytime.
5. **Item 2** (split `db/comics.ts`) — independent of the rest; do whenever the file gets in your way again.
6. **Item 4** (TS port of `web/`) — biggest infrastructure change. Schedule when there's a free week and no parallel feature work.
7. **Item 5** (router) — schedule alongside the next route-heavy feature (OPDS, gap #1) so the new endpoints land on the new dispatch.
8. **Items 9, 10, 11** — opportunistic. Pick up if you're already in the area.

Nothing here is blocking new work. Each item is independently shippable and reverse-mergable.
