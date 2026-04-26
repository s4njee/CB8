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
  const chapterNumber = chMatch  ? parseFloat(chMatch[1])  : null;

  if (volumeNumber == null && chapterNumber == null) {
    return { seriesName: null, volumeNumber: null, chapterNumber: null };
  }

  // Series = everything before the first volume/chapter/year marker.
  let cutIndex = cleaned.length;
  for (const re of [VOL_RE, CH_RE, YEAR_RE]) {
    const m = cleaned.match(re);
    if (m?.index != null && m.index < cutIndex) cutIndex = m.index;
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
