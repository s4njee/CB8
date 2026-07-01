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
