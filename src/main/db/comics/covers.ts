/**
 * comics/covers.ts — cover-bytes I/O and R-10 default-cover resolution
 * for series and volume rows.
 *
 * Each comic owns its cover thumbnail (the tiny JPEG used for grid tiles).
 * Series and volume default covers are computed on demand from the
 * underlying comics; they don't materialise extra blobs. The new
 * `series.cover_comic_id` / `volume.cover_comic_id` overrides take
 * precedence and are checked by the route layer before falling back to
 * `defaultSeriesCover` / `defaultVolumeCover`.
 */
import type Database from 'better-sqlite3';

export function updateCoverThumbnailByPath(db: Database.Database, filePath: string, coverThumbnail: Buffer | null): void {
  db.prepare('UPDATE comics SET cover_thumbnail = ? WHERE file_path = ?').run(coverThumbnail, filePath);
}

export function getCoverThumbnail(db: Database.Database, comicId: number): Buffer | null {
  const row = db.prepare('SELECT cover_thumbnail FROM comics WHERE id = ?').get(comicId) as { cover_thumbnail: Buffer | null } | undefined;
  return row?.cover_thumbnail ?? null;
}

/**
 * R-10 default cover resolution. Returns the comic.id whose cover bytes
 * should be served as the series's default cover, picked by:
 *   - lowest volume.number NULLS LAST,
 *   - lowest comic.chapter_number,
 *   - tiebreak by comic.id.
 * Soft-deleted comics are skipped. Caller checks `series.cover_comic_id`
 * first and only falls back here when the override isn't set.
 */
export function defaultSeriesCover(db: Database.Database, seriesId: number): number | null {
  const r = db.prepare(
    `SELECT c.id FROM comics c
     LEFT JOIN volume v ON v.id = c.volume_id
     WHERE c.series_id = ? AND c.deleted_at IS NULL
     ORDER BY (v.number IS NULL), v.number, c.chapter_number, c.id
     LIMIT 1`
  ).get(seriesId) as { id: number } | undefined;
  return r ? r.id : null;
}

/** R-10 default cover for a volume. */
export function defaultVolumeCover(db: Database.Database, volumeId: number): number | null {
  const r = db.prepare(
    `SELECT id FROM comics
     WHERE volume_id = ? AND deleted_at IS NULL
     ORDER BY chapter_number, id LIMIT 1`
  ).get(volumeId) as { id: number } | undefined;
  return r ? r.id : null;
}
