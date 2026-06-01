import type Database from 'better-sqlite3';
import type { SqlParam, ComicListRow, CountRow } from './types';
import { SORT_COLUMN_MAP } from './types';
import { rowToListRecord } from './comics';
import type { MediaRecord, QueryOptions, QueryResult } from '../../shared/types';

export const FOLDER_GROUP_NONE_KEY = '__none__';

type FolderHierarchyOptions = QueryOptions & {
  favorites?: boolean;
};

export interface FolderSeriesGroup {
  key: string;
  name: string;
  count: number;
  coverComicId: number | null;
}

export interface FolderVolumeGroup {
  key: string;
  label: string;
  volumeNumber: number | null;
  count: number;
  chapterCount: number;
  coverComicId: number | null;
  singleComicId: number | null;
}

export interface FolderChapterGroup {
  key: string;
  label: string;
  chapterNumber: number | null;
  count: number;
  coverComicId: number | null;
  singleComicId: number | null;
}

type UserComicListRow = ComicListRow & {
  up_last_page: number | null;
  up_last_location: string | null;
  up_last_read: string | null;
  is_fav: number;
};

function formatNumberLabel(value: number | null, fallback: string, noun: string): string {
  if (value == null) return fallback;
  return `${noun} ${Number.isInteger(value) ? value.toFixed(0) : String(value)}`;
}

function numericGroupKey(value: number | null): string {
  if (value == null) return FOLDER_GROUP_NONE_KEY;
  return Number.isInteger(value) ? value.toFixed(0) : String(value);
}

function addSeriesFilter(conditions: string[], params: SqlParam[], seriesKey: string): void {
  if (seriesKey === FOLDER_GROUP_NONE_KEY) {
    conditions.push("NULLIF(TRIM(c.series_name), '') IS NULL");
  } else {
    conditions.push('c.series_name = ? COLLATE NOCASE');
    params.push(seriesKey);
  }
}

function addNumberFilter(
  conditions: string[],
  params: SqlParam[],
  column: 'volume_number' | 'chapter_number',
  key: string,
): void {
  if (key === FOLDER_GROUP_NONE_KEY) {
    conditions.push(`c.${column} IS NULL`);
    return;
  }
  const value = Number(key);
  if (!Number.isFinite(value)) {
    conditions.push('1 = 0');
    return;
  }
  conditions.push(`c.${column} = ?`);
  params.push(value);
}

/**
 * Shared scope builder for the hierarchy queries. When `folderId` is null the
 * scope covers all comics in the library (used by the global browse/search
 * endpoints); when it is a number only comics in that folder are included.
 */
function buildHierarchyScope(
  folderId: number | null,
  options: FolderHierarchyOptions,
  userId: number | null,
): { joins: string; where: string; params: SqlParam[] } {
  const joins: string[] = [];
  const joinParams: SqlParam[] = [];
  const conditions: string[] = [];
  const condParams: SqlParam[] = [];

  if (userId != null) {
    joins.push('LEFT JOIN user_progress up ON up.comic_id = c.id AND up.user_id = ?');
    joins.push('LEFT JOIN user_favorites uf ON uf.comic_id = c.id AND uf.user_id = ?');
    joinParams.push(userId, userId);
  }

  if (folderId != null) {
    conditions.push('c.id IN (SELECT comic_id FROM folder_comics WHERE folder_id = ?)');
    condParams.push(folderId);
  }

  if (options.mediaType) {
    conditions.push('c.media_type = ?');
    condParams.push(options.mediaType);
  }
  if (options.fileExt) {
    conditions.push('LOWER(c.file_path) LIKE ?');
    condParams.push('%.' + options.fileExt.toLowerCase());
  }
  if (options.search) {
    const term = `%${options.search}%`;
    conditions.push('(c.title LIKE ? COLLATE NOCASE OR c.file_path LIKE ? COLLATE NOCASE OR c.series_name LIKE ? COLLATE NOCASE)');
    condParams.push(term, term, term);
  }

  if (options.readStatus === 'unread') {
    conditions.push(userId != null
      ? '(up.comic_id IS NULL OR (COALESCE(up.last_page, 0) = 0 AND up.completed = 0))'
      : 'c.last_page IS NULL AND c.last_read IS NULL');
  } else if (options.readStatus === 'in-progress') {
    conditions.push(userId != null
      ? 'up.comic_id IS NOT NULL AND up.last_page IS NOT NULL AND up.last_page > 0 AND up.completed = 0'
      : '(c.last_page IS NOT NULL OR c.last_read IS NOT NULL) AND (c.last_page IS NULL OR c.last_page < c.page_count - 1)');
  } else if (options.readStatus === 'completed') {
    conditions.push(userId != null ? 'up.completed = 1' : 'c.last_page = c.page_count - 1');
  }

  if (options.favorites) {
    conditions.push(userId != null ? 'uf.comic_id IS NOT NULL' : '1 = 0');
  }

  // Always produce a valid WHERE clause so callers can safely append AND ...
  const where = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : 'WHERE 1=1';

  return {
    joins: joins.join(' '),
    where,
    params: [...joinParams, ...condParams],
  };
}

