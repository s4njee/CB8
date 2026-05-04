/**
 * metadataResolver.ts — the per-file precedence chain that drives
 * ingest. Implements the order from `docs/hierarchy/design.md` §5,
 * which folds together R-6, R-16, R-17, R-19, R-20, and R-21:
 *
 *   1. One-shot ancestor guard (R-19): if any directory between the
 *      file and the library root has a basename matching /^one[\s-]?shot$/i,
 *      mark the file as standalone — but ComicInfo can still pull it
 *      back into a series if `<Series>` is present.
 *   2. ComicInfo.xml (R-16): authoritative fields take precedence.
 *   3. Folder name `vN` suffix (R-20): series name + volume number.
 *   4. Folder grouping (R-17): canonical series name from the leaf
 *      directory's basename, gated by per-file prefix match.
 *   5. YYYYMM filename prefix (R-21): capture publication date and
 *      strip from the filename before subsequent parsing.
 *   6. parseSeriesFromFilename (R-6): the existing fallback heuristic.
 *
 * Returns a `ResolvedMetadata` object with `null` for unresolved
 * fields. Callers (ingest's `flushBatch`) upsert series/volume rows
 * and run chapter-collision detection on top of these.
 */
import * as path from 'node:path';
import {
  parseSeriesFromFilename,
  parseFolderVolumeMarker,
  stripDatePrefix,
  normalizeSeriesName,
} from './seriesParser';
import { readFromArchive, type ComicInfo, type AgeRating } from './comicInfoParser';
import { FolderGroupingResolver } from './folderGroupingResolver';

export interface ResolvedMetadata {
  seriesName: string | null;
  volumeNumber: number | null;
  /** Human-readable label for the volume row (e.g. "v1", "2015 run"). */
  volumeLabel: string | null;
  chapterNumber: number | null;
  title: string | null;
  summary: string | null;
  publicationYear: number | null;
  publicationMonth: number | null;
  ageRating: AgeRating;
  /** Raw ComicInfo.xml parsed object, JSON-stringified, or null if absent. */
  comicinfoJson: string | null;
  /** True when the file should ingest as a standalone (R-7). */
  isStandalone: boolean;
}

export interface ResolveOptions {
  /** Library root directory; used to bound the one-shot guard walk. */
  libraryRoot: string;
  /**
   * Caller-provided FolderGroupingResolver so a single ingest run reuses
   * its per-directory cache. If omitted, a fresh resolver is created
   * (mostly useful for one-off lookups in tests).
   */
  folderGrouping?: FolderGroupingResolver;
  /**
   * If provided, skip reading ComicInfo from the archive. Tests use this
   * to drive the precedence chain without spinning up zip plumbing.
   * Pass `null` to explicitly assert "no ComicInfo present" without
   * touching the disk.
   */
  comicInfo?: ComicInfo | null;
}

const ONESHOT_DIR_RE = /^one[\s-]?shot$/i;

/**
 * True if the file lives under a directory named "one-shot" (or
 * "oneshot" / "one shot", case-insensitive) anywhere between
 * `libraryRoot` and the file. R-19.
 *
 * Only directory basenames count — a file literally named
 * `one-shot.cbz` does NOT trigger the guard.
 */
export function isUnderOneShot(filePath: string, libraryRoot: string): boolean {
  const root = path.resolve(libraryRoot);
  const file = path.resolve(filePath);
  if (!file.startsWith(root + path.sep) && file !== root) return false;
  const rel = path.relative(root, path.dirname(file));
  if (!rel) return false;
  for (const segment of rel.split(path.sep)) {
    if (ONESHOT_DIR_RE.test(segment)) return true;
  }
  return false;
}

function emptyMetadata(): ResolvedMetadata {
  return {
    seriesName: null,
    volumeNumber: null,
    volumeLabel: null,
    chapterNumber: null,
    title: null,
    summary: null,
    publicationYear: null,
    publicationMonth: null,
    ageRating: 'unknown',
    comicinfoJson: null,
    isStandalone: false,
  };
}

