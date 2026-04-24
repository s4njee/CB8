import type Database from 'better-sqlite3';
import type { SqlParam, ComicRow, CountRow } from './types';
import { SORT_COLUMN_MAP } from './types';
import { rowToRecord } from './comics';
import type { QueryOptions, QueryResult } from '../../shared/types';

export function createFolder(
  db: Database.Database,
  name: string,
  comicIds: number[],
): { id: number; name: string } {
  const coverId = comicIds.length > 0 ? comicIds[0] : null;
  const info = db.prepare('INSERT INTO folders (name, cover_comic_id) VALUES (?, ?)').run(name, coverId);
  const folderId = info.lastInsertRowid as number;
  if (comicIds.length > 0) {
    const stmt = db.prepare('INSERT OR IGNORE INTO folder_comics (folder_id, comic_id) VALUES (?, ?)');
    const tx = db.transaction((ids: number[]) => {
      for (const id of ids) stmt.run(folderId, id);
    });
    tx(comicIds);
  }
  return { id: folderId, name };
}

export function renameFolder(db: Database.Database, id: number, newName: string): void {
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(newName, id);
}

export function deleteFolder(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);
}

export function getAllFolders(
  db: Database.Database,
  libraryId?: number | null,
): { id: number; name: string; comicCount: number; coverThumbnail: Buffer | null; mediaType: 'comic' | 'book' | 'mixed' | 'empty' }[] {
  const where = libraryId != null
    ? 'WHERE f.id IN (SELECT folder_id FROM library_folders WHERE library_id = ?)'
    : '';
  const params = libraryId != null ? [libraryId] : [];
  // Count comic vs book items per folder so the caller can decide whether a
  // folder is relevant for the current media-type filter. An empty folder is
  // neither and gets flagged so the sidebar can hide it.
  const rows = db.prepare(
    `SELECT f.id, f.name,
            COUNT(fc.comic_id) as comic_count,
            SUM(CASE WHEN ic.media_type = 'comic' THEN 1 ELSE 0 END) as n_comic,
            SUM(CASE WHEN ic.media_type = 'book'  THEN 1 ELSE 0 END) as n_book,
            cc.cover_thumbnail
     FROM folders f
     LEFT JOIN folder_comics fc ON f.id = fc.folder_id
     LEFT JOIN comics ic ON fc.comic_id = ic.id
     LEFT JOIN comics cc ON f.cover_comic_id = cc.id
     ${where}
     GROUP BY f.id
     ORDER BY f.name COLLATE NOCASE`
  ).all(...params) as {
    id: number; name: string; comic_count: number;
    n_comic: number | null; n_book: number | null;
    cover_thumbnail: Buffer | null;
  }[];
  return rows.map((r) => {
    const nComic = r.n_comic ?? 0;
    const nBook = r.n_book ?? 0;
    const mediaType: 'comic' | 'book' | 'mixed' | 'empty' =
      r.comic_count === 0 ? 'empty'
      : nComic > 0 && nBook > 0 ? 'mixed'
      : nBook > 0 ? 'book'
      : 'comic';
    return { id: r.id, name: r.name, comicCount: r.comic_count, coverThumbnail: r.cover_thumbnail, mediaType };
  });
}

export function addComicsToFolder(db: Database.Database, folderId: number, comicIds: number[]): void {
  const stmt = db.prepare('INSERT OR IGNORE INTO folder_comics (folder_id, comic_id) VALUES (?, ?)');
  const tx = db.transaction((ids: number[]) => {
    for (const id of ids) stmt.run(folderId, id);
  });
  tx(comicIds);
  const folder = db.prepare('SELECT cover_comic_id FROM folders WHERE id = ?').get(folderId) as { cover_comic_id: number | null } | undefined;
  if (folder && folder.cover_comic_id == null && comicIds.length > 0) {
    db.prepare('UPDATE folders SET cover_comic_id = ? WHERE id = ?').run(comicIds[0], folderId);
  }
}

export function removeComicsFromFolder(db: Database.Database, folderId: number, comicIds: number[]): void {
  const stmt = db.prepare('DELETE FROM folder_comics WHERE folder_id = ? AND comic_id = ?');
  const tx = db.transaction((ids: number[]) => {
    for (const id of ids) stmt.run(folderId, id);
  });
  tx(comicIds);
}

export function getFolderComics(
  db: Database.Database,
  folderId: number,
  options: QueryOptions = {},
): QueryResult {
  const conditions: string[] = ['c.id IN (SELECT comic_id FROM folder_comics WHERE folder_id = ?)'];
  const params: SqlParam[] = [folderId];
  if (options.mediaType) {
    conditions.push('c.media_type = ?');
    params.push(options.mediaType);
  }
  if (options.search) {
    conditions.push('(c.title LIKE ? COLLATE NOCASE OR c.file_path LIKE ? COLLATE NOCASE)');
    const term = `%${options.search}%`;
    params.push(term, term);
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
  const totalCount = (db.prepare(`SELECT COUNT(*) as cnt FROM comics c ${where}`).get(...params) as CountRow).cnt;
  const rows = db.prepare(
    `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail, c.date_added, c.last_page, c.last_location, c.last_read, c.media_type FROM comics c ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as ComicRow[];
  return { records: rows.map((r) => rowToRecord(db, r)), totalCount };
}

export function getComicFolderIds(db: Database.Database, comicId: number): number[] {
  const rows = db.prepare('SELECT folder_id FROM folder_comics WHERE comic_id = ?').all(comicId) as { folder_id: number }[];
  return rows.map((r) => r.folder_id);
}