/** Folder-scoped variant — keeps the existing call-sites unchanged. */
function buildFolderHierarchyScope(
  folderId: number,
  options: FolderHierarchyOptions,
  userId: number | null,
): { joins: string; where: string; params: SqlParam[] } {
  return buildHierarchyScope(folderId, options, userId);
}

function applyUserState(row: UserComicListRow, base: MediaRecord, userId: number | null): MediaRecord & { favorited?: boolean } {
  return {
    ...base,
    lastPage: userId != null ? row.up_last_page : base.lastPage,
    lastLocation: userId != null ? row.up_last_location : base.lastLocation,
    lastRead: userId != null ? row.up_last_read : base.lastRead,
    favorited: Boolean(row.is_fav),
  };
}

export function createFolder(
  db: Database.Database,
  name: string,
  comicIds: number[],
): { id: number; name: string } {
  const coverId = comicIds.length > 0 ? comicIds[0] : null;
  const info = db.prepare('INSERT INTO folders (name, cover_comic_id) VALUES (?, ?)').run(name, coverId);
  const folderId = info.lastInsertRowid as number;
  if (comicIds.length > 0) {
    const stmt = db.prepare('INSERT OR IGNORE INTO folder_comics (folder_id, comic_id) VALUES (?, ?)');
    const tx = db.transaction((ids: number[]) => {
      for (const id of ids) stmt.run(folderId, id);
    });
    tx(comicIds);
  }
  return { id: folderId, name };
}

export function renameFolder(db: Database.Database, id: number, newName: string): void {
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(newName, id);
}

export function deleteFolder(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);
}

export function getAllFolders(
  db: Database.Database,
  libraryId?: number | null,
): { id: number; name: string; comicCount: number; coverThumbnail: Buffer | null; mediaType: 'comic' | 'book' | 'mixed' | 'empty' }[] {
  const where = libraryId != null
    ? 'WHERE f.id IN (SELECT folder_id FROM library_folders WHERE library_id = ?)'
    : '';
  const params = libraryId != null ? [libraryId] : [];
  // Count comic vs book items per folder so the caller can decide whether a
  // folder is relevant for the current media-type filter. An empty folder is
  // neither and gets flagged so the sidebar can hide it.
  const rows = db.prepare(
    `SELECT f.id, f.name,
            COUNT(fc.comic_id) as comic_count,
            SUM(CASE WHEN ic.media_type = 'comic' THEN 1 ELSE 0 END) as n_comic,
            SUM(CASE WHEN ic.media_type = 'book'  THEN 1 ELSE 0 END) as n_book,
            cc.cover_thumbnail
     FROM folders f
     LEFT JOIN folder_comics fc ON f.id = fc.folder_id
     LEFT JOIN comics ic ON fc.comic_id = ic.id
     LEFT JOIN comics cc ON f.cover_comic_id = cc.id
     ${where}
     GROUP BY f.id
     ORDER BY f.name COLLATE NOCASE`
  ).all(...params) as {
    id: number; name: string; comic_count: number;
    n_comic: number | null; n_book: number | null;
    cover_thumbnail: Buffer | null;
  }[];
  return rows.map((r) => {
    const nComic = r.n_comic ?? 0;
    const nBook = r.n_book ?? 0;
    const mediaType: 'comic' | 'book' | 'mixed' | 'empty' =
      r.comic_count === 0 ? 'empty'
      : nComic > 0 && nBook > 0 ? 'mixed'
      : nBook > 0 ? 'book'
      : 'comic';
    return { id: r.id, name: r.name, comicCount: r.comic_count, coverThumbnail: r.cover_thumbnail, mediaType };
  });
}

