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
  media_type TEXT NOT NULL DEFAULT 'comic'
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
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name COLLATE NOCASE);

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

    const where = `WHERE ${conditions.join(' AND ')}`;
    const sortCol = SORT_COLUMN_MAP[options.sortBy ?? 'title'] ?? SORT_COLUMN_MAP.title;
    const sortDir = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const totalCount = (this.db.prepare(
      `SELECT COUNT(*) as cnt FROM comics c ${where}`
    ).get(...params) as CountRow).cnt;

    const rows = this.db.prepare(
      `SELECT c.id, c.file_path, c.title, c.page_count, c.file_size, c.cover_thumbnail, c.date_added, c.last_page, c.last_read, c.media_type
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
}
