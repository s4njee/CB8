import type Database from 'better-sqlite3';
import type { CountRow } from './types';

export function logHistory(db: Database.Database, userId: number, comicId: number, action: string, page: number | null): void {
  db.prepare('INSERT INTO reading_history (user_id, comic_id, action, page) VALUES (?, ?, ?, ?)').run(userId, comicId, action, page);
}

export function getHistory(
  db: Database.Database,
  userId: number,
  offset: number,
  limit: number,
): { entries: { id: number; comicId: number; comicTitle: string; action: string; page: number | null; timestamp: string }[]; totalCount: number } {
  const totalCount = (db.prepare('SELECT COUNT(*) as cnt FROM reading_history WHERE user_id = ?').get(userId) as CountRow).cnt;
  const rows = db.prepare(
    `SELECT h.id, h.comic_id, c.title as comic_title, h.action, h.page, h.timestamp
     FROM reading_history h
     LEFT JOIN comics c ON h.comic_id = c.id
     WHERE h.user_id = ?
     ORDER BY h.timestamp DESC
     LIMIT ? OFFSET ?`
  ).all(userId, limit, offset) as { id: number; comic_id: number; comic_title: string | null; action: string; page: number | null; timestamp: string }[];
  return {
    entries: rows.map((r) => ({
      id: r.id, comicId: r.comic_id, comicTitle: r.comic_title ?? '(deleted)',
      action: r.action, page: r.page, timestamp: r.timestamp,
    })),
    totalCount,
  };
}
