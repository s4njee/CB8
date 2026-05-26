/**
 * seriesParser.ts — parse series/volume/chapter info out of a comic filename.
 *
 * Handles patterns such as:
 *   "Title v01"                    → { seriesName: 'Title', volumeNumber: 1 }
 *   "Title Vol. 3 Ch. 12"          → { seriesName: 'Title', volumeNumber: 3, chapterNumber: 12 }
 *   "Title #005"                   → { seriesName: 'Title', chapterNumber: 5 }
 *   "Title (2020) #01"             → { seriesName: 'Title', chapterNumber: 1 }
 *   "[Group] Title v01"            → { seriesName: 'Title', volumeNumber: 1 }
 *   "Title v01 (Digital) (f)"      → { seriesName: 'Title', volumeNumber: 1 }
 *   "Title c001-005"               → { seriesName: 'Title', chapterNumber: 1 }
 *
 * Returns all-null fields when no pattern matches (standalone book).
 */

export interface SeriesInfo {
  seriesName: string | null;
  volumeNumber: number | null;
  chapterNumber: number | null;
}

export function normalizeSeriesName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').trim();
}

/**
 * Sort key for series.sort_name. Lowercases via en-US locale, collapses
 * whitespace, and zero-pads runs of digits to 10 places so plain
 * `COLLATE NOCASE` ordering matches a natural-numeric sort
 * ("Volume 2" < "Volume 10"). See docs/hierarchy/design.md §4.4.
 *
 * Pure function — also bound as a SQLite UDF (`cb8_sort_name`) during
 * the v7 backfill so we can compute sort_name in pure SQL.
 */
export function computeSortName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\d+/g, (run) => run.padStart(10, '0'));
}

/**
 * Parse a folder name like `Avengers v1`, `Doom 2099 v1`, `Captain America v3`
 * into a (seriesName, volumeNumber) pair. Implements R-20 from
 * `docs/hierarchy/requirements.md`.
 *
 * Strict regex `^(.+?) v(\d+)$` (with the `v` case-insensitive but a
 * single space required, integer digits only). Returns null when the
 * name does not match the pattern — examples that intentionally fail:
 *   - `Avengers vs Pet Avengers` (no digits after the v)
 *   - `Avengers Forever`         (no v token)
 *   - `1602`                     (no volume marker)
 *   - `Foo v1.5`                 (decimal — only integers per R-20)
 *   - `vN`                       (no series name preceding the marker)
 */
export interface FolderVolumeMarker {
  seriesName: string;
  volumeNumber: number;
}
export function parseFolderVolumeMarker(folderName: string): FolderVolumeMarker | null {
  if (typeof folderName !== 'string') return null;
  const trimmed = folderName.trim();
  // (.+?) matches at least one char, lazy. Then a single literal space, the v,
  // and integer digits to end of name. The `i` flag makes the v case-insensitive.
  const m = trimmed.match(/^(.+?) v(\d+)$/i);
  if (!m) return null;
  const series = normalizeSeriesName(m[1]);
  if (!series) return null;
  const num = parseInt(m[2], 10);
  if (!Number.isFinite(num)) return null;
  return { seriesName: series, volumeNumber: num };
}

/**
 * Strip a `YYYYMM ` filename prefix and capture the publication date.
 * Implements R-21 from `docs/hierarchy/requirements.md`.
 *
 * Plausibility-checked so non-date numeric prefixes (`199913 Foo.cbz`,
 * month=13) aren't mis-stripped:
 *   - year ∈ [1900, currentYear+5]
 *   - month ∈ [1, 12]
 *
 * On match, returns `{ stripped, year, month }`. On miss, returns
 * `{ stripped: filename }` so the caller can chain into the next
 * heuristic without juggling null shapes.
 */
export interface DatePrefixResult {
  stripped: string;
  year?: number;
  month?: number;
}
export function stripDatePrefix(filename: string): DatePrefixResult {
  if (typeof filename !== 'string' || filename.length < 7) return { stripped: filename };
  const m = filename.match(/^(\d{4})(\d{2}) (.+)$/);
  if (!m) return { stripped: filename };
  const year  = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const yearMax = new Date().getUTCFullYear() + 5;
  if (year < 1900 || year > yearMax) return { stripped: filename };
  if (month < 1 || month > 12) return { stripped: filename };
  return { stripped: m[3], year, month };
}

/**
 * Derive a coarse series key for Marvel chronology-style names where the
 * filesystem name is often `YYYYMM Series Name 014` or `YYYYMM Series Name`.
 * Drops a leading date prefix and trailing issue-like numeric tokens, then
 * normalizes whitespace. This is intentionally a grouping helper, not a full
 * metadata parser: callers still use `parseSeriesFromFilename` to recover
 * chapter/volume values from the actual filename.
 */