/**
 * Batched variant for the bulk ingest pipeline. Caller is already inside
 * a transaction, so this skips the wrapper. Resolves the cover_comic_id
 * once per call rather than once per row.
 */
export function addComicsToFolderRaw(db: Database.Database, folderId: number, comicIds: number[]): void {
  if (comicIds.length === 0) return;
  const stmt = db.prepare('INSERT OR IGNORE INTO folder_comics (folder_id, comic_id) VALUES (?, ?)');
  for (const id of comicIds) stmt.run(folderId, id);
  const folder = db.prepare('SELECT cover_comic_id FROM folders WHERE id = ?').get(folderId) as { cover_comic_id: number | null } | undefined;
  if (folder && folder.cover_comic_id == null) {
    db.prepare('UPDATE folders SET cover_comic_id = ? WHERE id = ?').run(comicIds[0], folderId);
  }
}

export function addComicsToFolder(db: Database.Database, folderId: number, comicIds: number[]): void {
  const stmt = db.prepare('INSERT OR IGNORE INTO folder_comics (folder_id, comic_id) VALUES (?, ?)');
  const tx = db.transaction((ids: number[]) => {
    for (const id of ids) stmt.run(folderId, id);
  });
  tx(comicIds);
  const folder = db.prepare('SELECT cover_comic_id FROM folders WHERE id = ?').get(folderId) as { cover_comic_id: number | null } | undefined;
  if (folder && folder.cover_comic_id == null && comicIds.length > 0) {
    db.prepare('UPDATE folders SET cover_comic_id = ? WHERE id = ?').run(comicIds[0], folderId);
  }
}

export function removeComicsFromFolder(db: Database.Database, folderId: number, comicIds: number[]): void {
  const stmt = db.prepare('DELETE FROM folder_comics WHERE folder_id = ? AND comic_id = ?');
  const tx = db.transaction((ids: number[]) => {
    for (const id of ids) stmt.run(folderId, id);
  });
  tx(comicIds);
}

