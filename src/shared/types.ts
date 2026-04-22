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

export interface ComicRecord {
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
}

export interface QueryResult {
  records: ComicRecord[];
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
