import type Database from 'better-sqlite3';
import type { SqlParam, ComicRow } from './types';
import { rowToRecord } from './comics';
import type { MediaRecord } from '../../shared/types';

export function upsertUserProgress(
  db: Database.Database,
  userId: number,
  comicId: number,
  opts: { page?: number | null; location?: string | null; completed?: boolean },
): void {
  const existing = db.prepare('SELECT user_id FROM user_progress WHERE user_id = ? AND comic_id = ?').get(userId, comicId);
  if (existing) {
    const parts: string[] = [];
    const vals: SqlParam[] = [];
    if (opts.page !== undefined) { parts.push('last_page = ?'); vals.push(opts.page); }
    if (opts.location !== undefined) { parts.push('last_location = ?'); vals.push(opts.location); }
    if (opts.completed !== undefined) { parts.push('completed = ?'); vals.push(opts.completed ? 1 : 0); }
    parts.push("last_read = datetime('now')");
    vals.push(userId, comicId);
    db.prepare(`UPDATE user_progress SET ${parts.join(', ')} WHERE user_id = ? AND comic_id = ?`).run(...vals);
  } else {
    db.prepare(
      `INSERT INTO user_progress (user_id, comic_id, last_page, last_location, last_read, completed)
       VALUES (?, ?, ?, ?, datetime('now'), ?)`
    ).run(userId, comicId, opts.page ?? null, opts.location ?? null, opts.completed ? 1 : 0);
  }
}

export function clearUserProgress(db: Database.Database, userId: number, comicId: number): void {
  db.prepare('DELETE FROM user_progress WHERE user_id = ? AND comic_id = ?').run(userId, comicId);
}

export function getUserProgress(
  db: Database.Database,
  userId: number,
  comicId: number,
): { lastPage: number | null; lastLocation: string | null; lastRead: string | null; completed: boolean } | null {
  const row = db.prepare('SELECT last_page, last_location, last_read, completed FROM user_progress WHERE user_id = ? AND comic_id = ?').get(userId, comicId) as { last_page: number | null; last_location: string | null; last_read: string | null; completed: number } | undefined;
  if (!row) return null;
  return { lastPage: row.last_page, lastLocation: row.last_location, lastRead: row.last_read, completed: !!row.completed };
}

export function getRecentlyReadByUser(
  db: Database.Database,
  userId: number,
  limit: number,
  mediaType?: 'comic' | 'book',
): MediaRecord[] {
  const where = mediaType ? 'AND c.media_type = ?' : '';
  const params: SqlParam[] = [userId];
  if (mediaType) params.push(mediaType);
  params.push(limit);
  const rows = db.prepare(
    `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail, c.date_added,
            up.last_page, up.last_location, up.last_read, c.media_type,
            c.chapter_number, c.series_id, c.volume_id
     FROM user_progress up
     JOIN comics c ON up.comic_id = c.id
     WHERE up.user_id = ? AND c.deleted_at IS NULL ${where}
     ORDER BY up.last_read DESC
     LIMIT ?`
  ).all(...params) as ComicRow[];
  return rows.map((r) => rowToRecord(db, r));
}

export function getContinueReadingByUser(
  db: Database.Database,
  userId: number,
  limit: number,
  mediaType?: 'comic' | 'book',
): MediaRecord[] {
  const where = mediaType ? 'AND c.media_type = ?' : '';
  const params: SqlParam[] = [userId];
  if (mediaType) params.push(mediaType);
  params.push(limit);
  const rows = db.prepare(
    `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail, c.date_added,
            up.last_page, up.last_location, up.last_read, c.media_type,
            c.chapter_number, c.series_id, c.volume_id
     FROM user_progress up
     JOIN comics c ON up.comic_id = c.id
     WHERE up.user_id = ? AND up.completed = 0 AND c.deleted_at IS NULL ${where}
     ORDER BY up.last_read DESC
     LIMIT ?`
  ).all(...params) as ComicRow[];
  return rows.map((r) => rowToRecord(db, r));
}
