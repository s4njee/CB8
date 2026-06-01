import type Database from 'better-sqlite3';
import type { MediaRecord, QueryOptions, QueryResult } from '../../shared/types';
import type { SqlParam, ComicRow, ComicListRow, CountRow } from './types';
import { SORT_COLUMN_MAP } from './types';
import { addTag } from './tags';

type ComicFilterOptions = QueryOptions & {
  libraryId?: number;
  folderId?: number;
};

type UserComicQueryOptions = ComicFilterOptions & {
  favorites?: boolean;
};

type UserComicListRow = ComicListRow & {
  up_last_page: number | null;
  up_last_location: string | null;
  up_last_read: string | null;
  up_completed: number;
  is_fav: number;
};

type ComicTagRow = {
  comic_id: number;
  name: string;
};

const DEFAULT_QUERY_LIMIT = 50;
const DEFAULT_QUERY_OFFSET = 0;
const TAG_LOOKUP_CHUNK_SIZE = 500;

const COMIC_LIST_SELECT = `
  c.id, c.file_path, c.title, c.page_count, c.file_size,
  CASE WHEN c.cover_thumbnail IS NULL THEN 0 ELSE 1 END as has_thumbnail,
  COALESCE(length(c.cover_thumbnail), 0) as thumbnail_version,
  c.date_added, c.last_page, c.last_location, c.last_read, c.media_type
`;

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
function buildFtsQuery(raw: string): string | null {
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}*`).join(' ');
}

function toMediaType(value: string): MediaRecord['mediaType'] {
  return value === 'book' ? 'book' : 'comic';
}

function buildWhere(conditions: string[]): string {
  return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
}

function resolvePaging(options: QueryOptions): { limit: number; offset: number } {
  return {
    limit: options.limit ?? DEFAULT_QUERY_LIMIT,
    offset: options.offset ?? DEFAULT_QUERY_OFFSET,
  };
}

function resolveSort(options: QueryOptions, userScoped: boolean): { sortCol: string; sortDir: 'ASC' | 'DESC' } {
  const sortCol = options.sortBy === 'lastRead' && userScoped
    ? "COALESCE(up.last_read, '')"
    : (SORT_COLUMN_MAP[options.sortBy ?? 'title'] ?? SORT_COLUMN_MAP.title);
  const sortDir = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
  return { sortCol, sortDir };
}

function addSharedReadStatusFilter(conditions: string[], readStatus: QueryOptions['readStatus']): void {
  if (readStatus === 'unread') {
    conditions.push('c.last_page IS NULL AND c.last_read IS NULL');
  } else if (readStatus === 'in-progress') {
    conditions.push('(c.last_page IS NOT NULL OR c.last_read IS NOT NULL) AND (c.last_page IS NULL OR c.last_page < c.page_count - 1)');
  } else if (readStatus === 'completed') {
    conditions.push('c.last_page = c.page_count - 1');
  }
}

function addUserReadStatusFilter(conditions: string[], readStatus: QueryOptions['readStatus']): void {
  if (readStatus === 'unread') {
    conditions.push('(up.comic_id IS NULL OR (COALESCE(up.last_page, 0) = 0 AND up.completed = 0))');
  } else if (readStatus === 'in-progress') {
    conditions.push('up.comic_id IS NOT NULL AND up.last_page IS NOT NULL AND up.last_page > 0 AND up.completed = 0');
  } else if (readStatus === 'completed') {
    conditions.push('up.completed = 1');
  }
}

function buildComicFilters(
  options: ComicFilterOptions,
  opts: { includeSharedReadStatus: boolean },
): { conditions: string[]; params: SqlParam[] } {
  const conditions: string[] = [];
  const params: SqlParam[] = [];

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
      // User typed only punctuation / whitespace: match nothing rather than
      // silently dropping the filter.
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

  if (opts.includeSharedReadStatus) {
    addSharedReadStatusFilter(conditions, options.readStatus);
  }

  return { conditions, params };
}

function getTagsByComicId(db: Database.Database, comicIds: number[]): Map<number, string[]> {
  const ids = Array.from(new Set(comicIds));
  if (!ids.length) return new Map();

  const tagsById = new Map<number, string[]>();
  for (let i = 0; i < ids.length; i += TAG_LOOKUP_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + TAG_LOOKUP_CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT ct.comic_id, t.name
       FROM comic_tags ct
       JOIN tags t ON t.id = ct.tag_id
       WHERE ct.comic_id IN (${placeholders})
       ORDER BY t.name COLLATE NOCASE`,
    ).all(...chunk) as ComicTagRow[];

    for (const row of rows) {
      const tags = tagsById.get(row.comic_id);
      if (tags) tags.push(row.name);
      else tagsById.set(row.comic_id, [row.name]);
    }
  }
  return tagsById;
}

