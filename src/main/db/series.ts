/**
 * series.ts — read/write helpers for the `series` table introduced in
 * schema v7. See `docs/hierarchy/design.md` §4.1 and the requirements
 * R-1, R-5, R-9.
 *
 * Conventions match the rest of `src/main/db/`: plain functions, first
 * parameter is the better-sqlite3 Database. Callers are expected to wrap
 * upserts in a transaction when racing matters (e.g. ingest's
 * `flushBatch`).
 */
import type Database from 'better-sqlite3';
import { computeSortName, normalizeSeriesName } from '../seriesParser';

export type SeriesStatus = 'unknown' | 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
export type AgeRating = 'unknown' | 'g' | 'pg' | 'teen' | 'mature' | 'adults_only';

export interface SeriesRow {
  id: number;
  libraryId: number;
  name: string;
  sortName: string;
  localizedName: string | null;
  summary: string | null;
  status: SeriesStatus;
  ageRating: AgeRating;
  coverComicId: number | null;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SeriesListRow extends SeriesRow {
  chapterCount: number;
  /** Most recent `comics.date_added` across the series's chapters. */
  lastChapterAddedAt: string | null;
}

interface SeriesDbRow {
  id: number;
  library_id: number;
  name: string;
  sort_name: string;
  localized_name: string | null;
  summary: string | null;
  status: SeriesStatus;
  age_rating: AgeRating;
  cover_comic_id: number | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface SeriesListDbRow extends SeriesDbRow {
  chapter_count: number;
  last_chapter_added_at: string | null;
}

const SELECT_COLS =
  `id, library_id, name, sort_name, localized_name, summary, status, age_rating,
   cover_comic_id, metadata_json, created_at, updated_at, deleted_at`;

function rowToSeries(r: SeriesDbRow): SeriesRow {
  return {
    id: r.id,
    libraryId: r.library_id,
    name: r.name,
    sortName: r.sort_name,
    localizedName: r.localized_name,
    summary: r.summary,
    status: r.status,
    ageRating: r.age_rating,
    coverComicId: r.cover_comic_id,
    metadataJson: r.metadata_json,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

function rowToSeriesListRow(r: SeriesListDbRow): SeriesListRow {
  return { ...rowToSeries(r), chapterCount: r.chapter_count, lastChapterAddedAt: r.last_chapter_added_at };
}

/**
 * Idempotent upsert keyed on (library_id, name COLLATE NOCASE) for live
 * (non-soft-deleted) series. If a soft-deleted series with the same key
 * exists, it is restored — bringing back any user state attached to it.
 *
 * Race-free only when called inside a transaction.
 */
export function getOrCreate(db: Database.Database, libraryId: number, rawName: string): SeriesRow {
  const name = normalizeSeriesName(rawName);
  if (!name) throw new Error('series.getOrCreate: name must be non-empty');

  // Live row?
  const live = db.prepare(`
    SELECT ${SELECT_COLS} FROM series
    WHERE library_id = ? AND name = ? COLLATE NOCASE AND deleted_at IS NULL
  `).get(libraryId, name) as SeriesDbRow | undefined;
  if (live) return rowToSeries(live);

  // Soft-deleted row to revive?
  const dead = db.prepare(`
    SELECT ${SELECT_COLS} FROM series
    WHERE library_id = ? AND name = ? COLLATE NOCASE AND deleted_at IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `).get(libraryId, name) as SeriesDbRow | undefined;
  if (dead) {
    db.prepare(`UPDATE series SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(dead.id);
    return get(db, dead.id)!;
  }

  const info = db.prepare(
    `INSERT INTO series (library_id, name, sort_name) VALUES (?, ?, ?)`
  ).run(libraryId, name, computeSortName(name));
  return get(db, Number(info.lastInsertRowid))!;
}

export function get(db: Database.Database, id: number): SeriesRow | null {
  const r = db.prepare(`SELECT ${SELECT_COLS} FROM series WHERE id = ?`).get(id) as SeriesDbRow | undefined;
  return r ? rowToSeries(r) : null;
}

/** Lookup by exact (NOCASE) name within a library. Returns null when absent. */
export function lookupByName(db: Database.Database, libraryId: number, name: string): SeriesRow | null {
  const r = db.prepare(
    `SELECT ${SELECT_COLS} FROM series
     WHERE library_id = ? AND name = ? COLLATE NOCASE AND deleted_at IS NULL`
  ).get(libraryId, normalizeSeriesName(name)) as SeriesDbRow | undefined;
  return r ? rowToSeries(r) : null;
}

export interface ListOptions {
  /** Excludes soft-deleted series by default. */
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export function listForLibrary(
  db: Database.Database,
  libraryId: number,
  opts: ListOptions = {},
): SeriesListRow[] {
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;
  const deletedFilter = opts.includeDeleted ? '' : 'AND s.deleted_at IS NULL';
  const rows = db.prepare(`
    SELECT s.id, s.library_id, s.name, s.sort_name, s.localized_name, s.summary,
           s.status, s.age_rating, s.cover_comic_id, s.metadata_json,
           s.created_at, s.updated_at, s.deleted_at,
           COALESCE(cc.cnt, 0) AS chapter_count,
           cc.last_added AS last_chapter_added_at
    FROM series s
    LEFT JOIN (
      SELECT series_id,
             COUNT(*)            AS cnt,
             MAX(date_added)     AS last_added
      FROM comics
      WHERE deleted_at IS NULL
      GROUP BY series_id
    ) cc ON cc.series_id = s.id
    WHERE s.library_id = ?
      ${deletedFilter}
    ORDER BY s.sort_name COLLATE NOCASE, s.id
    LIMIT ? OFFSET ?
  `).all(libraryId, limit, offset) as SeriesListDbRow[];
  return rows.map(rowToSeriesListRow);
}

export function countForLibrary(db: Database.Database, libraryId: number, opts: Pick<ListOptions, 'includeDeleted'> = {}): number {
  const deletedFilter = opts.includeDeleted ? '' : 'AND deleted_at IS NULL';
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM series
    WHERE library_id = ?
      ${deletedFilter}
  `).get(libraryId) as { count: number };
  return row.count;
}

export function listForFolder(
  db: Database.Database,
  folderId: number,
  opts: ListOptions = {},
): SeriesListRow[] {
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;
  const deletedFilter = opts.includeDeleted ? '' : 'AND s.deleted_at IS NULL';
  const chapterDeletedFilter = opts.includeDeleted ? '' : 'AND c.deleted_at IS NULL';
  const rows = db.prepare(`
    SELECT s.id, s.library_id, s.name, s.sort_name, s.localized_name, s.summary,
           s.status, s.age_rating, s.cover_comic_id, s.metadata_json,
           s.created_at, s.updated_at, s.deleted_at,
           COUNT(c.id) AS chapter_count,
           MAX(c.date_added) AS last_chapter_added_at
    FROM series s
    JOIN comics c ON c.series_id = s.id
    JOIN folder_comics fc ON fc.comic_id = c.id
    WHERE fc.folder_id = ?
      ${deletedFilter}
      ${chapterDeletedFilter}
    GROUP BY s.id
    HAVING chapter_count > 0
    ORDER BY s.sort_name COLLATE NOCASE, s.id
    LIMIT ? OFFSET ?
  `).all(folderId, limit, offset) as SeriesListDbRow[];
  return rows.map(rowToSeriesListRow);
}

export function countForFolder(db: Database.Database, folderId: number, opts: Pick<ListOptions, 'includeDeleted'> = {}): number {
  const deletedFilter = opts.includeDeleted ? '' : 'AND s.deleted_at IS NULL';
  const chapterDeletedFilter = opts.includeDeleted ? '' : 'AND c.deleted_at IS NULL';
  const row = db.prepare(`
    SELECT COUNT(DISTINCT s.id) AS count
    FROM series s
    JOIN comics c ON c.series_id = s.id
    JOIN folder_comics fc ON fc.comic_id = c.id
    WHERE fc.folder_id = ?
      ${deletedFilter}
      ${chapterDeletedFilter}
  `).get(folderId) as { count: number };
  return row.count;
}


export type UpdatableField =
  | 'name' | 'localized_name' | 'summary' | 'status' | 'age_rating'
  | 'cover_comic_id' | 'metadata_json';

export interface UpdateFields {
  name?: string;
  localizedName?: string | null;
  summary?: string | null;
  status?: SeriesStatus;
  ageRating?: AgeRating;
  coverComicId?: number | null;
  metadataJson?: string | null;
}

export function update(db: Database.Database, id: number, fields: UpdateFields): SeriesRow | null {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.name !== undefined) {
    const n = normalizeSeriesName(fields.name);
    sets.push('name = ?', 'sort_name = ?');
    params.push(n, computeSortName(n));
  }
  if (fields.localizedName !== undefined) { sets.push('localized_name = ?'); params.push(fields.localizedName); }
  if (fields.summary       !== undefined) { sets.push('summary = ?');        params.push(fields.summary); }
  if (fields.status        !== undefined) { sets.push('status = ?');         params.push(fields.status); }
  if (fields.ageRating     !== undefined) { sets.push('age_rating = ?');     params.push(fields.ageRating); }
  if (fields.coverComicId  !== undefined) { sets.push('cover_comic_id = ?'); params.push(fields.coverComicId); }
  if (fields.metadataJson  !== undefined) { sets.push('metadata_json = ?');  params.push(fields.metadataJson); }
  if (sets.length === 0) return get(db, id);

  sets.push(`updated_at = datetime('now')`);
  params.push(id);
  db.prepare(`UPDATE series SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return get(db, id);
}

/** Sets deleted_at. No-op if already soft-deleted. R-8. */
export function softDelete(db: Database.Database, id: number, when?: string): void {
  const ts = when ?? new Date().toISOString();
  db.prepare(`UPDATE series SET deleted_at = COALESCE(deleted_at, ?), updated_at = datetime('now') WHERE id = ?`).run(ts, id);
}

export function restore(db: Database.Database, id: number): void {
  db.prepare(`UPDATE series SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
}
