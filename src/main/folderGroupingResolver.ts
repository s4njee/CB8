/**
 * folderGroupingResolver.ts — per-directory recurring-base-name detection
 * for R-17 (folder-as-series grouping). Used by `metadataResolver` (T-5.1)
 * during ingest.
 *
 * Algorithm:
 *   1. List comic files (`.cbz`/`.cbr`/`.cb7`/`.cbt`) directly in the dir.
 *   2. For each filename, derive a comparison key by stripping extension,
 *      stripping the YYYYMM date prefix (R-21), lowercasing, and collapsing
 *      whitespace.
 *   3. Find the longest prefix shared by at least two of those keys.
 *   4. If the prefix is at least `MIN_PREFIX_LEN` chars, return a matcher.
 *      The matcher's `matches(filename)` rule: the filename's *own* key
 *      starts with the prefix. Strangers in the folder fail this gate.
 *
 * Result is cached per-directory so a 50-file folder is only scanned once.
 * Caller pattern: construct a `FolderGroupingResolver` per ingest run, call
 * `resolve(dir)` for each file's parent directory.
 */
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { chronologyGroupingName, stripDatePrefix } from './seriesParser';

const COMIC_EXTS = new Set(['.cbz', '.cbr', '.cb7', '.cbt']);
const MIN_PREFIX_LEN = 3;
const MIN_FILES_FOR_GROUPING = 2;

export interface FolderGrouping {
  /** Lowercased prefix shared by at least 2 sibling comic files. */
  recurringPrefix: string;
  /** Display series name derived from the recurring prefix. */
  seriesName: string;
  /** True iff this filename's normalised key starts with `recurringPrefix`. */
  matches(filename: string): boolean;
}

/** Drop extension and YYYYMM date prefix, lowercase, collapse whitespace. */
export function comparisonKey(filename: string): string {
  const grouped = chronologyGroupingName(filename);
  if (grouped) return grouped.toLocaleLowerCase('en-US');
  const noExt = filename.replace(/\.[^./\\]+$/, '');
  const stripped = stripDatePrefix(noExt).stripped;
  return stripped.toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
}

