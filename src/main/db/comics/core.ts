/**
 * comics/core.ts — basic comic CRUD and the row→record mappers shared
 * across the rest of `db/comics/*`.
 *
 * Kept deliberately small so other sub-modules can `import { rowToRecord,
 * rowToListRecord } from './core'` without dragging in any of the
 * heavier query/recent/softDelete logic.
 */
import type Database from 'better-sqlite3';
import type { ComicDetail, ComicListItem } from '../../../shared/types';
import type { ComicRow, ComicListRow, TagNameRow } from '../types';
import { addTag } from '../tags';

export function rowToRecord(db: Database.Database, row: ComicRow): ComicDetail {
  const tags = db.prepare(
    `SELECT t.name FROM tags t JOIN comic_tags ct ON t.id = ct.tag_id WHERE ct.comic_id = ?`
  ).all(row.id) as TagNameRow[];

  return {
    id: row.id,
    filePath: row.file_path,
    title: row.title,
    pageCount: row.page_count,
    fileSize: row.file_size,
    coverThumbnail: row.cover_thumbnail,
    dateAdded: row.date_added,
    tags: tags.map((t) => t.name),
    lastPage: row.last_page ?? null,
    lastLocation: row.last_location ?? null,
    lastRead: row.last_read ?? null,
    mediaType: (row.media_type === 'book' ? 'book' : 'comic') as 'comic' | 'book',
    chapterNumber: row.chapter_number ?? null,
    seriesId: row.series_id ?? null,
    volumeId: row.volume_id ?? null,
  };
}

export function rowToListRecord(row: ComicListRow): ComicListItem {
  return {
    id: row.id,
    filePath: row.file_path,
    title: row.title,
    pageCount: row.page_count,
    fileSize: row.file_size,
    hasThumbnail: row.has_thumbnail === 1,
    thumbnailVersion: row.thumbnail_version,
    dateAdded: row.date_added,
    tags: [],
    lastPage: row.last_page ?? null,
    lastLocation: row.last_location ?? null,
    chapterNumber: row.chapter_number ?? null,
    seriesId: row.series_id ?? null,
    volumeId: row.volume_id ?? null,
    lastRead: row.last_read ?? null,
    mediaType: (row.media_type === 'book' ? 'book' : 'comic') as 'comic' | 'book',
  };
}

/**
 * Fast-path insert for the bulk ingest pipeline. Skips the post-insert
 * SELECT round-trip and tag handling. Caller (flushBatch) runs this
 * inside a single SQLite transaction across many rows.
 */
export function addComicFast(
  db: Database.Database,
  record: {
    filePath: string;
    title: string;
    pageCount: number;
    fileSize: number;
    coverThumbnail: Buffer;
    mediaType: 'comic' | 'book';
  },
): number {
  db.prepare('DELETE FROM dismissed_paths WHERE file_path = ?').run(record.filePath);
  const stmt = db.prepare(
    `INSERT INTO comics (file_path, title, page_count, file_size, cover_thumbnail, last_page, last_location, last_read, media_type)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`
  );
  const info = stmt.run(
    record.filePath,
    record.title,
    record.pageCount,
    record.fileSize,
    record.coverThumbnail,
    record.mediaType,
  );
  return info.lastInsertRowid as number;
}

export function addComic(db: Database.Database, record: Omit<ComicDetail, 'id' | 'dateAdded'>): ComicDetail {
  db.prepare('DELETE FROM dismissed_paths WHERE file_path = ?').run(record.filePath);
  const stmt = db.prepare(
    `INSERT INTO comics (file_path, title, page_count, file_size, cover_thumbnail, last_page, last_location, last_read, media_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    record.filePath,
    record.title,
    record.pageCount,
    record.fileSize,
    record.coverThumbnail,
    record.lastPage,
    record.lastLocation,
    record.lastRead,
    record.mediaType ?? 'comic',
  );
  const id = info.lastInsertRowid as number;

  if (record.tags?.length) {
    for (const tag of record.tags) {
      addTag(db, id, tag);
    }
  }

  return getComic(db, id)!;
}

export function removeComics(db: Database.Database, ids: number[]): void {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT file_path FROM comics WHERE id IN (${placeholders})`).all(...ids) as { file_path: string }[];
  const dismiss = db.prepare('INSERT OR IGNORE INTO dismissed_paths (file_path) VALUES (?)');
  const del = db.prepare(`DELETE FROM comics WHERE id IN (${placeholders})`);
  const tx = db.transaction(() => {
    for (const row of rows) dismiss.run(row.file_path);
    del.run(...ids);
  });
  tx();
}

export function isDismissed(db: Database.Database, filePath: string): boolean {
  return db.prepare('SELECT 1 FROM dismissed_paths WHERE file_path = ?').get(filePath) !== undefined;
}

export function getComic(db: Database.Database, id: number): ComicDetail | null {
  const row = db.prepare(
    `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type, chapter_number, series_id, volume_id
     FROM comics WHERE id = ?`
  ).get(id) as ComicRow | undefined;
  if (!row) return null;
  return rowToRecord(db, row);
}

export function comicExistsByPath(db: Database.Database, filePath: string): boolean {
  const row = db.prepare('SELECT 1 FROM comics WHERE file_path = ?').get(filePath);
  return row !== undefined;
}

export function updatePageCountByPath(db: Database.Database, filePath: string, pageCount: number): void {
  db.prepare('UPDATE comics SET page_count = ? WHERE file_path = ?').run(pageCount, filePath);
}

export function getComicByPath(db: Database.Database, filePath: string): ComicDetail | null {
  const row = db.prepare(
    `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type, chapter_number, series_id, volume_id
     FROM comics WHERE file_path = ?`
  ).get(filePath) as ComicRow | undefined;
  if (!row) return null;
  return rowToRecord(db, row);
}

export function updateReadingProgress(db: Database.Database, comicId: number, pageIndex: number): void {
  // Auto-flip completed when we hit the final page (pages are 0-indexed, so
  // last page = page_count - 1). Never downgrades completed → 0.
  db.prepare(
    `UPDATE comics
     SET last_page = ?,
         last_read = datetime('now'),
         completed = CASE
           WHEN page_count > 0 AND ? >= page_count - 1 THEN 1
           ELSE completed
         END
     WHERE id = ?`
  ).run(pageIndex, pageIndex, comicId);
}

export function updateReadingLocation(db: Database.Database, comicId: number, location: string): void {
  db.prepare(
    `UPDATE comics SET last_location = ?, last_read = datetime('now') WHERE id = ?`
  ).run(location, comicId);
}
