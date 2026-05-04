/**
 * search.ts — cross-kind FTS search for the v7 hierarchy.
 *
 * Returns a union of series and chapter matches, ranking series above
 * chapters when both match the query (R-11). See design.md §9 for the
 * SQL shape; this module owns the execution.
 *
 * Query syntax: simple word tokens; punctuation is stripped, whitespace
 * splits tokens, each token is suffixed with FTS5's prefix-match `*` so
 * partial typing finds matches (e.g. "darth va" → matches "Darth Vader").
 */
import type Database from 'better-sqlite3';
import { buildFtsQuery } from './comics';

export type SearchKind = 'series' | 'chapter';

export interface SearchHit {
  kind: SearchKind;
  id: number;
  title: string;
  /** Library scope. Always set for series rows; chapter rows derive it via library_comics. */
  libraryId: number | null;
  /** For chapters, the parent series id (may be null for standalone). */
  seriesId: number | null;
}

interface SearchHitDb {
  kind: SearchKind;
  id: number;
  title: string;
  library_id: number | null;
  series_id: number | null;
}

export interface SearchOptions {
  /** Optional library scope; restricts both series and chapter matches. */
  libraryId?: number;
  limit?: number;
}

/**
 * Run the union search. Returns up to `limit` rows (default 50).
 *
 * Empty queries (only whitespace/punctuation) return `[]` — we don't
 * silently produce a "match all" result.
 */
export function unionSearch(
  db: Database.Database,
  rawQuery: string,
  opts: SearchOptions = {},
): SearchHit[] {
  const limit = opts.limit ?? 50;
  const fts = buildFtsQuery(rawQuery);
  if (!fts) return [];

  const libraryFilter = opts.libraryId != null;
  const seriesLibCond = libraryFilter ? 'AND series.library_id = @libraryId' : '';
  const chapterLibCond = libraryFilter
    ? `AND comics.id IN (
        SELECT comic_id FROM library_comics WHERE library_id = @libraryId
      )`
    : '';

  // The `(kind = 'series') DESC` orders 1 (series) above 0 (chapter), so
  // a series hit always comes first when both kinds match the same word.
  // Within each kind, ties are broken by lower-cased title alpha order.
  const rows = db.prepare(`
    WITH s AS (
      SELECT
        series.id   AS id,
        'series'    AS kind,
        series.name AS title,
        series.library_id AS library_id,
        NULL        AS series_id
      FROM series_fts
      JOIN series ON series.id = series_fts.rowid
      WHERE series_fts MATCH @fts
        AND series.deleted_at IS NULL
        ${seriesLibCond}
    ),
    c AS (
      SELECT
        comics.id    AS id,
        'chapter'    AS kind,
        comics.title AS title,
        NULL         AS library_id,
        comics.series_id AS series_id
      FROM comics
      WHERE comics.id IN (SELECT rowid FROM comics_fts WHERE comics_fts MATCH @fts)
        AND comics.deleted_at IS NULL
        ${chapterLibCond}
    )
    SELECT * FROM (
      SELECT id, kind, title, library_id, series_id FROM s
      UNION ALL
      SELECT id, kind, title, library_id, series_id FROM c
    )
    ORDER BY (kind = 'series') DESC, lower(title)
    LIMIT @limit
  `).all({ fts, limit, libraryId: opts.libraryId ?? null }) as SearchHitDb[];

  return rows.map((r) => ({
    kind: r.kind, id: r.id, title: r.title,
    libraryId: r.library_id, seriesId: r.series_id,
  }));
}