export function getFolderComics(
  db: Database.Database,
  folderId: number,
  options: QueryOptions = {},
): QueryResult {
  const conditions: string[] = ['c.id IN (SELECT comic_id FROM folder_comics WHERE folder_id = ?)'];
  const params: SqlParam[] = [folderId];
  if (options.mediaType) {
    conditions.push('c.media_type = ?');
    params.push(options.mediaType);
  }
  if (options.search) {
    conditions.push('(c.title LIKE ? COLLATE NOCASE OR c.file_path LIKE ? COLLATE NOCASE)');
    const term = `%${options.search}%`;
    params.push(term, term);
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
  const where = `WHERE ${conditions.join(' AND ')}`;
  const sortCol = SORT_COLUMN_MAP[options.sortBy ?? 'title'] ?? SORT_COLUMN_MAP.title;
  const sortDir = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const totalCount = (db.prepare(`SELECT COUNT(*) as cnt FROM comics c ${where}`).get(...params) as CountRow).cnt;
  const rows = db.prepare(
    `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size,
            CASE WHEN c.cover_thumbnail IS NULL THEN 0 ELSE 1 END as has_thumbnail,
            COALESCE(length(c.cover_thumbnail), 0) as thumbnail_version,
            c.date_added, c.last_page, c.last_location, c.last_read, c.media_type
     FROM comics c ${where}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as ComicListRow[];
  return { records: rows.map(rowToListRecord), totalCount };
}

export function getFolderSeriesGroups(
  db: Database.Database,
  userId: number | null,
  folderId: number,
  options: FolderHierarchyOptions = {},
): FolderSeriesGroup[] {
  const scope = buildFolderHierarchyScope(folderId, options, userId);
  const rows = db.prepare(
    `SELECT
       CASE WHEN series_key = '' THEN ? ELSE series_key END as key,
       CASE WHEN series_key = '' THEN 'Unsorted' ELSE series_key END as name,
       COUNT(*) as count,
       MIN(id) as cover_id
     FROM (
       SELECT c.id, COALESCE(NULLIF(TRIM(c.series_name), ''), '') as series_key
       FROM comics c ${scope.joins}
       ${scope.where}
     ) scoped
     GROUP BY series_key COLLATE NOCASE
     ORDER BY CASE WHEN series_key = '' THEN 1 ELSE 0 END, series_key COLLATE NOCASE`,
  ).all(FOLDER_GROUP_NONE_KEY, ...scope.params) as {
    key: string; name: string; count: number; cover_id: number | null;
  }[];

  return rows.map((row) => ({
    key: row.key,
    name: row.name,
    count: row.count,
    coverComicId: row.cover_id,
  }));
}

export function getFolderVolumeGroups(
  db: Database.Database,
  userId: number | null,
  folderId: number,
  seriesKey: string,
  options: FolderHierarchyOptions = {},
): FolderVolumeGroup[] {
  const scope = buildFolderHierarchyScope(folderId, options, userId);
  const extra: string[] = [];
  const params = [...scope.params];
  addSeriesFilter(extra, params, seriesKey);

  const rows = db.prepare(
    `SELECT c.volume_number,
            COUNT(*) as count,
            COUNT(DISTINCT c.chapter_number) as chapter_count,
            MIN(c.id) as cover_id,
            CASE WHEN COUNT(*) = 1 THEN MIN(c.id) ELSE NULL END as single_comic_id
     FROM comics c ${scope.joins}
     ${scope.where} AND ${extra.join(' AND ')}
     GROUP BY c.volume_number
     ORDER BY CASE WHEN c.volume_number IS NULL THEN 1 ELSE 0 END, c.volume_number ASC`,
  ).all(...params) as {
    volume_number: number | null;
    count: number;
    chapter_count: number;
    cover_id: number | null;
    single_comic_id: number | null;
  }[];

  return rows.map((row) => ({
    key: numericGroupKey(row.volume_number),
    label: formatNumberLabel(row.volume_number, 'Unnumbered Volume', 'Volume'),
    volumeNumber: row.volume_number,
    count: row.count,
    chapterCount: row.chapter_count,
    coverComicId: row.cover_id,
    singleComicId: row.single_comic_id,
  }));
}

export function getFolderChapterGroups(
  db: Database.Database,
  userId: number | null,
  folderId: number,
  seriesKey: string,
  volumeKey: string,
  options: FolderHierarchyOptions = {},
): FolderChapterGroup[] {
  const scope = buildFolderHierarchyScope(folderId, options, userId);
  const extra: string[] = [];
  const params = [...scope.params];
  addSeriesFilter(extra, params, seriesKey);
  addNumberFilter(extra, params, 'volume_number', volumeKey);

  const rows = db.prepare(
    `SELECT c.chapter_number,
            COUNT(*) as count,
            MIN(c.id) as cover_id,
            CASE WHEN COUNT(*) = 1 THEN MIN(c.id) ELSE NULL END as single_comic_id
     FROM comics c ${scope.joins}
     ${scope.where} AND ${extra.join(' AND ')}
     GROUP BY c.chapter_number
     ORDER BY CASE WHEN c.chapter_number IS NULL THEN 1 ELSE 0 END, c.chapter_number ASC`,
  ).all(...params) as {
    chapter_number: number | null;
    count: number;
    cover_id: number | null;
    single_comic_id: number | null;
  }[];

  return rows.map((row) => ({
    key: numericGroupKey(row.chapter_number),
    label: formatNumberLabel(row.chapter_number, 'Unnumbered Chapter', 'Chapter'),
    chapterNumber: row.chapter_number,
    count: row.count,
    coverComicId: row.cover_id,
    singleComicId: row.single_comic_id,
  }));
}

export function getFolderVolumeComicsForUser(
  db: Database.Database,
  userId: number | null,
  folderId: number,
  seriesKey: string,
  volumeKey: string,
  chapterKey: string | null,
  options: FolderHierarchyOptions = {},
): { records: (MediaRecord & { favorited?: boolean })[]; totalCount: number } {
  const scope = buildFolderHierarchyScope(folderId, options, userId);
  const extra: string[] = [];
  const params = [...scope.params];
  addSeriesFilter(extra, params, seriesKey);
  addNumberFilter(extra, params, 'volume_number', volumeKey);
  if (chapterKey != null) addNumberFilter(extra, params, 'chapter_number', chapterKey);

  const where = `${scope.where} AND ${extra.join(' AND ')}`;
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const progressSelect = userId != null
    ? 'up.last_page as up_last_page, up.last_location as up_last_location, up.last_read as up_last_read'
    : 'NULL as up_last_page, NULL as up_last_location, NULL as up_last_read';
  const favSelect = userId != null
    ? 'CASE WHEN uf.comic_id IS NULL THEN 0 ELSE 1 END as is_fav'
    : '0 as is_fav';

  const totalCount = (db.prepare(
    `SELECT COUNT(*) as cnt FROM comics c ${scope.joins} ${where}`,
  ).get(...params) as CountRow).cnt;

  const rows = db.prepare(
    `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size,
            CASE WHEN c.cover_thumbnail IS NULL THEN 0 ELSE 1 END as has_thumbnail,
            COALESCE(length(c.cover_thumbnail), 0) as thumbnail_version,
            c.date_added, c.last_page, c.last_location, c.last_read, c.media_type,
            ${progressSelect}, ${favSelect}
     FROM comics c ${scope.joins}
     ${where}
     ORDER BY CASE WHEN c.chapter_number IS NULL THEN 1 ELSE 0 END,
              c.chapter_number ASC,
              c.title COLLATE NOCASE ASC
     LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset) as UserComicListRow[];

  return {
    records: rows.map((row) => applyUserState(row, rowToListRecord(row), userId)),
    totalCount,
  };
}

export function getComicFolderIds(db: Database.Database, comicId: number): number[] {
  const rows = db.prepare('SELECT folder_id FROM folder_comics WHERE comic_id = ?').all(comicId) as { folder_id: number }[];
  return rows.map((r) => r.folder_id);
}

// ---------------------------------------------------------------------------
// Global (library-wide) hierarchy — same structure as the folder hierarchy
// but not scoped to a specific folder. Used by the search/browse view.
// ---------------------------------------------------------------------------

export function getGlobalSeriesGroups(
  db: Database.Database,
  userId: number | null,
  options: FolderHierarchyOptions = {},
): FolderSeriesGroup[] {
  const scope = buildHierarchyScope(null, options, userId);
  const rows = db.prepare(
    `SELECT
       CASE WHEN series_key = '' THEN ? ELSE series_key END as key,
       CASE WHEN series_key = '' THEN 'Unsorted' ELSE series_key END as name,
       COUNT(*) as count,
       MIN(id) as cover_id
     FROM (
       SELECT c.id, COALESCE(NULLIF(TRIM(c.series_name), ''), '') as series_key
       FROM comics c ${scope.joins}
       ${scope.where}
     ) scoped
     GROUP BY series_key COLLATE NOCASE
     ORDER BY CASE WHEN series_key = '' THEN 1 ELSE 0 END, series_key COLLATE NOCASE`,
  ).all(FOLDER_GROUP_NONE_KEY, ...scope.params) as {
    key: string; name: string; count: number; cover_id: number | null;
  }[];

  return rows.map((row) => ({
    key: row.key,
    name: row.name,
    count: row.count,
    coverComicId: row.cover_id,
  }));
}

export function getGlobalVolumeGroups(
  db: Database.Database,
  userId: number | null,
  seriesKey: string,
  options: FolderHierarchyOptions = {},
): FolderVolumeGroup[] {
  const scope = buildHierarchyScope(null, options, userId);
  const extra: string[] = [];
  const params = [...scope.params];
  addSeriesFilter(extra, params, seriesKey);

  const rows = db.prepare(
    `SELECT c.volume_number,
            COUNT(*) as count,
            COUNT(DISTINCT c.chapter_number) as chapter_count,
            MIN(c.id) as cover_id,
            CASE WHEN COUNT(*) = 1 THEN MIN(c.id) ELSE NULL END as single_comic_id
     FROM comics c ${scope.joins}
     ${scope.where} AND ${extra.join(' AND ')}
     GROUP BY c.volume_number
     ORDER BY CASE WHEN c.volume_number IS NULL THEN 1 ELSE 0 END, c.volume_number ASC`,
  ).all(...params) as {
    volume_number: number | null;
    count: number;
    chapter_count: number;
    cover_id: number | null;
    single_comic_id: number | null;
  }[];

  return rows.map((row) => ({
    key: numericGroupKey(row.volume_number),
    label: formatNumberLabel(row.volume_number, 'Unnumbered Volume', 'Volume'),
    volumeNumber: row.volume_number,
    count: row.count,
    chapterCount: row.chapter_count,
    coverComicId: row.cover_id,
    singleComicId: row.single_comic_id,
  }));
}

export function getGlobalChapterGroups(
  db: Database.Database,
  userId: number | null,
  seriesKey: string,
  volumeKey: string,
  options: FolderHierarchyOptions = {},
): FolderChapterGroup[] {
  const scope = buildHierarchyScope(null, options, userId);
  const extra: string[] = [];
  const params = [...scope.params];
  addSeriesFilter(extra, params, seriesKey);
  addNumberFilter(extra, params, 'volume_number', volumeKey);

  const rows = db.prepare(
    `SELECT c.chapter_number,
            COUNT(*) as count,
            MIN(c.id) as cover_id,
            CASE WHEN COUNT(*) = 1 THEN MIN(c.id) ELSE NULL END as single_comic_id
     FROM comics c ${scope.joins}
     ${scope.where} AND ${extra.join(' AND ')}
     GROUP BY c.chapter_number
     ORDER BY CASE WHEN c.chapter_number IS NULL THEN 1 ELSE 0 END, c.chapter_number ASC`,
  ).all(...params) as {
    chapter_number: number | null;
    count: number;
    cover_id: number | null;
    single_comic_id: number | null;
  }[];

  return rows.map((row) => ({
    key: numericGroupKey(row.chapter_number),
    label: formatNumberLabel(row.chapter_number, 'Unnumbered Chapter', 'Chapter'),
    chapterNumber: row.chapter_number,
    count: row.count,
    coverComicId: row.cover_id,
    singleComicId: row.single_comic_id,
  }));
}

export function getGlobalVolumeComicsForUser(
  db: Database.Database,
  userId: number | null,
  seriesKey: string,
  volumeKey: string,
  chapterKey: string | null,
  options: FolderHierarchyOptions = {},
): { records: (MediaRecord & { favorited?: boolean })[]; totalCount: number } {
  const scope = buildHierarchyScope(null, options, userId);
  const extra: string[] = [];
  const params = [...scope.params];
  addSeriesFilter(extra, params, seriesKey);
  addNumberFilter(extra, params, 'volume_number', volumeKey);
  if (chapterKey != null) addNumberFilter(extra, params, 'chapter_number', chapterKey);

  const where = `${scope.where} AND ${extra.join(' AND ')}`;
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const progressSelect = userId != null
    ? 'up.last_page as up_last_page, up.last_location as up_last_location, up.last_read as up_last_read'
    : 'NULL as up_last_page, NULL as up_last_location, NULL as up_last_read';
  const favSelect = userId != null
    ? 'CASE WHEN uf.comic_id IS NULL THEN 0 ELSE 1 END as is_fav'
    : '0 as is_fav';

  const totalCount = (db.prepare(
    `SELECT COUNT(*) as cnt FROM comics c ${scope.joins} ${where}`,
  ).get(...params) as CountRow).cnt;

  const rows = db.prepare(
    `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size,
            CASE WHEN c.cover_thumbnail IS NULL THEN 0 ELSE 1 END as has_thumbnail,
            COALESCE(length(c.cover_thumbnail), 0) as thumbnail_version,
            c.date_added, c.last_page, c.last_location, c.last_read, c.media_type,
            ${progressSelect}, ${favSelect}
     FROM comics c ${scope.joins}
     ${where}
     ORDER BY CASE WHEN c.chapter_number IS NULL THEN 1 ELSE 0 END,
              c.chapter_number ASC,
              c.title COLLATE NOCASE ASC
     LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset) as UserComicListRow[];

  return {
    records: rows.map((row) => applyUserState(row, rowToListRecord(row), userId)),
    totalCount,
  };
}
