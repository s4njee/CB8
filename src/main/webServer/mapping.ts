import * as path from 'node:path';
import type { LibraryDatabase } from '../libraryDatabase';

/** Safe comic record that does not expose the server file-system path. */
export interface WebComicRecord {
  id: number;
  title: string;
  pageCount: number;
  fileSize: number;
  dateAdded: string;
  tags: string[];
  lastPage: number | null;
  lastLocation: string | null;
  lastRead: string | null;
  mediaType: 'comic' | 'book';
  thumbnailUrl: string;
  /** File extension without the dot: 'epub' | 'pdf' | 'mobi' | 'cbz' | 'cbr' */
  fileExt: string;
}

export function toWebRecord(record: ReturnType<LibraryDatabase['getComic']>): WebComicRecord | null {
  if (!record) return null;
  return {
    id: record.id,
    title: record.title,
    pageCount: record.pageCount,
    fileSize: record.fileSize,
    dateAdded: record.dateAdded,
    tags: record.tags,
    lastPage: record.lastPage,
    lastLocation: record.lastLocation ?? null,
    lastRead: record.lastRead,
    mediaType: record.mediaType,
    thumbnailUrl: `/api/comics/${record.id}/thumbnail`,
    fileExt: path.extname(record.filePath).toLowerCase().replace(/^\./, ''),
  };
}

/**
 * Overlay per-user progress and favorited onto a base web record. For guests
 * (userId == null), blank out progress fields — the shared row's values
 * reflect the admin's reading and leak their position across users.
 */
export function overlayUserState(
  base: WebComicRecord,
  db: LibraryDatabase,
  userId: number | null,
): WebComicRecord & { favorited: boolean } {
  if (userId == null) {
    return { ...base, lastPage: null, lastLocation: null, lastRead: null, favorited: false };
  }
  const up = db.getUserProgress(userId, base.id);
  return {
    ...base,
    lastPage: up?.lastPage ?? null,
    lastLocation: up?.lastLocation ?? null,
    lastRead: up?.lastRead ?? null,
    favorited: db.isFavorite(userId, base.id),
  };
}
