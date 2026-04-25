# PLAN8

Robustness and security audit notes for the current web/LAN deployment.

## Status

- Completed:
  - bootstrap admin password moved out of source and into `CB8_INITIAL_ADMIN_PASSWORD`
  - schema collapsed into a single final definition
  - migration module removed
  - unused better-auth-era schema pieces removed from the active DB definition
  - existing SQLite DB deleted so the app can recreate from the final schema
- Remaining:
  - the items below are still open unless explicitly noted otherwise

## Objectives

- Keep the app accessible over the LAN.
- Remove fragile legacy design choices.
- Simplify the schema so the database reflects the runtime model.
- Tighten security without breaking the LAN use case.

## Priority 1: Fix insecure bootstrap and deployment defaults

### Status

- Partially completed.
- Done:
  - hardcoded bootstrap password removed from source
  - bootstrap password now comes from environment/config
- Still open:
  - guest access still defaults to enabled
  - LAN exposure warnings and stricter first-run policy are not yet implemented

### Current concerns

- The server binds to `0.0.0.0` by default, which is correct for LAN access, but the rest of the security posture is too permissive for that exposure.
- Guest read access is enabled by default unless explicitly disabled.
- The initial admin account is created with a hardcoded password in source.

### Recommended direction

- Keep LAN binding, but make the first-run auth posture strict:
  - guest access should default to disabled
  - admin authentication should be required for all write operations
  - the bootstrap password should come from environment/config, not source
- Move the default bootstrap credential to an env var such as `CB8_INITIAL_ADMIN_PASSWORD`.
- Fail startup if no admin exists and no bootstrap password is configured, or require an explicit first-run setup flow.
- Log a strong warning when running on `0.0.0.0` with guest access enabled.
- Add a separate “LAN mode” configuration section so the exposed-server posture is explicit rather than accidental.

### Preferred design from scratch

- `0.0.0.0` remains opt-in or explicitly documented for LAN mode.
- No hardcoded secrets in source.
- First-run setup creates the initial admin with an operator-supplied secret.

## Priority 2: Unify authentication and session storage

### Status

- Partially completed.
- Done:
  - abandoned better-auth tables were removed from the final schema
  - dead `account` synchronization code was removed
  - sessions are now persisted in SQLite instead of process memory
- Still open:
  - session management is still minimal and lacks admin/session observability
  - cookie hardening and CSRF protections are still not implemented

### Current concerns

- Runtime auth uses an in-memory session map.
- The schema still includes legacy `session`, `account`, and `verification` tables from the abandoned better-auth path.
- Sessions disappear on restart and the schema does not match the runtime model.

### Recommended direction

- Choose one auth model and remove the dead compatibility layer.
- If the app is intended to be used over the LAN by multiple devices, prefer DB-backed sessions:
  - persistent session table
  - expiry enforcement
  - logout/revocation support
  - optional session listing for admins
- If DB-backed sessions are adopted, the original schema should be folded into that final model rather than keeping partial better-auth leftovers plus an in-memory store.

### Schema cleanup target

- Keep only the auth tables that are actively used.
- Remove unused columns and backfill code tied to abandoned auth approaches.
- Replace “repair forever” compatibility logic with one clean migration path.

## Priority 3: Remove XSS-prone rendering paths in the web UI

### Status

- Not started.

### Current concerns

- Several UI paths interpolate server/user-controlled values directly into `innerHTML`.
- Comic titles, tags, filenames, extensions, and error messages can flow into HTML construction.

### Recommended direction

- Replace interpolated `innerHTML` with:
  - `textContent`
  - explicit DOM node creation
  - narrowly-scoped templating helpers where HTML is unavoidable
- Add a Content Security Policy suitable for the app.
- Treat all metadata and filenames as untrusted input.

### Preferred design from scratch

- No user or file-derived content is inserted via raw HTML.
- UI primitives enforce escaped text by default.

## Priority 4: Normalize reading progress

### Status

- Not started.

### Current concerns

