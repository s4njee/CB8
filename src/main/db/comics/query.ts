/**
 * comics/query.ts — paginated browse queries (anonymous + per-user).
 *
 * Both produce `ComicListItem`-shaped rows with `hasThumbnail` /
 * `thumbnailVersion` instead of inline cover bytes; the cover comes back
 * from the `/api/comics/:id/thumbnail` route. `queryComicsForUser` adds
 * a per-user `favorited` flag and overlays `user_progress` so the
 * displayed `lastPage` / `lastRead` are scoped to the caller.
 */
import type Database from 'better-sqlite3';
import type { ComicDetail, ComicListItem, QueryOptions, QueryResult } from '../../../shared/types';
import type { SqlParam, ComicRow, ComicListRow, CountRow } from '../types';
import { SORT_COLUMN_MAP } from '../types';
import { rowToRecord, rowToListRecord } from './core';

/**
 * Build a safe FTS5 MATCH expression from free-form user input.
 *
 * FTS5 has its own query syntax with reserved characters (`-`, `*`, `(`,
 * `"`, `:`, etc.); pasting raw user text into MATCH would either error
 * out or trigger surprising operator semantics. Strategy: tokenize on
 * whitespace, strip non-alphanumerics from each token (the unicode61
 * tokenizer already discards them in the index, so the search side
 * should match), append `*` for prefix matching, AND together.
 *
 * Example: `"naru-to vol 1"` → `naruto* vol* 1*`.
 *
 * Returns null if no usable tokens remain — the caller should then fall
 * through to no search predicate (or treat as zero-results, depending on
 * UX preference).
 */
export function buildFtsQuery(raw: string): string | null {
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}*`).join(' ');
}

export function queryComics(db: Database.Database, options: QueryOptions = {}): QueryResult {
  const conditions: string[] = [];
  const params: SqlParam[] = [];

  // R-8: hide soft-deleted comics from the default browse path. Admin
  // tooling that wants to surface them passes the explicit option.
  if (!options.includeDeleted) {
    conditions.push('c.deleted_at IS NULL');
  }

  if (options.mediaType) {
    conditions.push('c.media_type = ?');
    params.push(options.mediaType);
  }

  if (options.search) {
    const fts = buildFtsQuery(options.search);
    if (fts) {
      conditions.push('c.id IN (SELECT rowid FROM comics_fts WHERE comics_fts MATCH ?)');
      params.push(fts);
    } else {
      // User typed only punctuation / whitespace — match nothing rather
      // than silently dropping the filter.
      conditions.push('1 = 0');
    }
  }

  if (options.tag) {
    conditions.push(
      `c.id IN (SELECT ct.comic_id FROM comic_tags ct JOIN tags t ON ct.tag_id = t.id WHERE t.name = ?)`
    );
    params.push(options.tag);
  }

  if (options.excludeFoldered) {
    conditions.push('c.id NOT IN (SELECT comic_id FROM folder_comics)');
  }

  if (options.fileExt) {
    conditions.push('LOWER(c.file_path) LIKE ?');
    params.push('%.' + options.fileExt.toLowerCase());
  }

  if (options.readStatus === 'unread') {
    conditions.push('c.last_page IS NULL AND c.last_read IS NULL');
  } else if (options.readStatus === 'in-progress') {
    conditions.push('(c.last_page IS NOT NULL OR c.last_read IS NOT NULL) AND (c.last_page IS NULL OR c.last_page < c.page_count - 1)');
  } else if (options.readStatus === 'completed') {
    conditions.push('c.last_page = c.page_count - 1');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortCol = SORT_COLUMN_MAP[options.sortBy ?? 'title'] ?? SORT_COLUMN_MAP.title;
  const sortDir = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const totalCount = (db.prepare(
    `SELECT COUNT(*) as cnt FROM comics c ${where}`
  ).get(...params) as CountRow).cnt;

  const rows = db.prepare(
    `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size,
            CASE WHEN c.cover_thumbnail IS NULL THEN 0 ELSE 1 END as has_thumbnail,
            COALESCE(length(c.cover_thumbnail), 0) as thumbnail_version,
            c.date_added, c.last_page, c.last_location, c.last_read, c.media_type,
            c.chapter_number, c.series_id, c.volume_id
     FROM comics c ${where}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as ComicListRow[];

  return {
    records: rows.map(rowToListRecord),
    totalCount,
  };
}

