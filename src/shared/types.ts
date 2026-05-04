/**
 * Shared type definitions for the CB8 application.
 * Used by both main and renderer processes.
 */

export interface ArchiveEntry {
  filename: string;
  index: number;
}

export interface ArchiveHandle {
  filePath: string;
  format: 'cbz' | 'cbr';
  entries: ArchiveEntry[];
  pageCount: number;
}

/**
 * Common fields on every comic-shaped record. The concrete shapes are
 * `ComicDetail` (single-record fetches; carries the cover bytes) and
 * `ComicListItem` (list/grid queries; carries the has-thumbnail flag
 * and a stable version int instead of the bytes themselves).
 *
 * `MediaRecord` is kept as a discriminator-free alias for
 * `ComicDetail | ComicListItem` for code that doesn't care about the
 * cover representation, but new code should prefer the specific types.
 */
export interface ComicBase {
  id: number;
  filePath: string;
  title: string;
  pageCount: number;
  fileSize: number;
  dateAdded: string;
  tags: string[];
  lastPage: number | null;
  lastLocation: string | null;
  lastRead: string | null;
  mediaType: 'comic' | 'book';
  /** v7+: intrinsic chapter/issue number on the comic. Null when unknown. */
  chapterNumber?: number | null;
  /** v7+: FK to the series row this chapter belongs to. */
  seriesId?: number | null;
  /** v7+: FK to the volume row this chapter belongs to. */
  volumeId?: number | null;
}

/** Detail shape: returned by single-row reads (`getComic`, `getComicByPath`,
 * the listForSeries / listForVolume / getRecentlyRead family). Carries the
 * full cover thumbnail bytes inline. */
export interface ComicDetail extends ComicBase {
  coverThumbnail: Buffer | null;
}

/** List shape: returned by paginated queries (`queryComics`, library/folder
 * browse, search results). Sends a stable thumbnail version so the SPA can
 * cache-bust the `/api/comics/:id/thumbnail` URL when the cover changes,
 * but does not embed the bytes — those come back from the thumbnail route. */
export interface ComicListItem extends ComicBase {
  hasThumbnail: boolean;
  thumbnailVersion: number;
}

/** Discriminator-free union for code that doesn't care about the cover
 * representation. Prefer `ComicDetail` or `ComicListItem` in new code. */
export type MediaRecord = ComicDetail | ComicListItem;

export interface QueryOptions {
  search?: string;
  tag?: string;
  sortBy?: 'title' | 'dateAdded' | 'fileSize' | 'pageCount' | 'lastRead';
  sortOrder?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
  excludeFoldered?: boolean;
  mediaType?: 'comic' | 'book';
  fileExt?: string;
  readStatus?: 'unread' | 'in-progress' | 'completed';
  /**
   * R-8: include soft-deleted comics in the result. Defaults to false;
   * admin/debug tooling sets this to surface hidden rows.
   */
  includeDeleted?: boolean;
}

export interface FilterPreset {
  sortBy: QueryOptions['sortBy'];
  sortOrder: QueryOptions['sortOrder'];
  readStatus?: QueryOptions['readStatus'];
  fileExt?: string;
  tag?: string;
}

export interface QueryResult {
  records: ComicListItem[];
  totalCount: number;
}

export interface ScanProgress {
  discovered: number;
  processed: number;
  currentFile: string;
}

export interface NavigationState {
  currentPage: number;
  totalPages: number;
  isFullscreen: boolean;
  archiveFilename: string | null;
}
