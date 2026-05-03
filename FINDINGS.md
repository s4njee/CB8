# CB8 ← Kavita: Findings

This is the executive summary of the Kavita-vs-CB8 research. The detailed material lives in three sibling documents:

- **`requirements.md`** — every feature CB8 should add, with acceptance criteria, grouped P0/P1/P2.
- **`design.md`** — how each feature is implemented (tech stack, data model, API shape, scanner pipeline, reader internals).
- **`tasks.md`** — milestone-ordered checklist sized to 0.5–3 day units.

---

## 1. Where CB8 Stands Today

CB8 is two Go scripts in this folder:

- `fix_cbz_covers.go` — chooses a reasonable cover image inside a CBZ (`cover.*` at root, else first natural-sorted image, with macOS metadata filtered).
- `restructure_cbz.go` — natural-sorts and renames volumes/chapters into a canonical layout.

There is no service, no database, no reader, no API, no users. The scripts produce a clean directory tree that something else (currently nothing) is meant to consume.

## 2. Where Kavita Sits

Kavita (0.8.7 → 0.9.0) is a self-hosted comic/manga/ebook server built around the same kind of on-disk library CB8 already curates. Its high-leverage features fall into four buckets:

| Bucket | What Kavita has | What CB8 has |
|---|---|---|
| Ingest | Recursive scanner with ComicInfo / OPF / PDF metadata, incremental rescan, fsnotify watch | Manual `go run` over a folder |
| Model | Library → Series → Volume → Chapter graph in a relational DB | None |
| Surface | Web reader (image + EPUB), OPDS feed, REST API, mobile-responsive UI | None |
| Lifecycle | Multi-user, reading progress sync, sessions, collections, smart filters, send-to-device, stats, backups | None |

The on-disk layout work CB8 already does is a real prerequisite for any of this — but everything users *interact* with is missing.

## 3. The Highest-Impact Gaps (in order)

These are the items that, if shipped in order, take CB8 from "scripts" to "viable Kavita alternative." Numbers reference `requirements.md`.

1. **Library scanner + domain model (P0-1, P0-2).** Without a Series/Volume/Chapter graph in Postgres, nothing else exists. The existing CBZ-handling code lifts directly into the scanner.
2. **Web reader, image + EPUB (P0-3, P0-4).** The reader is the product. Bad reader → users export back out to another app.
3. **Reading progress sync + sessions (P0-5, P1-7).** Cross-device continuity is the entire point of running a server vs. shoving CBZs onto an iPad manually.
4. **Multi-user with library ACLs and age gating (P0-6).** Self-hosted servers are shared with family/friends. Per-user gating is non-negotiable.
5. **Cover extraction pipeline (P0-7).** CB8's existing logic is the reference implementation; just needs to feed a derivative cache.
6. **Background job runner (P0-8).** Scan, cover, and metadata work cannot block HTTP. Kavita uses Hangfire; CB8 should use River (Postgres-backed).
7. **Versioned REST API (P0-9).** Required so the UI, OPDS adapter, and any future mobile clients all consume one contract.
8. **OPDS + OPDS-PS (P1-1).** The cheapest way to get CB8 onto every existing iOS/Android comic reader without writing native apps. Punches far above its weight.
9. **Search (P1-4) and Smart Filters / customizable dashboard (P1-12).** A library of >few hundred series is unbrowsable without these; smart filters are a major Kavita differentiator.
10. **External metadata sources (P1-6).** Auto-populating cover/summary/genre/tags is what makes a library feel "alive" without manual editing. Kavita gates this behind Kavita+; CB8 should not.

The full P0/P1/P2 ranking with acceptance criteria is in `requirements.md`. The dependency-aware build order is in `tasks.md`.

## 4. Recommended Tech Stack

Detailed in `design.md`. Headlines:

- **Server: Go** (existing CB8 code is Go; clean static binary; great archive/HTTP stdlib).
- **DB: Postgres 16** (FTS, JSONB for smart filters, concurrent writes from scan + reader).
- **Migrations: goose. Queries: sqlc. Jobs: River.** All Postgres-native — no Redis dep.
- **Frontend: SvelteKit + TS + Tailwind.** Lighter than Next.js; perf-sensitive prefetch logic is cleaner in Svelte.
- **Image processing: libvips via govips.** Fast WebP at 256/512/1024 for covers and pages.
- **Auth: Argon2id + JWT for sessions + opaque named API keys** for OPDS / Mihon / KOReader (matches Kavita's "Named Auth Keys" from 0.8.9).
- **Search: Postgres FTS for v1; Meilisearch as a P2 swap-in.** GIN-indexed tsvector handles ~100k series fine.

## 5. Explicit Non-Goals

Captured in `requirements.md` but worth surfacing:

- No clustered/distributed deployment — single node only.
- No real-time multiplayer reading.
- No native iOS/Android apps — rely on OPDS clients + responsive web.
- No format conversion (CBZ → EPUB).
- Not building a SaaS.

These bound the scope and protect the build order from drifting.

## 6. Suggested Next Step

Pick a milestone in `tasks.md` and start. **Milestone 1** (Foundation: scanner + domain model + jobs) is the unavoidable first chunk; everything else is a wall until the graph exists in Postgres. The first ~6–8 tasks under M1 lift directly from the existing Go scripts.

## References

See the link list at the bottom of `requirements.md` for the Kavita wiki / release-note sources used.
