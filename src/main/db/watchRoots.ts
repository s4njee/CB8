import type Database from 'better-sqlite3';

export interface WatchRoot {
  id: number;
  rootPath: string;
  libraryId: number;
  folderId: number | null;
}

interface WatchRootRow {
  id: number;
  root_path: string;
  library_id: number;
  folder_id: number | null;
}

export function upsertWatchRoot(
  db: Database.Database,
  rootPath: string,
  libraryId: number,
  folderId?: number | null,
): WatchRoot {
  const normalizedFolderId = folderId ?? null;
  const existing = db.prepare(
    `SELECT id, root_path, library_id, folder_id
     FROM library_watch_roots
     WHERE root_path = ?
       AND library_id = ?
       AND COALESCE(folder_id, -1) = COALESCE(?, -1)`
  ).get(rootPath, libraryId, normalizedFolderId) as WatchRootRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE library_watch_roots
       SET enabled = 1, updated_at = datetime('now')
       WHERE id = ?`
    ).run(existing.id);
    return rowToWatchRoot(existing);
  }

  const info = db.prepare(
    `INSERT INTO library_watch_roots (root_path, library_id, folder_id, enabled)
     VALUES (?, ?, ?, 1)`
  ).run(rootPath, libraryId, normalizedFolderId);

  const row = db.prepare(
    `SELECT id, root_path, library_id, folder_id
     FROM library_watch_roots
     WHERE id = ?`
  ).get(Number(info.lastInsertRowid)) as WatchRootRow;

  return rowToWatchRoot(row);
}

export function listEnabledWatchRoots(db: Database.Database): WatchRoot[] {
  const rows = db.prepare(
    `SELECT id, root_path, library_id, folder_id
     FROM library_watch_roots
     WHERE enabled = 1
     ORDER BY root_path COLLATE NOCASE`
  ).all() as WatchRootRow[];
  return rows.map(rowToWatchRoot);
}

export function disableWatchRoot(db: Database.Database, id: number): void {
  db.prepare(
    `UPDATE library_watch_roots SET enabled = 0, updated_at = datetime('now') WHERE id = ?`
  ).run(id);
}

function rowToWatchRoot(row: WatchRootRow): WatchRoot {
  return {
    id: row.id,
    rootPath: row.root_path,
    libraryId: row.library_id,
    folderId: row.folder_id ?? null,
  };
}
