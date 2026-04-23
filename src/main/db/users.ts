import type Database from 'better-sqlite3';
import type { CountRow } from './types';

export function createUser(
  db: Database.Database,
  username: string,
  passwordHash: string,
  isAdmin: boolean,
): { id: number; username: string; isAdmin: boolean } {
  const info = db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)').run(username, passwordHash, isAdmin ? 1 : 0);
  return { id: info.lastInsertRowid as number, username, isAdmin };
}

export function getUserByUsername(
  db: Database.Database,
  username: string,
): { id: number; username: string; passwordHash: string; isAdmin: boolean; createdAt: string } | null {
  const row = db.prepare('SELECT id, username, password_hash, is_admin, created_at FROM users WHERE username = ? COLLATE NOCASE').get(username) as { id: number; username: string; password_hash: string; is_admin: number; created_at: string } | undefined;
  if (!row) return null;
  return { id: row.id, username: row.username, passwordHash: row.password_hash, isAdmin: !!row.is_admin, createdAt: row.created_at };
}

export function getUserById(
  db: Database.Database,
  id: number,
): { id: number; username: string; isAdmin: boolean; createdAt: string } | null {
  const row = db.prepare('SELECT id, username, is_admin, created_at FROM users WHERE id = ?').get(id) as { id: number; username: string; is_admin: number; created_at: string } | undefined;
  if (!row) return null;
  return { id: row.id, username: row.username, isAdmin: !!row.is_admin, createdAt: row.created_at };
}

export function listUsers(db: Database.Database): { id: number; username: string; isAdmin: boolean; createdAt: string }[] {
  const rows = db.prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY username COLLATE NOCASE').all() as { id: number; username: string; is_admin: number; created_at: string }[];
  return rows.map((r) => ({ id: r.id, username: r.username, isAdmin: !!r.is_admin, createdAt: r.created_at }));
}

export function countAdmins(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) as cnt FROM users WHERE is_admin = 1').get() as CountRow).cnt;
}

export function countUsers(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as CountRow).cnt;
}

export function deleteUser(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function setUserAdmin(db: Database.Database, id: number, isAdmin: boolean): void {
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, id);
}