/** Apply ComicInfo to an in-progress metadata object (mutating). */
function applyComicInfo(out: ResolvedMetadata, ci: ComicInfo): void {
  if (ci.series)        out.seriesName       = normalizeSeriesName(ci.series);
  if (ci.volume != null) {
    out.volumeNumber = ci.volume;
    out.volumeLabel  = `v${ci.volume}`;
  }
  if (ci.number != null) out.chapterNumber   = ci.number;
  if (ci.title)         out.title            = ci.title;
  if (ci.summary)       out.summary          = ci.summary;
  if (ci.year != null)  out.publicationYear  = ci.year;
  if (ci.month != null) out.publicationMonth = ci.month;
  if (ci.ageRating !== 'unknown') out.ageRating = ci.ageRating;
  try {
    out.comicinfoJson = JSON.stringify(ci.raw);
  } catch {
    out.comicinfoJson = null;
  }
}

/**
 * The precedence chain. See module-level docstring for the order.
 */
export async function resolve(filePath: string, opts: ResolveOptions): Promise<ResolvedMetadata> {
  const out = emptyMetadata();
  const dir = path.dirname(filePath);
  const folderName = path.basename(dir);
  const fileName = path.basename(filePath);

  // 1. One-shot guard. ComicInfo can reverse this if it names a series.
  if (isUnderOneShot(filePath, opts.libraryRoot)) {
    out.isStandalone = true;
  }

  // 2. ComicInfo.xml — authoritative for the fields it provides.
  const ci = opts.comicInfo !== undefined
    ? opts.comicInfo
    : await readFromArchive(filePath);
  if (ci) {
    applyComicInfo(out, ci);
    if (out.seriesName) out.isStandalone = false;
  }

  // 3. Folder name `vN` suffix.
  const folderVol = parseFolderVolumeMarker(folderName);
  if (folderVol) {
    if (out.seriesName == null)   out.seriesName   = folderVol.seriesName;
    if (out.volumeNumber == null) out.volumeNumber = folderVol.volumeNumber;
    if (out.volumeLabel == null)  out.volumeLabel  = `v${folderVol.volumeNumber}`;
  }

  // 4. Folder grouping (R-17). Don't apply inside one-shot containers, where
  // sibling-name similarity is incidental, not a series signal.
  if (out.seriesName == null && !out.isStandalone) {
    const fg = opts.folderGrouping ?? new FolderGroupingResolver();
    const grouping = await fg.resolve(dir);
    if (grouping && grouping.matches(fileName)) {
      out.seriesName = normalizeSeriesName(folderName);
    }
  }

  // 5. Strip YYYYMM filename prefix and capture publication date if not
  //    already set. Subsequent filename heuristics work on the post-strip name.
  const dp = stripDatePrefix(fileName);
  if (out.publicationYear  == null && dp.year  != null) out.publicationYear  = dp.year;
  if (out.publicationMonth == null && dp.month != null) out.publicationMonth = dp.month;

  // 6. Filename fallback for anything still unset.
  const filenameInfo = parseSeriesFromFilename(dp.stripped);
  if (out.seriesName == null    && filenameInfo.seriesName)    out.seriesName    = filenameInfo.seriesName;
  if (out.volumeNumber == null  && filenameInfo.volumeNumber  != null) {
    out.volumeNumber = filenameInfo.volumeNumber;
    if (out.volumeLabel == null) out.volumeLabel = `v${filenameInfo.volumeNumber}`;
  }
  if (out.chapterNumber == null && filenameInfo.chapterNumber != null) {
    out.chapterNumber = filenameInfo.chapterNumber;
  }

  // 7. Standalone state (R-7): no series at all means standalone.
  if (out.seriesName == null) out.isStandalone = true;

  return out;
}