- Reading state exists both on `comics` and in `user_progress`.
- Request handlers update both stores.
- This creates drift risk and makes guest/device semantics unclear.

### Recommended direction

- Make one table the source of truth.
- Preferred model:
  - `comics` stores library/media metadata only
  - `user_progress` stores all per-user reading state
  - optional anonymous/guest progress is stored separately if needed
- Remove duplicated `last_page`, `last_location`, `last_read`, and `completed` fields from `comics` once migrated.

### Migration note

- This is a good candidate for folding legacy columns out of the “final” schema after a one-time migration.

## Priority 5: Make DB startup safer

### Status

- Not started.
- The DB is now recreated from a single final schema, but the recovery path is still broader than it should be.

### Current concerns

- The startup path can recreate the DB when the open/init block throws broadly.
- Non-corruption failures could be misclassified and lead to data loss.

### Recommended direction

- Only recreate when corruption is positively identified.
- Otherwise:
  - fail startup
  - surface a clear error
  - preserve the existing DB files
- Add integrity checks and backup guidance before destructive recovery.

### Preferred design from scratch

- Corruption recovery is explicit and conservative.
- Automatic deletion is the last resort, not the default fallback.

## Priority 6: Harden filesystem ingestion APIs

### Status

- Not started.

### Current concerns

- Uploads stream directly to disk without explicit quota/size enforcement.
- Server-path listing and indexing expose host filesystem behavior over the LAN to any admin session.
- Some host-path operations are described as local-machine features, but enforcement is inconsistent.

### Recommended direction

- Keep LAN administration, but constrain it:
  - add explicit upload size limits
  - stage uploads to temp files, then move atomically
  - add per-library or global storage quotas
  - record ingest failures in structured logs
- For direct server-path operations, decide explicitly whether they are:
  - LAN-admin features, or
  - host-only features
- If they remain LAN-admin features, scope them to configured root directories instead of arbitrary filesystem access.

### Preferred design from scratch

- Admin file ingestion is policy-driven:
  - allowed roots
  - size limits
  - temp staging
  - audit logging

## Priority 7: Redesign query/search for large libraries

### Status

- Not started.

### Current concerns

- Search uses `%term% LIKE`, which will not scale well to large libraries.
- Tag loading does an extra query per comic row.
- The current design will struggle to meet the stated 100k-item requirements.

### Recommended direction

- Introduce FTS5 or a dedicated search index table.
- Batch tag hydration instead of querying tags per row.
- Add indexes for real query patterns, not just generic columns.
- Benchmark against generated large datasets before calling the library scalable.

### Preferred design from scratch

- Full-text search for title/path/tag discovery.
- Query plans verified with realistic large-library fixtures.
- Derived views or pre-joined projections for common listing screens.

## Priority 8: Separate core data from caches and derived artifacts

### Status

- Not started.

### Current concerns

- Thumbnails are stored directly in the main relational table.
- Repair jobs and cache invalidation are compensating for mixed responsibilities.

### Recommended direction

- Keep the main DB focused on durable metadata and relationships.
- Move thumbnails and other derived artifacts into a cache layer keyed by content hash or file identity.
- Make regeneration safe and disposable.

### Preferred design from scratch

- Library DB = source-of-truth metadata.
- Cache store = thumbnails, resized images, transient derived outputs.

## Concrete refactor themes

- Remove hardcoded bootstrap secrets from source and replace with env/config.
- Collapse legacy auth schema into the actual chosen auth implementation.
- Eliminate duplicated reading-progress state.
- Replace unsafe DOM HTML injection with safe rendering primitives.
- Replace broad “repair” behavior with explicit migrations plus narrow one-shot data fixes.
- Constrain LAN-exposed admin filesystem features with explicit policy.

## Suggested implementation order

1. Finish LAN-safe bootstrap/auth defaults
2. Persist sessions and complete auth unification
3. Remove XSS-prone DOM rendering paths
4. Normalize reading progress
5. Tighten DB recovery behavior
6. Harden ingestion and filesystem exposure
7. Redesign large-library search/query paths
8. Separate metadata from caches and derived artifacts