function withBatchedTags<T extends MediaRecord>(db: Database.Database, records: T[]): T[] {
  const tagsById = getTagsByComicId(db, records.map((record) => record.id));
  for (const record of records) {
    record.tags = tagsById.get(record.id) ?? [];
  }
  return records;
}

function rowToRecordBase(row: ComicRow, tags: string[]): MediaRecord {
  return {
    id: row.id,
    filePath: row.file_path,
    title: row.title,
    pageCount: row.page_count,
    fileSize: row.file_size,
    coverThumbnail: row.cover_thumbnail,
    dateAdded: row.date_added,
    tags,
    lastPage: row.last_page ?? null,
    lastLocation: row.last_location ?? null,
    lastRead: row.last_read ?? null,
    mediaType: toMediaType(row.media_type),
  };
}

export function rowToRecord(db: Database.Database, row: ComicRow): MediaRecord {
  const tags = getTagsByComicId(db, [row.id]).get(row.id) ?? [];
  return rowToRecordBase(row, tags);
}

export function rowsToRecords(db: Database.Database, rows: ComicRow[]): MediaRecord[] {
  return withBatchedTags(db, rows.map((row) => rowToRecordBase(row, [])));
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
    lastRead: row.last_read ?? null,
    mediaType: toMediaType(row.media_type),
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
    `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type
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
    `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type
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
            c.date_added, c.last_page, c.last_location, c.last_read, c.media_type
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
        `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type
         FROM comics WHERE last_read IS NOT NULL AND media_type = ?
         ORDER BY last_read DESC LIMIT ?`
      ).all(mediaType, limit) as ComicRow[]
    : db.prepare(
        `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type
         FROM comics WHERE last_read IS NOT NULL
         ORDER BY last_read DESC LIMIT ?`
      ).all(limit) as ComicRow[];
  return rowsToRecords(db, rows);
}

export function getContinueReading(
  db: Database.Database,
  limit: number = 10,
  mediaType?: 'comic' | 'book',
): MediaRecord[] {
  const rows = mediaType
    ? db.prepare(
        `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type
         FROM comics WHERE last_read IS NOT NULL AND completed = 0 AND media_type = ?
         ORDER BY last_read DESC LIMIT ?`
      ).all(mediaType, limit) as ComicRow[]
    : db.prepare(
        `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type
         FROM comics WHERE last_read IS NOT NULL AND completed = 0
         ORDER BY last_read DESC LIMIT ?`
      ).all(limit) as ComicRow[];
  return rowsToRecords(db, rows);
}

export function setComicSeries(
  db: Database.Database,
  comicId: number,
  seriesName: string | null,
  volumeNumber: number | null,
  chapterNumber: number | null,
): void {
  db.prepare('UPDATE comics SET series_name = ?, volume_number = ?, chapter_number = ? WHERE id = ?').run(seriesName, volumeNumber, chapterNumber, comicId);
}

export function getAllSeries(db: Database.Database): { name: string; count: number; coverComicId: number | null }[] {
  const rows = db.prepare(
    `SELECT series_name as name, COUNT(*) as count,
      (SELECT id FROM comics WHERE series_name = c.series_name ORDER BY COALESCE(volume_number, 999999), COALESCE(chapter_number, 999999), id LIMIT 1) as cover_id
     FROM comics c
     WHERE series_name IS NOT NULL AND series_name != ''
     GROUP BY series_name COLLATE NOCASE
     ORDER BY series_name COLLATE NOCASE`
  ).all() as { name: string; count: number; cover_id: number | null }[];
  return rows.map((r) => ({ name: r.name, count: r.count, coverComicId: r.cover_id }));
}

export function getSeriesComics(db: Database.Database, name: string): MediaRecord[] {
  const rows = db.prepare(
    `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail, c.date_added, c.last_page, c.last_location, c.last_read, c.media_type
     FROM comics c
     WHERE c.series_name = ? COLLATE NOCASE
     ORDER BY COALESCE(c.volume_number, 999999), COALESCE(c.chapter_number, 999999), c.title COLLATE NOCASE`
  ).all(name) as ComicRow[];
  return rowsToRecords(db, rows);
}

