import type Database from 'better-sqlite3';

export function getAppMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setAppMeta(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(key, value);
}
