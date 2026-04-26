import type Database from 'better-sqlite3';

export function createBookmark(
  db: Database.Database,
  userId: number,
  comicId: number,
  page: number,
  note: string | null = null,
): { id: number; userId: number; comicId: number; page: number; note: string | null; createdAt: string } {
  const info = db.prepare('INSERT INTO bookmarks (user_id, comic_id, page, note) VALUES (?, ?, ?, ?)').run(userId, comicId, page, note);
  const id = info.lastInsertRowid as number;
  const row = db.prepare('SELECT id, user_id, comic_id, page, note, created_at FROM bookmarks WHERE id = ?').get(id) as { id: number; user_id: number; comic_id: number; page: number; note: string | null; created_at: string };
  return { id: row.id, userId: row.user_id, comicId: row.comic_id, page: row.page, note: row.note, createdAt: row.created_at };
}

export function listBookmarks(
  db: Database.Database,
  userId: number,
  comicId: number,
): { id: number; page: number; note: string | null; createdAt: string }[] {
  const rows = db.prepare('SELECT id, page, note, created_at FROM bookmarks WHERE user_id = ? AND comic_id = ? ORDER BY page, id').all(userId, comicId) as { id: number; page: number; note: string | null; created_at: string }[];
  return rows.map((r) => ({ id: r.id, page: r.page, note: r.note, createdAt: r.created_at }));
}

export function updateBookmark(db: Database.Database, userId: number, bookmarkId: number, note: string | null): void {
  db.prepare('UPDATE bookmarks SET note = ? WHERE id = ? AND user_id = ?').run(note, bookmarkId, userId);
}

export function deleteBookmark(db: Database.Database, userId: number, bookmarkId: number): void {
  db.prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?').run(bookmarkId, userId);
}
