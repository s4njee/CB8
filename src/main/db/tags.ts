import type Database from 'better-sqlite3';
import type { TagIdRow, TagNameRow } from './types';

export function addTag(db: Database.Database, comicId: number, tag: string): void {
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tag);
  const tagRow = db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as TagIdRow;
  db.prepare('INSERT OR IGNORE INTO comic_tags (comic_id, tag_id) VALUES (?, ?)').run(comicId, tagRow.id);
}

export function removeTag(db: Database.Database, comicId: number, tag: string): void {
  const tagRow = db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as TagIdRow | undefined;
  if (!tagRow) return;
  db.prepare('DELETE FROM comic_tags WHERE comic_id = ? AND tag_id = ?').run(comicId, tagRow.id);
}

export function getAllTags(db: Database.Database): string[] {
  const rows = db.prepare('SELECT name FROM tags ORDER BY name COLLATE NOCASE').all() as TagNameRow[];
  return rows.map((r) => r.name);
}

export function renameTag(db: Database.Database, oldName: string, newName: string): void {
  db.prepare('UPDATE tags SET name = ? WHERE name = ?').run(newName, oldName);
}

export function deleteTag(db: Database.Database, tag: string): void {
  const tagRow = db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as TagIdRow | undefined;
  if (!tagRow) return;
  db.prepare('DELETE FROM comic_tags WHERE tag_id = ?').run(tagRow.id);
  db.prepare('DELETE FROM tags WHERE id = ?').run(tagRow.id);
}

export function addTagBulk(db: Database.Database, comicIds: number[], tag: string): void {
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tag);
  const tagRow = db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as TagIdRow;
  const stmt = db.prepare('INSERT OR IGNORE INTO comic_tags (comic_id, tag_id) VALUES (?, ?)');
  const tx = db.transaction((ids: number[]) => {
    for (const id of ids) stmt.run(id, tagRow.id);
  });
  tx(comicIds);
}

export function removeTagBulk(db: Database.Database, comicIds: number[], tag: string): void {
  const tagRow = db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as TagIdRow | undefined;
  if (!tagRow) return;
  const stmt = db.prepare('DELETE FROM comic_tags WHERE comic_id = ? AND tag_id = ?');
  const tx = db.transaction((ids: number[]) => {
    for (const id of ids) stmt.run(id, tagRow.id);
  });
  tx(comicIds);
}
