/**
 * comics/listings.ts — chapter listings under the v7 hierarchy
 * (R-9 read paths). `listForSeries` joins through `volume` so it can
 * order by `(volume.number NULLS LAST, comic.chapter_number)`; the
 * implicit volume (R-3) ends up last, numbered volumes ascend.
 */
import type Database from 'better-sqlite3';
import type { ComicDetail } from '../../../shared/types';
import type { ComicRow } from '../types';
import { rowToRecord } from './core';

/**
 * R-9 chapter listing for a v7 series id. Joins through volume so the
 * order can be `(volume.number IS NULL, volume.number, comic.chapter_number,
 * comic.title)` — implicit volume sorts last; numbered volumes ascend.
 *
 * Soft-deleted comics are excluded by default (R-8). Pass
 * `includeDeleted: true` to surface them for admin reveal.
 */
export function listForSeries(
  db: Database.Database,
  seriesId: number,
  opts: { includeDeleted?: boolean; limit?: number; offset?: number } = {},
): ComicDetail[] {
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;
  const deletedFilter = opts.includeDeleted ? '' : 'AND c.deleted_at IS NULL';
  const rows = db.prepare(
    `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail,
            c.date_added, c.last_page, c.last_location, c.last_read, c.media_type,
            c.chapter_number, c.series_id, c.volume_id
     FROM comics c
     LEFT JOIN volume v ON v.id = c.volume_id
     WHERE c.series_id = ? ${deletedFilter}
     ORDER BY (v.number IS NULL), v.number, COALESCE(c.chapter_number, 999999), c.title COLLATE NOCASE
     LIMIT ? OFFSET ?`
  ).all(seriesId, limit, offset) as ComicRow[];
  return rows.map((r) => rowToRecord(db, r));
}

/** R-9 chapter listing scoped to a single volume id. */
export function listForVolume(
  db: Database.Database,
  volumeId: number,
  opts: { includeDeleted?: boolean; limit?: number; offset?: number } = {},
): ComicDetail[] {
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;
  const deletedFilter = opts.includeDeleted ? '' : 'AND c.deleted_at IS NULL';
  const rows = db.prepare(
    `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail,
            c.date_added, c.last_page, c.last_location, c.last_read, c.media_type,
            c.chapter_number, c.series_id, c.volume_id
     FROM comics c
     WHERE c.volume_id = ? ${deletedFilter}
     ORDER BY COALESCE(c.chapter_number, 999999), c.title COLLATE NOCASE
     LIMIT ? OFFSET ?`
  ).all(volumeId, limit, offset) as ComicRow[];
  return rows.map((r) => rowToRecord(db, r));
}
