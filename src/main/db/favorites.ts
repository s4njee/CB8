import type Database from 'better-sqlite3';

export function addFavorite(db: Database.Database, userId: number, comicId: number): void {
  db.prepare('INSERT OR IGNORE INTO user_favorites (user_id, comic_id) VALUES (?, ?)').run(userId, comicId);
}

export function removeFavorite(db: Database.Database, userId: number, comicId: number): void {
  db.prepare('DELETE FROM user_favorites WHERE user_id = ? AND comic_id = ?').run(userId, comicId);
}

export function isFavorite(db: Database.Database, userId: number, comicId: number): boolean {
  return db.prepare('SELECT 1 FROM user_favorites WHERE user_id = ? AND comic_id = ?').get(userId, comicId) !== undefined;
}
