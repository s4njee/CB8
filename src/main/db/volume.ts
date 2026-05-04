/**
 * volume.ts — read/write helpers for the `volume` table introduced in
 * schema v7. See `docs/hierarchy/design.md` §4.1 and the requirements
 * R-2, R-3.
 *
 * Two upsert paths because the "implicit volume" uniqueness is encoded
 * as a partial unique index on `volume(series_id) WHERE number IS NULL`,
 * separate from `volume(series_id, number) WHERE number IS NOT NULL`
 * for numbered volumes. The implicit volume is the catch-all chapter
 * bucket for series with no volume axis (R-3).
 */
import type Database from 'better-sqlite3';

export interface VolumeRow {
  id: number;
  seriesId: number;
  /** NULL for the implicit volume (R-3). */
  number: number | null;
  /** Free-form label, e.g. "v1", "2015 run". May be null. */
  name: string | null;
  coverComicId: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface VolumeListRow extends VolumeRow {
  chapterCount: number;
}

interface VolumeDbRow {
  id: number;
  series_id: number;
  number: number | null;
  name: string | null;
  cover_comic_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface VolumeListDbRow extends VolumeDbRow {
  chapter_count: number;
}

const SELECT_COLS =
  `id, series_id, number, name, cover_comic_id, created_at, updated_at, deleted_at`;

function rowToVolume(r: VolumeDbRow): VolumeRow {
  return {
    id: r.id,
    seriesId: r.series_id,
    number: r.number,
    name: r.name,
    coverComicId: r.cover_comic_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

function rowToVolumeListRow(r: VolumeListDbRow): VolumeListRow {
  return { ...rowToVolume(r), chapterCount: r.chapter_count };
}

/**
 * Upsert a numbered volume. Race-free only when called inside a transaction.
 *
 * Restores a soft-deleted match instead of creating a duplicate, so user
 * state (progress on chapters that survived the soft-delete grace period)
 * stays attached.
 */
export function getOrCreate(
  db: Database.Database,
  seriesId: number,
  number: number,
  name: string | null = null,
): VolumeRow {
  if (!Number.isFinite(number)) {
    throw new Error('volume.getOrCreate: number must be finite (use getOrCreateImplicit for the no-volume case)');
  }

  const live = db.prepare(`
    SELECT ${SELECT_COLS} FROM volume
    WHERE series_id = ? AND number = ? AND deleted_at IS NULL
  `).get(seriesId, number) as VolumeDbRow | undefined;
  if (live) {
    if (name && live.name !== name) {
      db.prepare(`UPDATE volume SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(name, live.id);
      return get(db, live.id)!;
    }
    return rowToVolume(live);
  }

  const dead = db.prepare(`
    SELECT ${SELECT_COLS} FROM volume
    WHERE series_id = ? AND number = ? AND deleted_at IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `).get(seriesId, number) as VolumeDbRow | undefined;
  if (dead) {
    const newName = name ?? dead.name;
    db.prepare(
      `UPDATE volume SET deleted_at = NULL, name = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(newName, dead.id);
    return get(db, dead.id)!;
  }

  const info = db.prepare(
    `INSERT INTO volume (series_id, number, name) VALUES (?, ?, ?)`
  ).run(seriesId, number, name);
  return get(db, Number(info.lastInsertRowid))!;
}

/** Upsert the per-series implicit volume (number IS NULL). R-3. */
export function getOrCreateImplicit(db: Database.Database, seriesId: number): VolumeRow {
  const live = db.prepare(`
    SELECT ${SELECT_COLS} FROM volume
    WHERE series_id = ? AND number IS NULL AND deleted_at IS NULL
  `).get(seriesId) as VolumeDbRow | undefined;
  if (live) return rowToVolume(live);

  const dead = db.prepare(`
    SELECT ${SELECT_COLS} FROM volume
    WHERE series_id = ? AND number IS NULL AND deleted_at IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `).get(seriesId) as VolumeDbRow | undefined;
  if (dead) {
    db.prepare(`UPDATE volume SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(dead.id);
    return get(db, dead.id)!;
  }

  const info = db.prepare(
    `INSERT INTO volume (series_id, number, name) VALUES (?, NULL, NULL)`
  ).run(seriesId);
  return get(db, Number(info.lastInsertRowid))!;
}

export function get(db: Database.Database, id: number): VolumeRow | null {
  const r = db.prepare(`SELECT ${SELECT_COLS} FROM volume WHERE id = ?`).get(id) as VolumeDbRow | undefined;
  return r ? rowToVolume(r) : null;
}

export interface ListOptions {
  includeImplicit?: boolean;
  includeDeleted?: boolean;
}

/**
 * Volumes belonging to a series, ordered by `number NULLS LAST` so the
 * implicit volume (R-3) appears after numbered volumes.
 */
export function listForSeries(
  db: Database.Database,
  seriesId: number,
  opts: ListOptions = {},
): VolumeListRow[] {
  const includeImplicit = opts.includeImplicit ?? true;
  const deletedFilter = opts.includeDeleted ? '' : 'AND v.deleted_at IS NULL';
  const implicitFilter = includeImplicit ? '' : 'AND v.number IS NOT NULL';
  const rows = db.prepare(`
    SELECT v.id, v.series_id, v.number, v.name, v.cover_comic_id,
           v.created_at, v.updated_at, v.deleted_at,
           COALESCE(cc.cnt, 0) AS chapter_count
    FROM volume v
    LEFT JOIN (
      SELECT volume_id, COUNT(*) AS cnt FROM comics
      WHERE deleted_at IS NULL
      GROUP BY volume_id
    ) cc ON cc.volume_id = v.id
    WHERE v.series_id = ?
      ${deletedFilter}
      ${implicitFilter}
    ORDER BY (v.number IS NULL), v.number, v.id
  `).all(seriesId) as VolumeListDbRow[];
  return rows.map(rowToVolumeListRow);
}

export interface UpdateFields {
  number?: number | null;
  name?: string | null;
  coverComicId?: number | null;
}

export function update(db: Database.Database, id: number, fields: UpdateFields): VolumeRow | null {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.number       !== undefined) { sets.push('number = ?');         params.push(fields.number); }
  if (fields.name         !== undefined) { sets.push('name = ?');           params.push(fields.name); }
  if (fields.coverComicId !== undefined) { sets.push('cover_comic_id = ?'); params.push(fields.coverComicId); }
  if (sets.length === 0) return get(db, id);
  sets.push(`updated_at = datetime('now')`);
  params.push(id);
  db.prepare(`UPDATE volume SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return get(db, id);
}

export function softDelete(db: Database.Database, id: number, when?: string): void {
  const ts = when ?? new Date().toISOString();
  db.prepare(`UPDATE volume SET deleted_at = COALESCE(deleted_at, ?), updated_at = datetime('now') WHERE id = ?`).run(ts, id);
}

export function restore(db: Database.Database, id: number): void {
  db.prepare(`UPDATE volume SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
}
