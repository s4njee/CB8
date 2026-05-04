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

export interface MediaRecord {
  id: number;
  filePath: string;
  title: string;
  pageCount: number;
  fileSize: number;
  coverThumbnail: Buffer | null;
  hasThumbnail?: boolean;
  thumbnailVersion?: number;
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
  records: MediaRecord[];
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
