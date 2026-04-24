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
  dateAdded: string;
  tags: string[];
  lastPage: number | null;
  lastLocation: string | null;
  lastRead: string | null;
  mediaType: 'comic' | 'book';
}

/** @deprecated Use MediaRecord instead. Kept for backward compatibility. */
export type ComicRecord = MediaRecord;

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
