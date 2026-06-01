/**
 * maintenance.ts — destructive library-wide operations.
 *
 * `clearLibrary` wipes all media catalog data (comics, tags, libraries,
 * folders, per-user reading state, dismissed paths) in a single transaction.
 * Users, sessions, accounts, and `app_meta` (which holds the persisted
 * auth_secret, initial_password, theme preferences, and schema version)
 * are intentionally preserved so the operator stays signed in and the
 * app reboots into a known state.
 *
 * Files on disk are NOT touched; CB8 only removes catalog rows.
 */
import type Database from 'better-sqlite3';
import type { CountRow } from './types';

export interface ClearLibraryResult {
  comics: number;
  tags: number;
  libraries: number;
  folders: number;
  dismissedPaths: number;
}

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as CountRow).cnt;
}

export function clearLibrary(db: Database.Database): ClearLibraryResult {
  const before = {
    comics: countRows(db, 'comics'),
    tags: countRows(db, 'tags'),
    libraries: countRows(db, 'libraries'),
    folders: countRows(db, 'folders'),
    dismissedPaths: countRows(db, 'dismissed_paths'),
  };

  const tx = db.transaction(() => {
    // Parents first; ON DELETE CASCADE on the junction tables handles the
    // intermediate rows. Order matters mainly for clarity — under SQLite's
    // deferred FK enforcement inside a transaction any order would settle,
    // but going parent → leaf keeps the intent obvious.
    db.prepare('DELETE FROM libraries').run();
    db.prepare('DELETE FROM folders').run();
    db.prepare('DELETE FROM tags').run();
    // `comics` cascades to user_progress, bookmarks, reading_history,
    // user_favorites, and the remaining junction-table rows. The FTS5
    // index has an AFTER DELETE trigger so it stays in sync automatically.
    db.prepare('DELETE FROM comics').run();
    db.prepare('DELETE FROM dismissed_paths').run();
  });
  tx();

  // Reclaim space and reset autoincrement counters so the next ingest
  // starts fresh from id=1. Outside the transaction because VACUUM
  // forbids running inside one.
  try { db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('comics','tags','libraries','folders')`).run(); }
  catch { /* sqlite_sequence only exists if AUTOINCREMENT was used; ignore */ }

  return before;
}
