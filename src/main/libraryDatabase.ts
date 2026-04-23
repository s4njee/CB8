import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import { generateThumbnail } from './thumbnailGenerator';
import type { ComicRecord, QueryOptions, QueryResult } from '../shared/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS comics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  page_count INTEGER NOT NULL,
  file_size INTEGER NOT NULL,
  cover_thumbnail BLOB,
  date_added TEXT NOT NULL DEFAULT (datetime('now')),
  last_page INTEGER,
  last_location TEXT,
  last_read TEXT,
  media_type TEXT NOT NULL DEFAULT 'comic',
  series_name TEXT,
  volume_number REAL,
  chapter_number REAL,
  completed INTEGER NOT NULL DEFAULT 0,
  author TEXT,
  artist TEXT,
  genre TEXT,
  year INTEGER,
  summary TEXT,
  external_id TEXT,
  external_source TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  last_page INTEGER,
  last_location TEXT,
  last_read TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, comic_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reading_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  page INTEGER,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, comic_id)
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS comic_tags (
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (comic_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_comics_file_path ON comics(file_path);
CREATE INDEX IF NOT EXISTS idx_comics_title ON comics(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_comics_date_added ON comics(date_added);
CREATE INDEX IF NOT EXISTS idx_comics_file_size ON comics(file_size);
CREATE INDEX IF NOT EXISTS idx_comics_page_count ON comics(page_count);
CREATE INDEX IF NOT EXISTS idx_comics_series ON comics(series_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_comics_last_read ON comics(last_read);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_comic ON bookmarks(user_id, comic_id);
CREATE INDEX IF NOT EXISTS idx_history_user ON reading_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON reading_history(timestamp);

CREATE TABLE IF NOT EXISTS libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  date_created TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS library_comics (
  library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  PRIMARY KEY (library_id, comic_id)
);

CREATE INDEX IF NOT EXISTS idx_library_comics_library ON library_comics(library_id);
CREATE INDEX IF NOT EXISTS idx_library_comics_comic ON library_comics(comic_id);

CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cover_comic_id INTEGER REFERENCES comics(id) ON DELETE SET NULL,
  date_created TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS folder_comics (
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  PRIMARY KEY (folder_id, comic_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_comics_folder ON folder_comics(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_comics_comic ON folder_comics(comic_id);

CREATE TABLE IF NOT EXISTS library_folders (
  library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  PRIMARY KEY (library_id, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_library_folders_library ON library_folders(library_id);
CREATE INDEX IF NOT EXISTS idx_library_folders_folder ON library_folders(folder_id);
`;

const SORT_COLUMN_MAP: Record<string, string> = {
  title: 'c.title COLLATE NOCASE',
  dateAdded: 'c.date_added',
  fileSize: 'c.file_size',
  pageCount: 'c.page_count',
  lastRead: "COALESCE(c.last_read, '')",
};

type SqlParam = string | number | bigint | Buffer | null;

interface ComicRow {
  id: number;
  file_path: string;
  title: string;
  page_count: number;
  file_size: number;
  cover_thumbnail: Buffer | null;
  date_added: string;
  last_page: number | null;
  last_location: string | null;
  last_read: string | null;
  media_type: string;
}

interface CountRow {
  cnt: number;
}

interface TagIdRow {
  id: number;
}

interface TagNameRow {
  name: string;
}

interface LibraryRow {
  id: number;
  name: string;
  comic_count: number;
  media_type: string;
}

export class LibraryDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = this.openOrRecreate(dbPath);
  }

  private openOrRecreate(dbPath: string): Database.Database {
    try {
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      db.exec(SCHEMA);
      this.migrateSchema(db);
      return db;
    } catch {
      console.warn(`Database corrupted or unreadable at ${dbPath}, recreating.`);
      try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      db.exec(SCHEMA);
      this.migrateSchema(db);
      return db;
    }
  }

  private migrateSchema(db: Database.Database): void {
    const comicColumns = db.prepare('PRAGMA table_info(comics)').all() as { name: string }[];
    if (!comicColumns.some((c) => c.name === 'last_page')) {
      db.prepare('ALTER TABLE comics ADD COLUMN last_page INTEGER DEFAULT NULL').run();
    }
    if (!comicColumns.some((c) => c.name === 'last_location')) {
      db.prepare('ALTER TABLE comics ADD COLUMN last_location TEXT DEFAULT NULL').run();
    }
    if (!comicColumns.some((c) => c.name === 'last_read')) {
      db.prepare('ALTER TABLE comics ADD COLUMN last_read TEXT DEFAULT NULL').run();
    }
    if (!comicColumns.some((c) => c.name === 'media_type')) {
      db.prepare("ALTER TABLE comics ADD COLUMN media_type TEXT NOT NULL DEFAULT 'comic'").run();
    }

    const folderColumns = db.prepare('PRAGMA table_info(folders)').all() as { name: string }[];
    const hasCoverComicId = folderColumns.some((column) => column.name === 'cover_comic_id');
    if (!hasCoverComicId) {
      db.prepare('ALTER TABLE folders ADD COLUMN cover_comic_id INTEGER REFERENCES comics(id) ON DELETE SET NULL').run();
    }

    this.repairExistingThumbnails(db);

    // Add media_type column to libraries
    const libColumns = db.prepare('PRAGMA table_info(libraries)').all() as { name: string }[];
    if (!libColumns.some((c) => c.name === 'media_type')) {
      db.prepare("ALTER TABLE libraries ADD COLUMN media_type TEXT NOT NULL DEFAULT 'comic'").run();
    }

    // Series / metadata columns
    const addCol = (col: string, ddl: string) => {
      if (!comicColumns.some((c) => c.name === col)) {
        db.prepare(`ALTER TABLE comics ADD COLUMN ${ddl}`).run();
      }
    };
    addCol('series_name', 'series_name TEXT');
    addCol('volume_number', 'volume_number REAL');
    addCol('chapter_number', 'chapter_number REAL');
    addCol('completed', 'completed INTEGER NOT NULL DEFAULT 0');
    addCol('author', 'author TEXT');
    addCol('artist', 'artist TEXT');
    addCol('genre', 'genre TEXT');
    addCol('year', 'year INTEGER');
    addCol('summary', 'summary TEXT');
    addCol('external_id', 'external_id TEXT');
    addCol('external_source', 'external_source TEXT');
  }

  private repairExistingThumbnails(db: Database.Database): void {
    const repairKey = 'thumbnail_repair_v1';
    const completed = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(repairKey) as { value: string } | undefined;
    if (completed?.value === 'complete') return;

    try {
      const rows = db.prepare('SELECT id, cover_thumbnail FROM comics').all() as { id: number; cover_thumbnail: Buffer | null }[];
      if (rows.length > 0) {
        const update = db.prepare('UPDATE comics SET cover_thumbnail = ? WHERE id = ?');
        const tx = db.transaction((items: { id: number; cover_thumbnail: Buffer | null }[]) => {
          for (const row of items) {
            update.run(generateThumbnail(row.cover_thumbnail), row.id);
          }
        });
        tx(rows);
      }

      db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(repairKey, 'complete');
    } catch (err) {
      console.warn('Failed to repair existing thumbnails; will retry on next startup.', err);
    }
  }

  initialize(): void {
    // Schema already created in constructor; this is a no-op hook for callers.
  }

  getAppMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setAppMeta(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(key, value);
  }


  addComic(record: Omit<ComicRecord, 'id' | 'dateAdded'>): ComicRecord {
    const stmt = this.db.prepare(
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
        this.addTag(id, tag);
      }
    }

    return this.getComic(id)!;
  }

  removeComics(ids: number[]): void {
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(`DELETE FROM comics WHERE id IN (${placeholders})`).run(...ids);
  }

  getComic(id: number): ComicRecord | null {
    const row = this.db.prepare(
      `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type
       FROM comics WHERE id = ?`
    ).get(id) as ComicRow | undefined;
    if (!row) return null;
    return this.rowToRecord(row);
  }

  comicExistsByPath(filePath: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM comics WHERE file_path = ?').get(filePath);
    return row !== undefined;
  }

  updateCoverThumbnailByPath(filePath: string, coverThumbnail: Buffer | null): void {
    this.db.prepare('UPDATE comics SET cover_thumbnail = ? WHERE file_path = ?').run(coverThumbnail, filePath);
  }

  updatePageCountByPath(filePath: string, pageCount: number): void {
    this.db.prepare('UPDATE comics SET page_count = ? WHERE file_path = ?').run(pageCount, filePath);
  }

  queryComics(options: QueryOptions = {}): QueryResult {
    const conditions: string[] = [];
    const params: SqlParam[] = [];

    if (options.mediaType) {
      conditions.push('c.media_type = ?');
      params.push(options.mediaType);
    }

    if (options.search) {
      conditions.push('(c.title LIKE ? COLLATE NOCASE OR c.file_path LIKE ? COLLATE NOCASE)');
      const term = `%${options.search}%`;
      params.push(term, term);
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

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortCol = SORT_COLUMN_MAP[options.sortBy ?? 'title'] ?? SORT_COLUMN_MAP.title;
    const sortDir = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const totalCount = (this.db.prepare(
      `SELECT COUNT(*) as cnt FROM comics c ${where}`
    ).get(...params) as CountRow).cnt;

    const rows = this.db.prepare(
      `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail, c.date_added, c.last_page, c.last_location, c.last_read, c.media_type
       FROM comics c ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as ComicRow[];

    return {
      records: rows.map((r) => this.rowToRecord(r)),
      totalCount,
    };
  }

  addTag(comicId: number, tag: string): void {
    this.db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tag);
    const tagRow = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as TagIdRow;
    this.db.prepare('INSERT OR IGNORE INTO comic_tags (comic_id, tag_id) VALUES (?, ?)').run(comicId, tagRow.id);
  }

  removeTag(comicId: number, tag: string): void {
    const tagRow = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as TagIdRow | undefined;
    if (!tagRow) return;
    this.db.prepare('DELETE FROM comic_tags WHERE comic_id = ? AND tag_id = ?').run(comicId, tagRow.id);
  }

  getAllTags(): string[] {
    const rows = this.db.prepare('SELECT name FROM tags ORDER BY name COLLATE NOCASE').all() as TagNameRow[];
    return rows.map((r) => r.name);
  }

  renameTag(oldName: string, newName: string): void {
    this.db.prepare('UPDATE tags SET name = ? WHERE name = ?').run(newName, oldName);
  }

  deleteTag(tag: string): void {
    const tagRow = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as TagIdRow | undefined;
    if (!tagRow) return;
    this.db.prepare('DELETE FROM comic_tags WHERE tag_id = ?').run(tagRow.id);
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(tagRow.id);
  }

  addTagBulk(comicIds: number[], tag: string): void {
    this.db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tag);
    const tagRow = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as TagIdRow;
    const stmt = this.db.prepare('INSERT OR IGNORE INTO comic_tags (comic_id, tag_id) VALUES (?, ?)');
    const tx = this.db.transaction((ids: number[]) => {
      for (const id of ids) stmt.run(id, tagRow.id);
    });
    tx(comicIds);
  }

  removeTagBulk(comicIds: number[], tag: string): void {
    const tagRow = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as TagIdRow | undefined;
    if (!tagRow) return;
    const stmt = this.db.prepare('DELETE FROM comic_tags WHERE comic_id = ? AND tag_id = ?');
    const tx = this.db.transaction((ids: number[]) => {
      for (const id of ids) stmt.run(id, tagRow.id);
    });
    tx(comicIds);
  }

  // --- Library (collection) operations ---

  createLibrary(name: string, mediaType: 'comic' | 'book' = 'comic'): { id: number; name: string; mediaType: 'comic' | 'book' } {
    const info = this.db.prepare('INSERT INTO libraries (name, media_type) VALUES (?, ?)').run(name, mediaType);
    return { id: info.lastInsertRowid as number, name, mediaType };
  }

  renameLibrary(id: number, newName: string): void {
    this.db.prepare('UPDATE libraries SET name = ? WHERE id = ?').run(newName, id);
  }

  deleteLibrary(id: number): void {
    this.db.prepare('DELETE FROM libraries WHERE id = ?').run(id);
  }

  getAllLibraries(mediaType?: 'comic' | 'book'): { id: number; name: string; comicCount: number; mediaType: 'comic' | 'book' }[] {
    const where = mediaType ? 'WHERE l.media_type = ?' : '';
    const params = mediaType ? [mediaType] : [];
    const rows = this.db.prepare(
      `SELECT l.id, l.name, l.media_type, COUNT(lc.comic_id) as comic_count
       FROM libraries l
       LEFT JOIN library_comics lc ON l.id = lc.library_id
       ${where}
       GROUP BY l.id
       ORDER BY l.name COLLATE NOCASE`
    ).all(...params) as LibraryRow[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      comicCount: r.comic_count,
      mediaType: (r.media_type === 'book' ? 'book' : 'comic') as 'comic' | 'book',
    }));
  }

  addComicsToLibrary(libraryId: number, comicIds: number[]): void {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO library_comics (library_id, comic_id) VALUES (?, ?)');
    const removeExisting = this.db.prepare('DELETE FROM library_comics WHERE comic_id = ?');
    const tx = this.db.transaction((ids: number[]) => {
      for (const id of ids) {
        removeExisting.run(id);
        stmt.run(libraryId, id);
      }
    });
    tx(comicIds);
  }

  removeComicsFromLibrary(libraryId: number, comicIds: number[]): void {
    const stmt = this.db.prepare('DELETE FROM library_comics WHERE library_id = ? AND comic_id = ?');
    const tx = this.db.transaction((ids: number[]) => {
      for (const id of ids) stmt.run(libraryId, id);
    });
    tx(comicIds);
  }

  addFoldersToLibrary(libraryId: number, folderIds: number[]): void {
    const folderComicRows = this.db.prepare('SELECT comic_id FROM folder_comics WHERE folder_id = ?');
    const insertComic = this.db.prepare('INSERT OR IGNORE INTO library_comics (library_id, comic_id) VALUES (?, ?)');
    const removeExisting = this.db.prepare('DELETE FROM library_comics WHERE comic_id = ?');
    const tx = this.db.transaction((ids: number[]) => {
      for (const folderId of ids) {
        const rows = folderComicRows.all(folderId) as { comic_id: number }[];
        for (const row of rows) {
          removeExisting.run(row.comic_id);
          insertComic.run(libraryId, row.comic_id);
        }
      }
    });
    tx(folderIds);
  }

  queryComicsByLibrary(libraryId: number, options: QueryOptions = {}): QueryResult {
    const conditions: string[] = ['c.id IN (SELECT comic_id FROM library_comics WHERE library_id = ?)'];
    const params: SqlParam[] = [libraryId];

    if (options.mediaType) {
      conditions.push('c.media_type = ?');
      params.push(options.mediaType);
    }

    if (options.search) {
      conditions.push('(c.title LIKE ? COLLATE NOCASE OR c.file_path LIKE ? COLLATE NOCASE)');
      const term = `%${options.search}%`;
      params.push(term, term);
    }

    if (options.excludeFoldered) {
      conditions.push('c.id NOT IN (SELECT comic_id FROM folder_comics)');
    }

    if (options.fileExt) {
      conditions.push('LOWER(c.file_path) LIKE ?');
      params.push('%.' + options.fileExt.toLowerCase());
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const sortCol = SORT_COLUMN_MAP[options.sortBy ?? 'title'] ?? SORT_COLUMN_MAP.title;
    const sortDir = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const totalCount = (this.db.prepare(
      `SELECT COUNT(*) as cnt FROM comics c ${where}`
    ).get(...params) as CountRow).cnt;

    const rows = this.db.prepare(
      `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail, c.date_added, c.last_page, c.last_location, c.last_read, c.media_type
       FROM comics c ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as ComicRow[];

    return {
      records: rows.map((r) => this.rowToRecord(r)),
      totalCount,
    };
  }

  private rowToRecord(row: ComicRow): ComicRecord {
    const tags = this.db.prepare(
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
    };
  }

  // --- Reading progress ---

  updateReadingProgress(comicId: number, pageIndex: number): void {
    this.db.prepare(
      `UPDATE comics SET last_page = ?, last_read = datetime('now') WHERE id = ?`
    ).run(pageIndex, comicId);
  }

  updateReadingLocation(comicId: number, location: string): void {
    this.db.prepare(
      `UPDATE comics SET last_location = ?, last_read = datetime('now') WHERE id = ?`
    ).run(location, comicId);
  }

  getRecentlyRead(limit: number = 10, mediaType?: 'comic' | 'book'): ComicRecord[] {
    const rows = mediaType
      ? this.db.prepare(
          `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type
           FROM comics WHERE last_read IS NOT NULL AND media_type = ?
           ORDER BY last_read DESC LIMIT ?`
        ).all(mediaType, limit) as ComicRow[]
      : this.db.prepare(
          `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type
           FROM comics WHERE last_read IS NOT NULL
           ORDER BY last_read DESC LIMIT ?`
        ).all(limit) as ComicRow[];
    return rows.map((r) => this.rowToRecord(r));
  }

  getComicByPath(filePath: string): ComicRecord | null {
    const row = this.db.prepare(
      `SELECT id, file_path, title, page_count, file_size, cover_thumbnail, date_added, last_page, last_location, last_read, media_type
       FROM comics WHERE file_path = ?`
    ).get(filePath) as ComicRow | undefined;
    if (!row) return null;
    return this.rowToRecord(row);
  }

  // --- Folder (grouping) operations ---

  createFolder(name: string, comicIds: number[]): { id: number; name: string } {
    const coverId = comicIds.length > 0 ? comicIds[0] : null;
    const info = this.db.prepare('INSERT INTO folders (name, cover_comic_id) VALUES (?, ?)').run(name, coverId);
    const folderId = info.lastInsertRowid as number;
    if (comicIds.length > 0) {
      const stmt = this.db.prepare('INSERT OR IGNORE INTO folder_comics (folder_id, comic_id) VALUES (?, ?)');
      const tx = this.db.transaction((ids: number[]) => {
        for (const id of ids) stmt.run(folderId, id);
      });
      tx(comicIds);
    }
    return { id: folderId, name };
  }

  renameFolder(id: number, newName: string): void {
    this.db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(newName, id);
  }

  deleteFolder(id: number): void {
    this.db.prepare('DELETE FROM folders WHERE id = ?').run(id);
  }

  getAllFolders(libraryId?: number | null): { id: number; name: string; comicCount: number; coverThumbnail: Buffer | null }[] {
    const where = libraryId != null
      ? 'WHERE f.id IN (SELECT folder_id FROM library_folders WHERE library_id = ?)'
      : '';
    const params = libraryId != null ? [libraryId] : [];
    const rows = this.db.prepare(
      `SELECT f.id, f.name, COUNT(fc.comic_id) as comic_count, c.cover_thumbnail
       FROM folders f
       LEFT JOIN folder_comics fc ON f.id = fc.folder_id
       LEFT JOIN comics c ON f.cover_comic_id = c.id
       ${where}
       GROUP BY f.id
       ORDER BY f.name COLLATE NOCASE`
    ).all(...params) as { id: number; name: string; comic_count: number; cover_thumbnail: Buffer | null }[];
    return rows.map((r) => ({ id: r.id, name: r.name, comicCount: r.comic_count, coverThumbnail: r.cover_thumbnail }));
  }

  addComicsToFolder(folderId: number, comicIds: number[]): void {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO folder_comics (folder_id, comic_id) VALUES (?, ?)');
    const tx = this.db.transaction((ids: number[]) => {
      for (const id of ids) stmt.run(folderId, id);
    });
    tx(comicIds);
    // Update cover if folder had none
    const folder = this.db.prepare('SELECT cover_comic_id FROM folders WHERE id = ?').get(folderId) as { cover_comic_id: number | null } | undefined;
    if (folder && folder.cover_comic_id == null && comicIds.length > 0) {
      this.db.prepare('UPDATE folders SET cover_comic_id = ? WHERE id = ?').run(comicIds[0], folderId);
    }
  }

  removeComicsFromFolder(folderId: number, comicIds: number[]): void {
    const stmt = this.db.prepare('DELETE FROM folder_comics WHERE folder_id = ? AND comic_id = ?');
    const tx = this.db.transaction((ids: number[]) => {
      for (const id of ids) stmt.run(folderId, id);
    });
    tx(comicIds);
  }

  getFolderComics(folderId: number, options: QueryOptions = {}): QueryResult {
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
    const where = `WHERE ${conditions.join(' AND ')}`;
    const sortCol = SORT_COLUMN_MAP[options.sortBy ?? 'title'] ?? SORT_COLUMN_MAP.title;
    const sortDir = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const totalCount = (this.db.prepare(`SELECT COUNT(*) as cnt FROM comics c ${where}`).get(...params) as CountRow).cnt;
    const rows = this.db.prepare(
      `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail, c.date_added, c.last_page, c.last_location, c.last_read, c.media_type FROM comics c ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as ComicRow[];
    return { records: rows.map((r) => this.rowToRecord(r)), totalCount };
  }

  getComicFolderIds(comicId: number): number[] {
    const rows = this.db.prepare('SELECT folder_id FROM folder_comics WHERE comic_id = ?').all(comicId) as { folder_id: number }[];
    return rows.map((r) => r.folder_id);
  }

  // --- User management ---

  createUser(username: string, passwordHash: string, isAdmin: boolean): { id: number; username: string; isAdmin: boolean } {
    const info = this.db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)').run(username, passwordHash, isAdmin ? 1 : 0);
    return { id: info.lastInsertRowid as number, username, isAdmin };
  }

  getUserByUsername(username: string): { id: number; username: string; passwordHash: string; isAdmin: boolean; createdAt: string } | null {
    const row = this.db.prepare('SELECT id, username, password_hash, is_admin, created_at FROM users WHERE username = ? COLLATE NOCASE').get(username) as { id: number; username: string; password_hash: string; is_admin: number; created_at: string } | undefined;
    if (!row) return null;
    return { id: row.id, username: row.username, passwordHash: row.password_hash, isAdmin: !!row.is_admin, createdAt: row.created_at };
  }

  getUserById(id: number): { id: number; username: string; isAdmin: boolean; createdAt: string } | null {
    const row = this.db.prepare('SELECT id, username, is_admin, created_at FROM users WHERE id = ?').get(id) as { id: number; username: string; is_admin: number; created_at: string } | undefined;
    if (!row) return null;
    return { id: row.id, username: row.username, isAdmin: !!row.is_admin, createdAt: row.created_at };
  }

  listUsers(): { id: number; username: string; isAdmin: boolean; createdAt: string }[] {
    const rows = this.db.prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY username COLLATE NOCASE').all() as { id: number; username: string; is_admin: number; created_at: string }[];
    return rows.map((r) => ({ id: r.id, username: r.username, isAdmin: !!r.is_admin, createdAt: r.created_at }));
  }

  countAdmins(): number {
    return (this.db.prepare('SELECT COUNT(*) as cnt FROM users WHERE is_admin = 1').get() as CountRow).cnt;
  }

  countUsers(): number {
    return (this.db.prepare('SELECT COUNT(*) as cnt FROM users').get() as CountRow).cnt;
  }

  deleteUser(id: number): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  setUserAdmin(id: number, isAdmin: boolean): void {
    this.db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, id);
  }

  // --- Per-user progress ---

  upsertUserProgress(userId: number, comicId: number, opts: { page?: number | null; location?: string | null; completed?: boolean }): void {
    const existing = this.db.prepare('SELECT user_id FROM user_progress WHERE user_id = ? AND comic_id = ?').get(userId, comicId);
    if (existing) {
      const parts: string[] = [];
      const vals: SqlParam[] = [];
      if (opts.page !== undefined) { parts.push('last_page = ?'); vals.push(opts.page); }
      if (opts.location !== undefined) { parts.push('last_location = ?'); vals.push(opts.location); }
      if (opts.completed !== undefined) { parts.push('completed = ?'); vals.push(opts.completed ? 1 : 0); }
      parts.push("last_read = datetime('now')");
      vals.push(userId, comicId);
      this.db.prepare(`UPDATE user_progress SET ${parts.join(', ')} WHERE user_id = ? AND comic_id = ?`).run(...vals);
    } else {
      this.db.prepare(
        `INSERT INTO user_progress (user_id, comic_id, last_page, last_location, last_read, completed)
         VALUES (?, ?, ?, ?, datetime('now'), ?)`
      ).run(userId, comicId, opts.page ?? null, opts.location ?? null, opts.completed ? 1 : 0);
    }
  }

  clearUserProgress(userId: number, comicId: number): void {
    this.db.prepare('DELETE FROM user_progress WHERE user_id = ? AND comic_id = ?').run(userId, comicId);
  }

  getUserProgress(userId: number, comicId: number): { lastPage: number | null; lastLocation: string | null; lastRead: string | null; completed: boolean } | null {
    const row = this.db.prepare('SELECT last_page, last_location, last_read, completed FROM user_progress WHERE user_id = ? AND comic_id = ?').get(userId, comicId) as { last_page: number | null; last_location: string | null; last_read: string | null; completed: number } | undefined;
    if (!row) return null;
    return { lastPage: row.last_page, lastLocation: row.last_location, lastRead: row.last_read, completed: !!row.completed };
  }

  getRecentlyReadByUser(userId: number, limit: number, mediaType?: 'comic' | 'book'): ComicRecord[] {
    const where = mediaType ? 'AND c.media_type = ?' : '';
    const params: SqlParam[] = [userId];
    if (mediaType) params.push(mediaType);
    params.push(limit);
    const rows = this.db.prepare(
      `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail, c.date_added,
              up.last_page, up.last_location, up.last_read, c.media_type
       FROM user_progress up
       JOIN comics c ON up.comic_id = c.id
       WHERE up.user_id = ? ${where}
       ORDER BY up.last_read DESC
       LIMIT ?`
    ).all(...params) as ComicRow[];
    return rows.map((r) => this.rowToRecord(r));
  }

  // --- Bookmarks ---

  createBookmark(userId: number, comicId: number, page: number, note: string | null = null): { id: number; userId: number; comicId: number; page: number; note: string | null; createdAt: string } {
    const info = this.db.prepare('INSERT INTO bookmarks (user_id, comic_id, page, note) VALUES (?, ?, ?, ?)').run(userId, comicId, page, note);
    const id = info.lastInsertRowid as number;
    const row = this.db.prepare('SELECT id, user_id, comic_id, page, note, created_at FROM bookmarks WHERE id = ?').get(id) as { id: number; user_id: number; comic_id: number; page: number; note: string | null; created_at: string };
    return { id: row.id, userId: row.user_id, comicId: row.comic_id, page: row.page, note: row.note, createdAt: row.created_at };
  }

  listBookmarks(userId: number, comicId: number): { id: number; page: number; note: string | null; createdAt: string }[] {
    const rows = this.db.prepare('SELECT id, page, note, created_at FROM bookmarks WHERE user_id = ? AND comic_id = ? ORDER BY page, id').all(userId, comicId) as { id: number; page: number; note: string | null; created_at: string }[];
    return rows.map((r) => ({ id: r.id, page: r.page, note: r.note, createdAt: r.created_at }));
  }

  updateBookmark(userId: number, bookmarkId: number, note: string | null): void {
    this.db.prepare('UPDATE bookmarks SET note = ? WHERE id = ? AND user_id = ?').run(note, bookmarkId, userId);
  }

  deleteBookmark(userId: number, bookmarkId: number): void {
    this.db.prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?').run(bookmarkId, userId);
  }

  // --- Reading history ---

  logHistory(userId: number, comicId: number, action: string, page: number | null): void {
    this.db.prepare('INSERT INTO reading_history (user_id, comic_id, action, page) VALUES (?, ?, ?, ?)').run(userId, comicId, action, page);
  }

  getHistory(userId: number, offset: number, limit: number): { entries: { id: number; comicId: number; comicTitle: string; action: string; page: number | null; timestamp: string }[]; totalCount: number } {
    const totalCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM reading_history WHERE user_id = ?').get(userId) as CountRow).cnt;
    const rows = this.db.prepare(
      `SELECT h.id, h.comic_id, c.title as comic_title, h.action, h.page, h.timestamp
       FROM reading_history h
       LEFT JOIN comics c ON h.comic_id = c.id
       WHERE h.user_id = ?
       ORDER BY h.timestamp DESC
       LIMIT ? OFFSET ?`
    ).all(userId, limit, offset) as { id: number; comic_id: number; comic_title: string | null; action: string; page: number | null; timestamp: string }[];
    return {
      entries: rows.map((r) => ({
        id: r.id, comicId: r.comic_id, comicTitle: r.comic_title ?? '(deleted)',
        action: r.action, page: r.page, timestamp: r.timestamp,
      })),
      totalCount,
    };
  }

  // --- Favorites ---

  addFavorite(userId: number, comicId: number): void {
    this.db.prepare('INSERT OR IGNORE INTO user_favorites (user_id, comic_id) VALUES (?, ?)').run(userId, comicId);
  }

  removeFavorite(userId: number, comicId: number): void {
    this.db.prepare('DELETE FROM user_favorites WHERE user_id = ? AND comic_id = ?').run(userId, comicId);
  }

  isFavorite(userId: number, comicId: number): boolean {
    return this.db.prepare('SELECT 1 FROM user_favorites WHERE user_id = ? AND comic_id = ?').get(userId, comicId) !== undefined;
  }

  // --- Series ---

  setComicSeries(comicId: number, seriesName: string | null, volumeNumber: number | null, chapterNumber: number | null): void {
    this.db.prepare('UPDATE comics SET series_name = ?, volume_number = ?, chapter_number = ? WHERE id = ?').run(seriesName, volumeNumber, chapterNumber, comicId);
  }

  getAllSeries(): { name: string; count: number; coverComicId: number | null }[] {
    const rows = this.db.prepare(
      `SELECT series_name as name, COUNT(*) as count,
        (SELECT id FROM comics WHERE series_name = c.series_name ORDER BY COALESCE(volume_number, 999999), COALESCE(chapter_number, 999999), id LIMIT 1) as cover_id
       FROM comics c
       WHERE series_name IS NOT NULL AND series_name != ''
       GROUP BY series_name COLLATE NOCASE
       ORDER BY series_name COLLATE NOCASE`
    ).all() as { name: string; count: number; cover_id: number | null }[];
    return rows.map((r) => ({ name: r.name, count: r.count, coverComicId: r.cover_id }));
  }

  getSeriesComics(name: string): ComicRecord[] {
    const rows = this.db.prepare(
      `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail, c.date_added, c.last_page, c.last_location, c.last_read, c.media_type
       FROM comics c
       WHERE c.series_name = ? COLLATE NOCASE
       ORDER BY COALESCE(c.volume_number, 999999), COALESCE(c.chapter_number, 999999), c.title COLLATE NOCASE`
    ).all(name) as ComicRow[];
    return rows.map((r) => this.rowToRecord(r));
  }

  // --- Metadata ---

  updateComicMetadata(comicId: number, fields: { title?: string; author?: string | null; artist?: string | null; genre?: string | null; year?: number | null; summary?: string | null; externalId?: string | null; externalSource?: string | null; seriesName?: string | null; volumeNumber?: number | null; chapterNumber?: number | null }): void {
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
    this.db.prepare(`UPDATE comics SET ${parts.join(', ')} WHERE id = ?`).run(...vals);
  }

  getComicMetadata(id: number): { author: string | null; artist: string | null; genre: string | null; year: number | null; summary: string | null; externalId: string | null; externalSource: string | null; seriesName: string | null; volumeNumber: number | null; chapterNumber: number | null } | null {
    const row = this.db.prepare('SELECT author, artist, genre, year, summary, external_id, external_source, series_name, volume_number, chapter_number FROM comics WHERE id = ?').get(id) as { author: string | null; artist: string | null; genre: string | null; year: number | null; summary: string | null; external_id: string | null; external_source: string | null; series_name: string | null; volume_number: number | null; chapter_number: number | null } | undefined;
    if (!row) return null;
    return { author: row.author, artist: row.artist, genre: row.genre, year: row.year, summary: row.summary, externalId: row.external_id, externalSource: row.external_source, seriesName: row.series_name, volumeNumber: row.volume_number, chapterNumber: row.chapter_number };
  }

  // --- Query with user scope (progress + favorites + filters) ---

  queryComicsForUser(
    userId: number | null,
    options: QueryOptions & { readStatus?: 'unread' | 'in-progress' | 'completed'; favorites?: boolean; libraryId?: number; folderId?: number },
  ): { records: (ComicRecord & { favorited?: boolean })[]; totalCount: number } {
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
      conditions.push('(c.title LIKE ? COLLATE NOCASE OR c.file_path LIKE ? COLLATE NOCASE)');
      const t = `%${options.search}%`;
      params.push(t, t);
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

    // Progress JOIN (user-scoped if present; null for guests)
    let progressJoin = '';
    const progressSelect = userId != null
      ? 'up.last_page as up_last_page, up.last_location as up_last_location, up.last_read as up_last_read, up.completed as up_completed'
      : 'NULL as up_last_page, NULL as up_last_location, NULL as up_last_read, 0 as up_completed';
    if (userId != null) {
      progressJoin = 'LEFT JOIN user_progress up ON up.comic_id = c.id AND up.user_id = ?';
    }

    // Favorites
    let favSelect = '0 as is_fav';
    let favJoin = '';
    if (userId != null) {
      favSelect = 'CASE WHEN uf.comic_id IS NULL THEN 0 ELSE 1 END as is_fav';
      favJoin = 'LEFT JOIN user_favorites uf ON uf.comic_id = c.id AND uf.user_id = ?';
    }

    // Read status filter (requires progress)
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

    // Prepend user params for joins
    const joinParams: SqlParam[] = [];
    if (userId != null) joinParams.push(userId); // progress join
    if (userId != null) joinParams.push(userId); // fav join
    const allParams = [...joinParams, ...params];

    const countSql = `SELECT COUNT(*) as cnt FROM comics c ${progressJoin} ${favJoin} ${where}`;
    const totalCount = (this.db.prepare(countSql).get(...allParams) as CountRow).cnt;

    const rowsSql = `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail, c.date_added,
                            c.last_page, c.last_location, c.last_read, c.media_type,
                            ${progressSelect}, ${favSelect}
                     FROM comics c ${progressJoin} ${favJoin}
                     ${where}
                     ORDER BY ${sortCol} ${sortDir}
                     LIMIT ? OFFSET ?`;
    const rows = this.db.prepare(rowsSql).all(...allParams, limit, offset) as (ComicRow & { up_last_page: number | null; up_last_location: string | null; up_last_read: string | null; up_completed: number; is_fav: number })[];

    const records = rows.map((r) => {
      const base = this.rowToRecord(r);
      if (userId != null) {
        base.lastPage = r.up_last_page;
        base.lastLocation = r.up_last_location;
        base.lastRead = r.up_last_read;
      }
      return { ...base, favorited: !!r.is_fav };
    });

    return { records, totalCount };
  }
}