export function queryComicsForUser(
  db: Database.Database,
  userId: number | null,
  options: QueryOptions & { readStatus?: 'unread' | 'in-progress' | 'completed'; favorites?: boolean; libraryId?: number; folderId?: number },
): { records: (ComicDetail & { favorited?: boolean })[]; totalCount: number } {
  const conditions: string[] = [];
  const params: SqlParam[] = [];

  // R-8: hide soft-deleted comics from the user-facing query path. Admin
  // tooling that wants to surface them passes `includeDeleted: true`.
  if (!options.includeDeleted) {
    conditions.push('c.deleted_at IS NULL');
  }

  if (options.libraryId != null) {
    conditions.push('c.id IN (SELECT comic_id FROM library_comics WHERE library_id = ?)');
    params.push(options.libraryId);
  }
  if (options.folderId != null) {
    conditions.push('c.id IN (SELECT comic_id FROM folder_comics WHERE folder_id = ?)');
    params.push(options.folderId);
  }
  if (options.mediaType) {
    conditions.push('c.media_type = ?');
    params.push(options.mediaType);
  }
  if (options.search) {
    const fts = buildFtsQuery(options.search);
    if (fts) {
      conditions.push('c.id IN (SELECT rowid FROM comics_fts WHERE comics_fts MATCH ?)');
      params.push(fts);
    } else {
      conditions.push('1 = 0');
    }
  }
  if (options.tag) {
    conditions.push('c.id IN (SELECT ct.comic_id FROM comic_tags ct JOIN tags t ON ct.tag_id = t.id WHERE t.name = ?)');
    params.push(options.tag);
  }
  if (options.excludeFoldered) {
    conditions.push('c.id NOT IN (SELECT comic_id FROM folder_comics)');
  }
  if (options.fileExt) {
    conditions.push('LOWER(c.file_path) LIKE ?');
    params.push('%.' + options.fileExt.toLowerCase());
  }

  let progressJoin = '';
  const progressSelect = userId != null
    ? 'up.last_page as up_last_page, up.last_location as up_last_location, up.last_read as up_last_read, up.completed as up_completed'
    : 'NULL as up_last_page, NULL as up_last_location, NULL as up_last_read, 0 as up_completed';
  if (userId != null) {
    progressJoin = 'LEFT JOIN user_progress up ON up.comic_id = c.id AND up.user_id = ?';
  }

  let favSelect = '0 as is_fav';
  let favJoin = '';
  if (userId != null) {
    favSelect = 'CASE WHEN uf.comic_id IS NULL THEN 0 ELSE 1 END as is_fav';
    favJoin = 'LEFT JOIN user_favorites uf ON uf.comic_id = c.id AND uf.user_id = ?';
  }

  if (options.readStatus && userId != null) {
    if (options.readStatus === 'unread') {
      conditions.push('(up.comic_id IS NULL OR (COALESCE(up.last_page, 0) = 0 AND up.completed = 0))');
    } else if (options.readStatus === 'in-progress') {
      conditions.push('up.comic_id IS NOT NULL AND up.last_page IS NOT NULL AND up.last_page > 0 AND up.completed = 0');
    } else if (options.readStatus === 'completed') {
      conditions.push('up.completed = 1');
    }
  }

  if (options.favorites && userId != null) {
    conditions.push('uf.comic_id IS NOT NULL');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortCol = options.sortBy === 'lastRead' && userId != null
    ? "COALESCE(up.last_read, '')"
    : (SORT_COLUMN_MAP[options.sortBy ?? 'title'] ?? SORT_COLUMN_MAP.title);
  const sortDir = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const joinParams: SqlParam[] = [];
  if (userId != null) joinParams.push(userId);
  if (userId != null) joinParams.push(userId);
  const allParams = [...joinParams, ...params];

  const countSql = `SELECT COUNT(*) as cnt FROM comics c ${progressJoin} ${favJoin} ${where}`;
  const totalCount = (db.prepare(countSql).get(...allParams) as CountRow).cnt;

  const rowsSql = `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail, c.date_added,
                          c.last_page, c.last_location, c.last_read, c.media_type,
                          ${progressSelect}, ${favSelect}
                   FROM comics c ${progressJoin} ${favJoin}
                   ${where}
                   ORDER BY ${sortCol} ${sortDir}
                   LIMIT ? OFFSET ?`;
  const rows = db.prepare(rowsSql).all(...allParams, limit, offset) as (ComicRow & { up_last_page: number | null; up_last_location: string | null; up_last_read: string | null; up_completed: number; is_fav: number })[];

  const records = rows.map((r) => {
    const base = rowToRecord(db, r);
    if (userId != null) {
      base.lastPage = r.up_last_page;
      base.lastLocation = r.up_last_location;
      base.lastRead = r.up_last_read;
    }
    return { ...base, favorited: !!r.is_fav };
  });

  return { records, totalCount };
}
