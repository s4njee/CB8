import type Database from 'better-sqlite3';

export interface ClearLibraryResult {
  comics: number;
  libraries: number;
  folders: number;
  series: number;
  volumes: number;
  tags: number;
  watchRoots: number;
  dismissedPaths: number;
}

function count(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return row.count;
}

/**
 * Remove catalog data while preserving users, sessions, credentials, and app
 * settings. This intentionally does not write to dismissed_paths, so files can
 * be re-imported later.
 */
export function clearLibrary(db: Database.Database): ClearLibraryResult {
  const result: ClearLibraryResult = {
    comics: count(db, 'comics'),
    libraries: count(db, 'libraries'),
    folders: count(db, 'folders'),
    series: count(db, 'series'),
    volumes: count(db, 'volume'),
    tags: count(db, 'tags'),
    watchRoots: count(db, 'library_watch_roots'),
    dismissedPaths: count(db, 'dismissed_paths'),
  };

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM library_watch_roots').run();
    db.prepare('DELETE FROM library_comics').run();
    db.prepare('DELETE FROM library_folders').run();
    db.prepare('DELETE FROM folder_comics').run();
    db.prepare('DELETE FROM comic_tags').run();
    db.prepare('DELETE FROM user_favorites').run();
    db.prepare('DELETE FROM user_progress').run();
    db.prepare('DELETE FROM bookmarks').run();
    db.prepare('DELETE FROM reading_history').run();
    db.prepare('DELETE FROM comics').run();
    db.prepare('DELETE FROM folders').run();
    db.prepare('DELETE FROM volume').run();
    db.prepare('DELETE FROM series').run();
    db.prepare('DELETE FROM libraries').run();
    db.prepare('DELETE FROM tags').run();
    db.prepare('DELETE FROM dismissed_paths').run();
  });
  tx();

  return result;
}