export function chronologyGroupingName(name: string): string | null {
  if (!name) return null;
  const noExt = name.replace(/\.[^./\\]+$/, '');
  let cleaned = stripDatePrefix(noExt).stripped
    .replace(/\.(?!\d)/g, ' ')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  // Remove bracketed scanner/format tags from the right edge first so the
  // trailing issue token can be found in names like `Foo 014 (Digital)`.
  let prev: string;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(/\s*[\[({][^\])}]+[\])}]\s*$/g, '').trim();
  } while (cleaned !== prev);

  // Drop common cover-count suffixes, then one issue-like trailing number.
  cleaned = cleaned
    .replace(/\s+\d{1,3}\s+of\s+\d{1,3}\s+covers?\s*$/i, '')
    .replace(/\s+\d{1,3}(?:\.\d+)?\s*$/i, '')
    .trim();

  const normalized = normalizeSeriesName(cleaned);
  return normalized.length >= 3 ? normalized : null;
}

// Volume/chapter markers require a prefix so series with numeric names
// ("7SEEDS", "20th Century Boys") don't get eaten.
const VOL_RE  = /\b(?:v(?:ol(?:ume)?)?\.?\s*)(\d+(?:\.\d+)?)\b/i;
const CH_RE   = /(?:\bc(?:h(?:apter)?)?\.?\s*|#)(\d+(?:\.\d+)?)(?:-\d+(?:\.\d+)?)?\b/i;
const YEAR_RE = /\((\d{4})\)/;

// Leading scanlation group: "[Stick]" or "(Group)" at very start.
const LEADING_GROUP_RE = /^\s*[\[(][^\])]+[\])]\s*/;

// Trailing bracketed metadata: (Digital), (f), {Group}, [Tag], etc.
const TRAILING_TAG_RE = /\s*[\[({][^\])}]+[\])}]\s*$/;

export function parseSeriesFromFilename(filename: string): SeriesInfo {
  if (!filename) return { seriesName: null, volumeNumber: null, chapterNumber: null };

  const noExt = filename.replace(/\.[^./\\]+$/, '');
  // Dots act as separators ("Title.v01") except when part of a decimal ("v1.5").
  const cleaned = noExt
    .replace(/\.(?!\d)/g, ' ')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const volMatch = cleaned.match(VOL_RE);
  const chMatch  = cleaned.match(CH_RE);
  const volumeNumber  = volMatch ? parseFloat(volMatch[1]) : null;
  let   chapterNumber = chMatch  ? parseFloat(chMatch[1])  : null;

  // R-21 fallback: the Marvel-style scan layout (`Avengers v1 191`) puts
  // the chapter as a bare trailing number after the volume marker. Only
  // promote this when a volume marker was found AND the trailing number
  // sits *after* it, so we don't misread a year suffix or a series-name
  // numeric tail like `Doom 2099` as a chapter.
  if (chapterNumber == null && volMatch?.index != null) {
    const afterVol = cleaned.slice(volMatch.index + volMatch[0].length);
    const tail = afterVol.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*$/);
    if (tail) chapterNumber = parseFloat(tail[1]);
  }

  // Series = everything before the first volume/chapter/year marker.
  let cutIndex = cleaned.length;
  for (const re of [VOL_RE, CH_RE, YEAR_RE]) {
    const m = cleaned.match(re);
    if (m?.index != null && m.index < cutIndex) cutIndex = m.index;
  }

  // R-21 / Marvel-style bare-trailing-number fallback: `Darth Vader 001 (2015)`,
  // `Foo Bar 005`. Only applies when neither volume nor chapter markers
  // matched, and the bare number is 1-3 digits (typical comic issue width)
  // so a 4-digit publication-year-shaped number doesn't get mistaken for a
  // chapter (e.g. `Doom 2099` — 4 digits stays in the series name).
  if (volumeNumber == null && chapterNumber == null) {
    const prefix = cleaned.slice(0, cutIndex);
    const tail = prefix.match(/\s+(\d{1,3}(?:\.\d+)?)\s*$/);
    if (tail) {
      chapterNumber = parseFloat(tail[1]);
      cutIndex = prefix.length - tail[0].length;
    }
  }

  if (volumeNumber == null && chapterNumber == null) {
    return { seriesName: null, volumeNumber: null, chapterNumber: null };
  }

  let series = cleaned.slice(0, cutIndex);

  // Strip leading scanlation group (only once, at start).
  series = series.replace(LEADING_GROUP_RE, '');

  // Strip any trailing bracketed tags that fall between series and marker.
  // Loop because there can be several: "Title (Group) (Digital)".
  let prev: string;
  do { prev = series; series = series.replace(TRAILING_TAG_RE, ''); } while (series !== prev);

  // Strip trailing separators.
  series = series.replace(/[\s\-–—|•·~]+$/, '').trim();

  const normalized = normalizeSeriesName(series);
  return {
    seriesName: normalized.length > 0 ? normalized : null,
    volumeNumber,
    chapterNumber,
  };
}