/** Length of the longest common leading substring of `a` and `b`. */
function lcp(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/** True if `c` (or end-of-string) is a word boundary character. */
function isBoundaryCharCode(cc: number): boolean {
  return cc === 0
    || cc === 0x20 || cc === 0x09  // space, tab
    || cc === 0x28 || cc === 0x5b  // ( [
    || cc === 0x29 || cc === 0x5d  // ) ]
    || cc === 0x2d || cc === 0x5f  // - _
    || cc === 0x2c || cc === 0x2e  // , .
    ;
}

/**
 * Trim an LCP back to a word boundary so we don't keep a partial word like
 * `foo 00` (when the underlying files were `foo 001`, `foo 002`). The
 * reference strings `s1` and `s2` are the LCP's source pair; if both have
 * a word-boundary char immediately after the LCP, the LCP is already at a
 * boundary and we keep it as-is.
 */
function trimAtWordBoundary(prefix: string, s1: string, s2: string): string {
  const k = prefix.length;
  const next1 = k < s1.length ? s1.charCodeAt(k) : 0;
  const next2 = k < s2.length ? s2.charCodeAt(k) : 0;
  if (isBoundaryCharCode(next1) && isBoundaryCharCode(next2)) {
    return prefix.replace(/\s+$/, '');
  }
  // Mid-word — trim trailing partial word + any whitespace before it.
  return prefix.replace(/\s+\S+$/, '').replace(/\s+$/, '');
}

/**
 * Find the longest prefix shared by at least `threshold` files among
 * sorted keys, by sliding a window of size `threshold` and taking the
 * max LCP between the window's first and last entry. (Min over the
 * window equals LCP of its endpoints when keys are sorted.)
 */
function longestPrefixWithThreshold(
  sorted: readonly string[],
  threshold: number,
): { prefix: string; a: string; b: string } | null {
  if (threshold > sorted.length) return null;
  let bestLen = 0;
  let bestI = 0;
  for (let i = 0; i + threshold - 1 < sorted.length; i++) {
    const len = lcp(sorted[i], sorted[i + threshold - 1]);
    if (len > bestLen) { bestLen = len; bestI = i; }
  }
  if (bestLen === 0) return null;
  return {
    prefix: sorted[bestI].slice(0, bestLen),
    a: sorted[bestI],
    b: sorted[bestI + threshold - 1],
  };
}

/**
 * Recurring base name for a directory's comic files. Strategy: try
 * threshold T = N first (prefix shared by ALL files). If that yields no
 * useful prefix (e.g. a stranger truncates the all-files LCP to empty),
 * step T down toward MIN_FILES_FOR_GROUPING. The first T whose trimmed
 * prefix meets MIN_PREFIX_LEN wins.
 *
 * Why descending: starting from T=N gives the most reliable prefix
 * (truly shared by everyone) and avoids the failure mode where adjacent
 * sorted same-numbered chapters from different runs (Darth Vader 001
 * (2015) vs (2017)) produce a spurious 20-char "shared" prefix that
 * actually only two files start with.
 */
function longestSharedPrefix(keys: string[]): string {
  const N = keys.length;
  if (N < MIN_FILES_FOR_GROUPING) return '';
  const sorted = [...keys].sort();

  for (let t = N; t >= MIN_FILES_FOR_GROUPING; t--) {
    const candidate = longestPrefixWithThreshold(sorted, t);
    if (!candidate) continue;
    const trimmed = trimAtWordBoundary(candidate.prefix, candidate.a, candidate.b);
    if (trimmed.length >= MIN_PREFIX_LEN) return trimmed;
  }
  return '';
}

export class FolderGroupingResolver {
  private cache = new Map<string, FolderGrouping | null>();

  /**
   * Resolve the recurring base name for `dir`. Returns null if the
   * directory has fewer than 2 comic files, or if no >= 3-char prefix is
   * shared by any pair.
   */
  async resolve(dir: string): Promise<FolderGrouping | null> {
    const key = path.resolve(dir);
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    const result = await this.computeFromDisk(key);
    this.cache.set(key, result);
    return result;
  }

  /**
   * Synchronous variant used by tests and any caller that has the file
   * list pre-computed (e.g. an ingest scanner that already walked the
   * directory).
   */
  resolveFromFilenames(dir: string, filenames: readonly string[]): FolderGrouping | null {
    const key = path.resolve(dir);
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    const result = computeFromFilenames(filenames);
    this.cache.set(key, result);
    return result;
  }

  private async computeFromDisk(dir: string): Promise<FolderGrouping | null> {
    let entries: string[];
    try {
      const dirents = await fsp.readdir(dir, { withFileTypes: true });
      entries = dirents
        .filter((d) => d.isFile() && COMIC_EXTS.has(path.extname(d.name).toLowerCase()))
        .map((d) => d.name);
    } catch {
      return null;
    }
    return computeFromFilenames(entries);
  }
}

function computeFromFilenames(filenames: readonly string[]): FolderGrouping | null {
  const comicNames = filenames.filter((n) => COMIC_EXTS.has(path.extname(n).toLowerCase()));
  if (comicNames.length < MIN_FILES_FOR_GROUPING) return null;
  const keys = comicNames.map(comparisonKey);
  const prefix = longestSharedPrefix(keys);
  if (prefix.length < MIN_PREFIX_LEN) return null;
  return {
    recurringPrefix: prefix,
    seriesName: normalizeDisplayName(prefix),
    matches(filename: string): boolean {
      return comparisonKey(filename).startsWith(prefix);
    },
  };
}

function normalizeDisplayName(prefix: string): string {
  return prefix
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (/^[ivxlcdm]+$/i.test(word)) return word.toUpperCase();
      if (/^[a-z]\.?$/i.test(word)) return word.toUpperCase().replace(/\.$/, '.');
      return word.charAt(0).toLocaleUpperCase('en-US') + word.slice(1);
    })
    .join(' ');
}
