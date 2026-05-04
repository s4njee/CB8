import type Database from 'better-sqlite3';
import type { SqlParam, ComicListRow, CountRow, LibraryRow } from './types';
import { SORT_COLUMN_MAP } from './types';
import { rowToListRecord } from './comics';
import type { QueryOptions, QueryResult } from '../../shared/types';

export function createLibrary(
  db: Database.Database,
  name: string,
  mediaType: 'comic' | 'book' = 'comic',
): { id: number; name: string; mediaType: 'comic' | 'book' } {
  const info = db.prepare('INSERT INTO libraries (name, media_type) VALUES (?, ?)').run(name, mediaType);
  return { id: info.lastInsertRowid as number, name, mediaType };
}

/**
 * "Inbox" is the catch-all library for comics ingested without an explicit
 * library context — e.g. files dragged into the app from Finder. R-6
 * forbids silent insert into a default; this helper ensures the user's
 * data still lands somewhere named, with the option to reassign later
 * via the existing addComicsToLibrary flow.
 *
 * Idempotent: returns the existing Inbox library id on every call after
 * the first.
 */
export const INBOX_LIBRARY_NAME = 'Inbox';

export function getOrCreateInbox(db: Database.Database): number {
  const existing = db.prepare(
    'SELECT id FROM libraries WHERE name = ? COLLATE NOCASE'
  ).get(INBOX_LIBRARY_NAME) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = db.prepare(
    "INSERT INTO libraries (name, media_type) VALUES (?, 'comic')"
  ).run(INBOX_LIBRARY_NAME);
  return Number(info.lastInsertRowid);
}

/**
 * Find a library that contains the given folder. Folders can technically
 * appear under multiple libraries via `library_folders`; for ingest we
 * just need any one to scope the new series/volume rows. Returns null
 * when the folder isn't attached to any library.
 */
export function getLibraryForFolder(db: Database.Database, folderId: number): number | null {
  const r = db.prepare(
    `SELECT library_id FROM library_folders WHERE folder_id = ? ORDER BY library_id LIMIT 1`
  ).get(folderId) as { library_id: number } | undefined;
  return r ? r.library_id : null;
}

export function renameLibrary(db: Database.Database, id: number, newName: string): void {
  db.prepare('UPDATE libraries SET name = ? WHERE id = ?').run(newName, id);
}

export function deleteLibrary(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM libraries WHERE id = ?').run(id);
}

export function getAllLibraries(
  db: Database.Database,
  mediaType?: 'comic' | 'book',
): { id: number; name: string; comicCount: number; mediaType: 'comic' | 'book' }[] {
  const where = mediaType ? 'WHERE l.media_type = ?' : '';
  const params = mediaType ? [mediaType] : [];
  const rows = db.prepare(
    `SELECT l.id, l.name, l.media_type, COUNT(lc.comic_id) as comic_count
     FROM libraries l
     LEFT JOIN library_comics lc ON l.id = lc.library_id
     ${where}
     GROUP BY l.id
     ORDER BY l.name COLLATE NOCASE`
  ).all(...params) as LibraryRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    comicCount: r.comic_count,
    mediaType: (r.media_type === 'book' ? 'book' : 'comic') as 'comic' | 'book',
  }));
}

export function addComicsToLibrary(db: Database.Database, libraryId: number, comicIds: number[]): void {
  const stmt = db.prepare('INSERT OR IGNORE INTO library_comics (library_id, comic_id) VALUES (?, ?)');
  const removeExisting = db.prepare('DELETE FROM library_comics WHERE comic_id = ?');
  const tx = db.transaction((ids: number[]) => {
    for (const id of ids) {
      removeExisting.run(id);
      stmt.run(libraryId, id);
    }
  });
  tx(comicIds);
}

export function removeComicsFromLibrary(db: Database.Database, libraryId: number, comicIds: number[]): void {
  const stmt = db.prepare('DELETE FROM library_comics WHERE library_id = ? AND comic_id = ?');
  const tx = db.transaction((ids: number[]) => {
    for (const id of ids) stmt.run(libraryId, id);
  });
  tx(comicIds);
}

export function addFoldersToLibrary(db: Database.Database, libraryId: number, folderIds: number[]): void {
  const folderComicRows = db.prepare('SELECT comic_id FROM folder_comics WHERE folder_id = ?');
  const insertComic = db.prepare('INSERT OR IGNORE INTO library_comics (library_id, comic_id) VALUES (?, ?)');
  const removeExisting = db.prepare('DELETE FROM library_comics WHERE comic_id = ?');
  const tx = db.transaction((ids: number[]) => {
    for (const folderId of ids) {
      const rows = folderComicRows.all(folderId) as { comic_id: number }[];
      for (const row of rows) {
        removeExisting.run(row.comic_id);
        insertComic.run(libraryId, row.comic_id);
      }
    }
  });
  tx(folderIds);
}

export function queryComicsByLibrary(
  db: Database.Database,
  libraryId: number,
  options: QueryOptions = {},
): QueryResult {
  const conditions: string[] = ['c.id IN (SELECT comic_id FROM library_comics WHERE library_id = ?)'];
  const params: SqlParam[] = [libraryId];

  // R-8: hide soft-deleted comics from the default library browse path.
  conditions.push('c.deleted_at IS NULL');

  if (options.mediaType) {
    conditions.push('c.media_type = ?');
    params.push(options.mediaType);
  }

  if (options.search) {
    conditions.push('(c.title LIKE ? COLLATE NOCASE OR c.file_path LIKE ? COLLATE NOCASE)');
    const term = `%${options.search}%`;
    params.push(term, term);
  }

  if (options.excludeFoldered) {
    conditions.push('c.id NOT IN (SELECT comic_id FROM folder_comics)');
  }

  if (options.fileExt) {
    conditions.push('LOWER(c.file_path) LIKE ?');
    params.push('%.' + options.fileExt.toLowerCase());
  }

  if (options.readStatus === 'unread') {
    conditions.push('c.last_page IS NULL AND c.last_read IS NULL');
  } else if (options.readStatus === 'in-progress') {
    conditions.push('(c.last_page IS NOT NULL OR c.last_read IS NOT NULL) AND (c.last_page IS NULL OR c.last_page < c.page_count - 1)');
  } else if (options.readStatus === 'completed') {
    conditions.push('c.last_page = c.page_count - 1');
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const sortCol = SORT_COLUMN_MAP[options.sortBy ?? 'title'] ?? SORT_COLUMN_MAP.title;
  const sortDir = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const totalCount = (db.prepare(
    `SELECT COUNT(*) as cnt FROM comics c ${where}`
  ).get(...params) as CountRow).cnt;

  const rows = db.prepare(
    `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size,
            CASE WHEN c.cover_thumbnail IS NULL THEN 0 ELSE 1 END as has_thumbnail,
            COALESCE(length(c.cover_thumbnail), 0) as thumbnail_version,
            c.date_added, c.last_page, c.last_location, c.last_read, c.media_type,
            c.chapter_number, c.series_id, c.volume_id
     FROM comics c ${where}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as ComicListRow[];

  return {
    records: rows.map(rowToListRecord),
    totalCount,
  };
}
