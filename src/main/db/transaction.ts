/**
 * transaction.ts — lightweight transaction helper for node:sqlite's
 * DatabaseSync, which (unlike better-sqlite3) does not expose a
 * db.transaction(fn) convenience wrapper.
 */

import type { DatabaseSync } from 'node:sqlite';

/**
 * Run `fn` inside a BEGIN / COMMIT block. Rolls back and re-throws on
 * any error. Callers are responsible for not nesting calls — SQLite
 * doesn't support nested transactions without savepoints.
 */
export function runTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore rollback errors */ }
    throw err;
  }
}
