/**
 * Natural sort comparator for filenames.
 *
 * Splits strings into alternating non-numeric and numeric chunks,
 * comparing numeric chunks by integer value and non-numeric chunks
 * lexicographically. This ensures "page2.jpg" sorts before "page10.jpg".
 */

/**
 * Split a string into alternating non-numeric and numeric chunks.
 * E.g. "page10.jpg" → ["page", "10", ".jpg"]
 */
function splitChunks(s: string): string[] {
  return s.match(/(\d+|\D+)/g) ?? [];
}

/**
 * Compare two strings using natural sort order.
 * Numeric substrings are compared by integer value;
 * non-numeric substrings are compared lexicographically (case-insensitive).
 */
export function naturalCompare(a: string, b: string): number {
  const chunksA = splitChunks(a);
  const chunksB = splitChunks(b);

  const len = Math.min(chunksA.length, chunksB.length);

  for (let i = 0; i < len; i++) {
    const ca = chunksA[i];
    const cb = chunksB[i];

    const isNumA = /^\d+$/.test(ca);
    const isNumB = /^\d+$/.test(cb);

    if (isNumA && isNumB) {
      // Compare as integers
      const diff = parseInt(ca, 10) - parseInt(cb, 10);
      if (diff !== 0) return diff;
      // If numerically equal but different string length (e.g. "01" vs "1"),
      // fall through to compare remaining chunks
    } else if (isNumA !== isNumB) {
      // Numeric chunks sort before non-numeric chunks
      return isNumA ? -1 : 1;
    } else {
      // Both non-numeric: case-insensitive lexicographic comparison
      const cmp = ca.toLowerCase().localeCompare(cb.toLowerCase());
      if (cmp !== 0) return cmp;
    }
  }

  // Shorter string comes first if all compared chunks are equal
  return chunksA.length - chunksB.length;
}
