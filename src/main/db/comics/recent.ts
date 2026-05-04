/**
 * comics/recent.ts — recently-read and continue-reading shelves at the
 * library level (anonymous; per-user variants live in `db/progress.ts`).
 *
 * Both filter `c.deleted_at IS NULL` per R-8 — the shelf should never
 * show a comic the scanner has marked as missing.
 */
import type Database from 'better-sqlite3';
import type { ComicDetail } from '../../../shared/types';
import type { ComicRow } from '../types';
import { rowToRecord } from './core';

export function getRecentlyRead(
  db: Database.Database,
  limit: number = 10,
  mediaType?: 'comic' | 'book',
): ComicDetail[] {
  const rows = mediaType
    ? db.prepare(
        `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type, chapter_number, series_id, volume_id
         FROM comics WHERE last_read IS NOT NULL AND deleted_at IS NULL AND media_type = ?
         ORDER BY last_read DESC LIMIT ?`
      ).all(mediaType, limit) as ComicRow[]
    : db.prepare(
        `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type, chapter_number, series_id, volume_id
         FROM comics WHERE last_read IS NOT NULL AND deleted_at IS NULL
         ORDER BY last_read DESC LIMIT ?`
      ).all(limit) as ComicRow[];
  return rows.map((r) => rowToRecord(db, r));
}

export function getContinueReading(
  db: Database.Database,
  limit: number = 10,
  mediaType?: 'comic' | 'book',
): ComicDetail[] {
  const rows = mediaType
    ? db.prepare(
        `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type, chapter_number, series_id, volume_id
         FROM comics WHERE last_read IS NOT NULL AND deleted_at IS NULL AND completed = 0 AND media_type = ?
         ORDER BY last_read DESC LIMIT ?`
      ).all(mediaType, limit) as ComicRow[]
    : db.prepare(
        `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type, chapter_number, series_id, volume_id
         FROM comics WHERE last_read IS NOT NULL AND deleted_at IS NULL AND completed = 0
         ORDER BY last_read DESC LIMIT ?`
      ).all(limit) as ComicRow[];
  return rows.map((r) => rowToRecord(db, r));
}
