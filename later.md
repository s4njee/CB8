# Later

Deferred ideas and follow-ups, captured so they're not lost.

## Custom continuous-scroll EPUB reader

**Context.** The EPUB reader is built on Readium (`flutter_readium`). Readium's
scroll mode scrolls *within a single resource (chapter)* — it does **not** flow
continuously from one chapter into the next. Verified on iOS *and* Android, and
it behaved the same on flureadium, so it's a Readium-engine trait, not a plugin
gap. To move between chapters you page/navigate; you can't just keep scrolling.

**Decision (now).** Ship **only Single page and Two pages** for EPUB — scroll is
removed from the EPUB reading-mode menu. Paginated page-turns cross chapter
boundaries seamlessly, so this is the clean default. (Scroll mode stays for the
*comic* reader, which has its own continuous vertical layout.)

**Idea (later).** Build a custom continuous (webtoon-style) vertical scroll on
top of Readium that stitches resources together: a Flutter scroll view that
renders/preloads adjacent resources and maps scroll offset → Locator, so reading
flows chapter-to-chapter. This is real work (fighting the engine's per-resource
model), hence deferred. Revisit if continuous EPUB scroll becomes a priority.

## Whole-book EPUB scrubber with chapter ticks (2026-07-06)

**Context.** The unified reader's scrubber (`unified_reader_screen.dart`,
`_progressBar`) is deliberately **per-chapter**: Readium's `goToProgression`
only seeks within the current resource, so a whole-book slider couldn't honor
its own drags. The current compromise pairs the per-chapter slider with a
whole-book label ("Ch 7/38 · 42%", from `locations.totalProgression`).

**Idea (later).** Make the slider whole-book, with tick marks at chapter
boundaries. Seeking across chapters is possible via `goToLocator` — the work is
**per-resource weighting**: a map of each spine resource's share of the book so
a slider position resolves to `(resource href, progression within it)` and back.
Weights could come from resource byte lengths (cheap, approximate) or the
publication's positions list (accurate). Until then the label already answers
"how far into the book am I".

## Deferred perf work that's really product work (2026-07-06)

Top items from the Flutter "deferred" list in [`perf.md`](perf.md) that need
product/design decisions, not just tuning — reasoning captured there:

- **Per-table change granularity** — a progress write currently refetches
  tags/libraries/series too; `TableUpdateQuery.onTable(...)` per provider group
  needs a wider `LibrarySource` seam (remote has no change stream). perf.md
  Flutter-deferred #1.
- **Browse-grid pagination** — `LibraryQuery.limit` defaults to 60 with no
  load-more, so large libraries silently truncate the All grid. perf.md
  Flutter-deferred #2.
- **FTS5 local search** — local search is `LIKE '%…%'` over title/series/author;
  real search wants an FTS5 table + query syntax decisions. perf.md
  Flutter-deferred #5.
