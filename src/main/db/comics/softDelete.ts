/**
 * comics/softDelete.ts — R-8 soft-delete primitives for comics, plus the
 * cascade rules that keep the parent series / volume rows in sync when
 * their last live chapter is hidden (or restored).
 *
 * The actual hard-delete sweep lives in
 * `src/main/maintenance/softDeleteSweeper.ts` and runs on a 24h timer.
 */
import type Database from 'better-sqlite3';

/**
 * R-8 soft-delete by file path. Sets `comics.deleted_at` instead of
 * deleting the row. Returns the comic id for the caller to feed into
 * cascade logic (series/volume soft-delete when their last live chapter
 * is hidden).
 *
 * No-op when the path isn't tracked or the comic is already soft-deleted
 * (preserves the original `deleted_at` timestamp so the sweeper's grace
 * window starts from the first disappearance, not the most recent scan).
 */
export function softDeleteByPath(db: Database.Database, filePath: string, when?: string): number | null {
  const ts = when ?? new Date().toISOString();
  const row = db.prepare('SELECT id, deleted_at FROM comics WHERE file_path = ?').get(filePath) as
    { id: number; deleted_at: string | null } | undefined;
  if (!row) return null;
  if (row.deleted_at) return row.id;
  db.prepare('UPDATE comics SET deleted_at = ? WHERE id = ?').run(ts, row.id);
  return row.id;
}

/**
 * R-8 cascade rules. Walks each series whose chapters were just touched:
 *   - if every chapter is soft-deleted, soft-delete the series and its volumes.
 *   - if any chapter is live again, restore the series and its now-live volume.
 *
 * Volume cascade is symmetric: a volume is soft-deleted when all of its
 * chapters are soft-deleted, restored otherwise. Triggered after any batch
 * of soft-delete/restore on chapters.
 */
export function cascadeSeriesVolumeDeletion(db: Database.Database, seriesIds: number[], when?: string): void {
  if (seriesIds.length === 0) return;
  const ts = when ?? new Date().toISOString();
  const placeholders = seriesIds.map(() => '?').join(',');
  db.prepare(
    `UPDATE volume SET deleted_at = COALESCE(deleted_at, ?), updated_at = datetime('now')
     WHERE deleted_at IS NULL
       AND series_id IN (${placeholders})
       AND NOT EXISTS (
         SELECT 1 FROM comics c WHERE c.volume_id = volume.id AND c.deleted_at IS NULL
       )`
  ).run(ts, ...seriesIds);
  db.prepare(
    `UPDATE volume SET deleted_at = NULL, updated_at = datetime('now')
     WHERE deleted_at IS NOT NULL
       AND series_id IN (${placeholders})
       AND EXISTS (
         SELECT 1 FROM comics c WHERE c.volume_id = volume.id AND c.deleted_at IS NULL
       )`
  ).run(...seriesIds);
  db.prepare(
    `UPDATE series SET deleted_at = COALESCE(deleted_at, ?), updated_at = datetime('now')
     WHERE deleted_at IS NULL
       AND id IN (${placeholders})
       AND NOT EXISTS (
         SELECT 1 FROM comics c WHERE c.series_id = series.id AND c.deleted_at IS NULL
       )`
  ).run(ts, ...seriesIds);
  db.prepare(
    `UPDATE series SET deleted_at = NULL, updated_at = datetime('now')
     WHERE deleted_at IS NOT NULL
       AND id IN (${placeholders})
       AND EXISTS (
         SELECT 1 FROM comics c WHERE c.series_id = series.id AND c.deleted_at IS NULL
       )`
  ).run(...seriesIds);
}

/** Restore a soft-deleted comic by file_path (file reappeared on disk). */
export function restoreByPath(db: Database.Database, filePath: string): number | null {
  const row = db.prepare('SELECT id FROM comics WHERE file_path = ? AND deleted_at IS NOT NULL').get(filePath) as
    { id: number } | undefined;
  if (!row) return null;
  db.prepare('UPDATE comics SET deleted_at = NULL WHERE id = ?').run(row.id);
  return row.id;
}
