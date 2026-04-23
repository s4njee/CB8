/**
 * Pure filter and sort logic for the library filter & sort feature.
 * No side effects, no database or React dependencies.
 */
import type { ComicRecord, QueryOptions, FilterPreset } from '../shared/types';

type ReadStatus = 'unread' | 'in-progress' | 'completed';

/**
 * Classify a comic's read status based on its reading progress.
 * - unread: lastPage is null AND lastRead is null
 * - completed: lastPage === pageCount - 1
 * - in-progress: otherwise (some reading activity but not completed)
 */
export function classifyReadStatus(comic: {
  lastPage: number | null;
  lastRead: string | null;
  pageCount: number;
}): ReadStatus {
  if (comic.lastPage === null && comic.lastRead === null) {
    return 'unread';
  }
  if (comic.lastPage === comic.pageCount - 1) {
    return 'completed';
  }
  return 'in-progress';
}

/**
 * Filter comics by read status. undefined returns all comics.
 */
export function filterByReadStatus(
  comics: ComicRecord[],
  status: ReadStatus | undefined,
): ComicRecord[] {
  if (status === undefined) return comics;
  return comics.filter((c) => classifyReadStatus(c) === status);
}

/**
 * Filter comics by file extension (case-insensitive).
 * undefined returns all comics.
 */
export function filterByFileExt(
  comics: ComicRecord[],
  ext: string | undefined,
): ComicRecord[] {
  if (ext === undefined) return comics;
  const suffix = '.' + ext.toLowerCase();
  return comics.filter((c) => c.filePath.toLowerCase().endsWith(suffix));
}

/**
 * Apply all active filters as a logical AND.
 * A comic must pass every active filter to be included.
 */
export function applyFilters(
  comics: ComicRecord[],
  filters: {
    readStatus?: ReadStatus;
    fileExt?: string;
    tag?: string;
    search?: string;
  },
): ComicRecord[] {
  let result = comics;

  if (filters.readStatus !== undefined) {
    result = filterByReadStatus(result, filters.readStatus);
  }

  if (filters.fileExt !== undefined) {
    result = filterByFileExt(result, filters.fileExt);
  }

  if (filters.tag !== undefined) {
    const tag = filters.tag;
    result = result.filter((c) => c.tags.includes(tag));
  }

  if (filters.search !== undefined && filters.search !== '') {
    const term = filters.search.toLowerCase();
    result = result.filter((c) => c.title.toLowerCase().includes(term));
  }

  return result;
}

/**
 * Return the default sort direction for a given sort field.
 * 'desc' for dateAdded and lastRead; 'asc' for everything else.
 */
export function getDefaultSortOrder(
  sortBy: QueryOptions['sortBy'],
): 'asc' | 'desc' {
  if (sortBy === 'dateAdded' || sortBy === 'lastRead') {
    return 'desc';
  }
  return 'asc';
}

/**
 * Toggle sort direction.
 */
export function toggleSortOrder(current: 'asc' | 'desc'): 'asc' | 'desc' {
  return current === 'asc' ? 'desc' : 'asc';
}

/**
 * Return a new FilterPreset with only the specified field changed.
 */
export function updateFilterPreset(
  preset: FilterPreset,
  field: keyof FilterPreset,
  value: FilterPreset[keyof FilterPreset],
): FilterPreset {
  return { ...preset, [field]: value };
}

const VALID_SORT_BY: ReadonlySet<string> = new Set([
  'title',
  'dateAdded',
  'fileSize',
  'pageCount',
  'lastRead',
]);

const VALID_SORT_ORDER: ReadonlySet<string> = new Set(['asc', 'desc']);

const DEFAULT_PRESET: FilterPreset = { sortBy: 'title', sortOrder: 'asc' };

/**
 * Parse a JSON string into a FilterPreset.
 * Falls back to defaults on any error or invalid values.
 */
export function parseFilterPreset(json: string | null): FilterPreset {
  if (json === null) return { ...DEFAULT_PRESET };
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ...DEFAULT_PRESET };
    }
    if (!VALID_SORT_BY.has(parsed.sortBy) || !VALID_SORT_ORDER.has(parsed.sortOrder)) {
      return { ...DEFAULT_PRESET };
    }
    const result: FilterPreset = {
      sortBy: parsed.sortBy,
      sortOrder: parsed.sortOrder,
    };
    if (parsed.readStatus === 'unread' || parsed.readStatus === 'in-progress' || parsed.readStatus === 'completed') {
      result.readStatus = parsed.readStatus;
    }
    if (typeof parsed.fileExt === 'string') {
      result.fileExt = parsed.fileExt;
    }
    if (typeof parsed.tag === 'string') {
      result.tag = parsed.tag;
    }
    return result;
  } catch {
    return { ...DEFAULT_PRESET };
  }
}