export function updateComicMetadata(
  db: Database.Database,
  comicId: number,
  fields: {
    title?: string; author?: string | null; artist?: string | null; genre?: string | null;
    year?: number | null; summary?: string | null; externalId?: string | null; externalSource?: string | null;
    seriesName?: string | null; volumeNumber?: number | null; chapterNumber?: number | null;
  },
): void {
  const parts: string[] = [];
  const vals: SqlParam[] = [];
  if (fields.title !== undefined) { parts.push('title = ?'); vals.push(fields.title); }
  if (fields.author !== undefined) { parts.push('author = ?'); vals.push(fields.author); }
  if (fields.artist !== undefined) { parts.push('artist = ?'); vals.push(fields.artist); }
  if (fields.genre !== undefined) { parts.push('genre = ?'); vals.push(fields.genre); }
  if (fields.year !== undefined) { parts.push('year = ?'); vals.push(fields.year); }
  if (fields.summary !== undefined) { parts.push('summary = ?'); vals.push(fields.summary); }
  if (fields.externalId !== undefined) { parts.push('external_id = ?'); vals.push(fields.externalId); }
  if (fields.externalSource !== undefined) { parts.push('external_source = ?'); vals.push(fields.externalSource); }
  if (fields.seriesName !== undefined) { parts.push('series_name = ?'); vals.push(fields.seriesName); }
  if (fields.volumeNumber !== undefined) { parts.push('volume_number = ?'); vals.push(fields.volumeNumber); }
  if (fields.chapterNumber !== undefined) { parts.push('chapter_number = ?'); vals.push(fields.chapterNumber); }
  if (parts.length === 0) return;
  vals.push(comicId);
  db.prepare(`UPDATE comics SET ${parts.join(', ')} WHERE id = ?`).run(...vals);
}

export function getComicMetadata(
  db: Database.Database,
  id: number,
): {
  author: string | null; artist: string | null; genre: string | null; year: number | null;
  summary: string | null; externalId: string | null; externalSource: string | null;
  seriesName: string | null; volumeNumber: number | null; chapterNumber: number | null;
} | null {
  const row = db.prepare('SELECT author, artist, genre, year, summary, external_id, external_source, series_name, volume_number, chapter_number FROM comics WHERE id = ?').get(id) as { author: string | null; artist: string | null; genre: string | null; year: number | null; summary: string | null; external_id: string | null; external_source: string | null; series_name: string | null; volume_number: number | null; chapter_number: number | null } | undefined;
  if (!row) return null;
  return { author: row.author, artist: row.artist, genre: row.genre, year: row.year, summary: row.summary, externalId: row.external_id, externalSource: row.external_source, seriesName: row.series_name, volumeNumber: row.volume_number, chapterNumber: row.chapter_number };
}

export function queryComicsForUser(
  db: Database.Database,
  userId: number | null,
  options: UserComicQueryOptions,
): { records: (MediaRecord & { favorited?: boolean })[]; totalCount: number } {
  const { conditions, params } = buildComicFilters(options, { includeSharedReadStatus: false });

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
    addUserReadStatusFilter(conditions, options.readStatus);
  }

  if (options.favorites && userId != null) {
    conditions.push('uf.comic_id IS NOT NULL');
  }

  const where = buildWhere(conditions);
  const { sortCol, sortDir } = resolveSort(options, userId != null);
  const { limit, offset } = resolvePaging(options);

  const joinParams: SqlParam[] = [];
  if (userId != null) joinParams.push(userId);
  if (userId != null) joinParams.push(userId);
  const allParams = [...joinParams, ...params];

  const countSql = `SELECT COUNT(*) as cnt FROM comics c ${progressJoin} ${favJoin} ${where}`;
  const totalCount = (db.prepare(countSql).get(...allParams) as CountRow).cnt;

  const rowsSql = `SELECT ${COMIC_LIST_SELECT},
                          ${progressSelect}, ${favSelect}
                   FROM comics c ${progressJoin} ${favJoin}
                   ${where}
                   ORDER BY ${sortCol} ${sortDir}
                   LIMIT ? OFFSET ?`;
  const rows = db.prepare(rowsSql).all(...allParams, limit, offset) as UserComicListRow[];

  const baseRecords = withBatchedTags(db, rows.map(rowToListRecord));
  const records = baseRecords.map((base, index) => {
    const row = rows[index];
    return {
      ...base,
      lastPage: userId != null ? row.up_last_page : base.lastPage,
      lastLocation: userId != null ? row.up_last_location : base.lastLocation,
      lastRead: userId != null ? row.up_last_read : base.lastRead,
      favorited: Boolean(row.is_fav),
    };
  });

  return { records, totalCount };
}
