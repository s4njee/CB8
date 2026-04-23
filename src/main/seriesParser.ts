/**
 * seriesParser.ts — parse series/volume/chapter info out of a comic filename.
 *
 * Handles patterns such as:
 *   "Title v01"               → { seriesName: 'Title', volumeNumber: 1 }
 *   "Title Vol. 3 Ch. 12"     → { seriesName: 'Title', volumeNumber: 3, chapterNumber: 12 }
 *   "Title #005"              → { seriesName: 'Title', chapterNumber: 5 }
 *   "Title (2020) #01"        → { seriesName: 'Title', chapterNumber: 1 }
 *
 * Returns all-null fields when no pattern matches (standalone book).
 */

export interface SeriesInfo {
  seriesName: string | null;
  volumeNumber: number | null;
  chapterNumber: number | null;
}

export function normalizeSeriesName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/\s+$/, '').trim();
}

const VOL_RE = /\b(?:v(?:ol(?:ume)?)?\.?\s*)(\d+(?:\.\d+)?)\b/i;
const CH_RE  = /\b(?:c(?:h(?:apter)?)?\.?\s*|#)(\d+(?:\.\d+)?)\b/i;
const YEAR_RE = /\((\d{4})\)/;

export function parseSeriesFromFilename(filename: string): SeriesInfo {
  if (!filename) return { seriesName: null, volumeNumber: null, chapterNumber: null };

  // Strip extension
  const noExt = filename.replace(/\.[^./\\]+$/, '');
  // Replace underscores/dots with spaces for easier parsing
  const cleaned = noExt.replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();

  let volumeNumber: number | null = null;
  let chapterNumber: number | null = null;

  const volMatch = cleaned.match(VOL_RE);
  if (volMatch) volumeNumber = parseFloat(volMatch[1]);

  const chMatch = cleaned.match(CH_RE);
  if (chMatch) chapterNumber = parseFloat(chMatch[1]);

  if (volumeNumber == null && chapterNumber == null) {
    return { seriesName: null, volumeNumber: null, chapterNumber: null };
  }

  // Series = everything before first volume/chapter/year marker
  let cutIndex = cleaned.length;
  for (const re of [VOL_RE, CH_RE, YEAR_RE]) {
    const m = cleaned.match(re);
    if (m && m.index != null && m.index < cutIndex) cutIndex = m.index;
  }
  let seriesCandidate = cleaned.slice(0, cutIndex).trim();
  // Strip trailing dash/pipe/bullets commonly used as separators
  seriesCandidate = seriesCandidate.replace(/[-|•·~]+$/, '').trim();
  const series = normalizeSeriesName(seriesCandidate);

  return {
    seriesName: series.length > 0 ? series : null,
    volumeNumber,
    chapterNumber,
  };
}
