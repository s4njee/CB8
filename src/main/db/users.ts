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

export function setUserPasswordHash(db: Database.Database, id: number, passwordHash: string): void {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

/**
 * Ensure a credential-provider `account` row exists for the given user. This
 * is the table better-auth reads when verifying a password; keeping it in
 * sync with `users.password_hash` lets legacy and better-auth paths agree.
 */
export function upsertCredentialAccount(
  db: Database.Database,
  userId: number,
  accountId: string,
  passwordHash: string,
): void {
  const existing = db.prepare(
    `SELECT id FROM account WHERE user_id = ? AND provider_id = 'credential'`
  ).get(userId) as { id: number } | undefined;
  if (existing) {
    db.prepare(
      `UPDATE account SET password = ?, account_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(passwordHash, accountId, existing.id);
  } else {
    db.prepare(
      `INSERT INTO account (user_id, account_id, provider_id, password, created_at, updated_at)
       VALUES (?, ?, 'credential', ?, datetime('now'), datetime('now'))`
    ).run(userId, accountId, passwordHash);
  }
}
