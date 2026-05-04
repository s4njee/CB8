import type Database from 'better-sqlite3';
import type { MediaRecord, QueryOptions, QueryResult } from '../../shared/types';
import type { SqlParam, ComicRow, ComicListRow, CountRow, TagNameRow } from './types';
import { SORT_COLUMN_MAP } from './types';
import { addTag } from './tags';

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

export function rowToRecord(db: Database.Database, row: ComicRow): MediaRecord {
  const tags = db.prepare(
    `SELECT t.name FROM tags t JOIN comic_tags ct ON t.id = ct.tag_id WHERE ct.comic_id = ?`
  ).all(row.id) as TagNameRow[];

  return {
    id: row.id,
    filePath: row.file_path,
    title: row.title,
    pageCount: row.page_count,
    fileSize: row.file_size,
    coverThumbnail: row.cover_thumbnail,
    dateAdded: row.date_added,
    tags: tags.map((t) => t.name),
    lastPage: row.last_page ?? null,
    lastLocation: row.last_location ?? null,
    lastRead: row.last_read ?? null,
    mediaType: (row.media_type === 'book' ? 'book' : 'comic') as 'comic' | 'book',
    chapterNumber: row.chapter_number ?? null,
    seriesId: row.series_id ?? null,
    volumeId: row.volume_id ?? null,
  };
}

export function rowToListRecord(row: ComicListRow): MediaRecord {
  return {
    id: row.id,
    filePath: row.file_path,
    title: row.title,
    pageCount: row.page_count,
    fileSize: row.file_size,
    coverThumbnail: null,
    hasThumbnail: row.has_thumbnail === 1,
    thumbnailVersion: row.thumbnail_version,
    dateAdded: row.date_added,
    tags: [],
    lastPage: row.last_page ?? null,
    lastLocation: row.last_location ?? null,
    chapterNumber: row.chapter_number ?? null,
    seriesId: row.series_id ?? null,
    volumeId: row.volume_id ?? null,
    lastRead: row.last_read ?? null,
    mediaType: (row.media_type === 'book' ? 'book' : 'comic') as 'comic' | 'book',
  };
}

/**
 * Fast-path insert for the bulk ingest pipeline. Skips the post-insert
 * SELECT round-trip and tag handling. Caller (flushBatch) runs this
 * inside a single SQLite transaction across many rows.
 */
export function addComicFast(
  db: Database.Database,
  record: {
    filePath: string;
    title: string;
    pageCount: number;
    fileSize: number;
    coverThumbnail: Buffer;
    mediaType: 'comic' | 'book';
  },
): number {
  db.prepare('DELETE FROM dismissed_paths WHERE file_path = ?').run(record.filePath);
  const stmt = db.prepare(
    `INSERT INTO comics (file_path, title, page_count, file_size, cover_thumbnail, last_page, last_location, last_read, media_type)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`
  );
  const info = stmt.run(
    record.filePath,
    record.title,
    record.pageCount,
    record.fileSize,
    record.coverThumbnail,
    record.mediaType,
  );
  return info.lastInsertRowid as number;
}

export function addComic(db: Database.Database, record: Omit<MediaRecord, 'id' | 'dateAdded'>): MediaRecord {
  db.prepare('DELETE FROM dismissed_paths WHERE file_path = ?').run(record.filePath);
  const stmt = db.prepare(
    `INSERT INTO comics (file_path, title, page_count, file_size, cover_thumbnail, last_page, last_location, last_read, media_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    record.filePath,
    record.title,
    record.pageCount,
    record.fileSize,
    record.coverThumbnail,
    record.lastPage,
    record.lastLocation,
    record.lastRead,
    record.mediaType ?? 'comic',
  );
  const id = info.lastInsertRowid as number;

  if (record.tags?.length) {
    for (const tag of record.tags) {
      addTag(db, id, tag);
    }
  }

  return getComic(db, id)!;
}

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

export function removeComics(db: Database.Database, ids: number[]): void {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT file_path FROM comics WHERE id IN (${placeholders})`).all(...ids) as { file_path: string }[];
  const dismiss = db.prepare('INSERT OR IGNORE INTO dismissed_paths (file_path) VALUES (?)');
  const del = db.prepare(`DELETE FROM comics WHERE id IN (${placeholders})`);
  const tx = db.transaction(() => {
    for (const row of rows) dismiss.run(row.file_path);
    del.run(...ids);
  });
  tx();
}

export function isDismissed(db: Database.Database, filePath: string): boolean {
  return db.prepare('SELECT 1 FROM dismissed_paths WHERE file_path = ?').get(filePath) !== undefined;
}

export function getComic(db: Database.Database, id: number): MediaRecord | null {
  const row = db.prepare(
    `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type, chapter_number, series_id, volume_id
     FROM comics WHERE id = ?`
  ).get(id) as ComicRow | undefined;
  if (!row) return null;
  return rowToRecord(db, row);
}

export function comicExistsByPath(db: Database.Database, filePath: string): boolean {
  const row = db.prepare('SELECT 1 FROM comics WHERE file_path = ?').get(filePath);
  return row !== undefined;
}

export function updateCoverThumbnailByPath(db: Database.Database, filePath: string, coverThumbnail: Buffer | null): void {
  db.prepare('UPDATE comics SET cover_thumbnail = ? WHERE file_path = ?').run(coverThumbnail, filePath);
}

export function updatePageCountByPath(db: Database.Database, filePath: string, pageCount: number): void {
  db.prepare('UPDATE comics SET page_count = ? WHERE file_path = ?').run(pageCount, filePath);
}

export function getComicByPath(db: Database.Database, filePath: string): MediaRecord | null {
  const row = db.prepare(
    `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type, chapter_number, series_id, volume_id
     FROM comics WHERE file_path = ?`
  ).get(filePath) as ComicRow | undefined;
  if (!row) return null;
  return rowToRecord(db, row);
}

export function getCoverThumbnail(db: Database.Database, comicId: number): Buffer | null {
  const row = db.prepare('SELECT cover_thumbnail FROM comics WHERE id = ?').get(comicId) as { cover_thumbnail: Buffer | null } | undefined;
  return row?.cover_thumbnail ?? null;
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

export function updateReadingProgress(db: Database.Database, comicId: number, pageIndex: number): void {
  // Auto-flip completed when we hit the final page (pages are 0-indexed, so
  // last page = page_count - 1). Never downgrades completed → 0.
  db.prepare(
    `UPDATE comics
     SET last_page = ?,
         last_read = datetime('now'),
         completed = CASE
           WHEN page_count > 0 AND ? >= page_count - 1 THEN 1
           ELSE completed
         END
     WHERE id = ?`
  ).run(pageIndex, pageIndex, comicId);
}

export function updateReadingLocation(db: Database.Database, comicId: number, location: string): void {
  db.prepare(
    `UPDATE comics SET last_location = ?, last_read = datetime('now') WHERE id = ?`
  ).run(location, comicId);
}

export function getRecentlyRead(
  db: Database.Database,
  limit: number = 10,
  mediaType?: 'comic' | 'book',
): MediaRecord[] {
  const rows = mediaType
    ? db.prepare(
        `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type, chapter_number, series_id, volume_id
         FROM comics WHERE last_read IS NOT NULL AND deleted_at IS NULL AND media_type = ?
         ORDER BY last_read DESC LIMIT ?`
      ).all(mediaType, limit) as ComicRow[]
    : db.prepare(
        `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type, chapter_number, series_id, volume_id
         FROM comics WHERE last_read IS NOT NULL AND deleted_at IS NULL
         ORDER BY last_read DESC LIMIT ?`
      ).all(limit) as ComicRow[];
  return rows.map((r) => rowToRecord(db, r));
}

export function getContinueReading(
  db: Database.Database,
  limit: number = 10,
  mediaType?: 'comic' | 'book',
): MediaRecord[] {
  const rows = mediaType
    ? db.prepare(
        `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type, chapter_number, series_id, volume_id
         FROM comics WHERE last_read IS NOT NULL AND deleted_at IS NULL AND completed = 0 AND media_type = ?
         ORDER BY last_read DESC LIMIT ?`
      ).all(mediaType, limit) as ComicRow[]
    : db.prepare(
        `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type, chapter_number, series_id, volume_id
         FROM comics WHERE last_read IS NOT NULL AND deleted_at IS NULL AND completed = 0
         ORDER BY last_read DESC LIMIT ?`
      ).all(limit) as ComicRow[];
  return rows.map((r) => rowToRecord(db, r));
}

// `setComicSeries`, `getAllSeries`, `getSeriesComics` were removed in v8.
// Series/volume now live on the `series` and `volume` tables; consumers
// reach them through `seriesRepo` / `volumeRepo` (db.series.* / db.volume.*)
// and the v7 read paths (`listForSeries`, `listForVolume`, …).

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
): MediaRecord[] {
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
): MediaRecord[] {
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

export function updateComicMetadata(
  db: Database.Database,
  comicId: number,
  fields: {
    title?: string; author?: string | null; artist?: string | null; genre?: string | null;
    year?: number | null; summary?: string | null; externalId?: string | null; externalSource?: string | null;
    chapterNumber?: number | null;
    /** Direct FK setters — pass null to detach the comic from a series/volume. */
    seriesId?: number | null; volumeId?: number | null;
  },
): void {
  const parts: string[] = [];
  const vals: SqlParam[] = [];
  const editedFields: string[] = [];
  // Helper that records both the SQL set and which logical field was touched.
  // The logical name is what re-ingest's user-edit guard checks (R-16),
  // so it must match the field-name vocabulary used in metadataResolver.
  const set = (sql: string, val: SqlParam, fieldName: string): void => {
    parts.push(sql); vals.push(val); editedFields.push(fieldName);
  };
  if (fields.title          !== undefined) set('title = ?',           fields.title,          'title');
  if (fields.author         !== undefined) set('author = ?',          fields.author,         'author');
  if (fields.artist         !== undefined) set('artist = ?',          fields.artist,         'artist');
  if (fields.genre          !== undefined) set('genre = ?',           fields.genre,          'genre');
  if (fields.year           !== undefined) set('year = ?',            fields.year,           'year');
  if (fields.summary        !== undefined) set('summary = ?',         fields.summary,        'summary');
  if (fields.externalId     !== undefined) set('external_id = ?',     fields.externalId,     'externalId');
  if (fields.externalSource !== undefined) set('external_source = ?', fields.externalSource, 'externalSource');
  if (fields.chapterNumber  !== undefined) set('chapter_number = ?',  fields.chapterNumber,  'chapterNumber');
  if (fields.seriesId       !== undefined) set('series_id = ?',       fields.seriesId,       'seriesId');
  if (fields.volumeId       !== undefined) set('volume_id = ?',       fields.volumeId,       'volumeId');
  if (parts.length === 0) return;

  db.transaction(() => {
    db.prepare(`UPDATE comics SET ${parts.join(', ')} WHERE id = ?`).run(...vals, comicId);
    addUserEditedFields(db, comicId, editedFields);
  })();
}

/**
 * Append each `fieldName` to `comics.user_edited_fields` (CSV) if not
 * already present. R-16: re-ingest must not clobber user edits.
 *
 * The CSV format is intentionally simple — the field-name vocabulary is
 * a closed set, no escaping needed. Reads are O(F) per comic, which is
 * fine since the set is small.
 */
function addUserEditedFields(db: Database.Database, comicId: number, fields: string[]): void {
  if (fields.length === 0) return;
  const row = db.prepare('SELECT user_edited_fields FROM comics WHERE id = ?').get(comicId) as
    { user_edited_fields: string | null } | undefined;
  const current = row?.user_edited_fields ? row.user_edited_fields.split(',').filter(Boolean) : [];
  const set = new Set(current);
  for (const f of fields) set.add(f);
  const next = [...set].join(',');
  db.prepare('UPDATE comics SET user_edited_fields = ? WHERE id = ?').run(next, comicId);
}

/** True if the user has edited the named field on this comic. R-16. */
export function isFieldUserEdited(
  db: Database.Database,
  comicId: number,
  fieldName: string,
): boolean {
  const row = db.prepare('SELECT user_edited_fields FROM comics WHERE id = ?').get(comicId) as
    { user_edited_fields: string | null } | undefined;
  if (!row?.user_edited_fields) return false;
  return row.user_edited_fields.split(',').includes(fieldName);
}

export function getComicMetadata(
  db: Database.Database,
  id: number,
): {
  author: string | null; artist: string | null; genre: string | null; year: number | null;
  summary: string | null; externalId: string | null; externalSource: string | null;
  chapterNumber: number | null;
  seriesId: number | null; seriesName: string | null;
  volumeId: number | null; volumeNumber: number | null;
} | null {
  const row = db.prepare(`
    SELECT c.author, c.artist, c.genre, c.year, c.summary,
           c.external_id, c.external_source, c.chapter_number,
           c.series_id, s.name AS series_name,
           c.volume_id, v.number AS volume_number
    FROM comics c
    LEFT JOIN series s ON s.id = c.series_id
    LEFT JOIN volume v ON v.id = c.volume_id
    WHERE c.id = ?
  `).get(id) as {
    author: string | null; artist: string | null; genre: string | null; year: number | null;
    summary: string | null; external_id: string | null; external_source: string | null;
    chapter_number: number | null;
    series_id: number | null; series_name: string | null;
    volume_id: number | null; volume_number: number | null;
  } | undefined;
  if (!row) return null;
  return {
    author: row.author, artist: row.artist, genre: row.genre, year: row.year,
    summary: row.summary, externalId: row.external_id, externalSource: row.external_source,
    chapterNumber: row.chapter_number,
    seriesId: row.series_id, seriesName: row.series_name,
    volumeId: row.volume_id, volumeNumber: row.volume_number,
  };
}

export function queryComicsForUser(
  db: Database.Database,
  userId: number | null,
  options: QueryOptions & { readStatus?: 'unread' | 'in-progress' | 'completed'; favorites?: boolean; libraryId?: number; folderId?: number },
): { records: (MediaRecord & { favorited?: boolean })[]; totalCount: number } {
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
