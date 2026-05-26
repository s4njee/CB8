import Database from 'better-sqlite3';

/**
 * Schema is green-field at v1. The full table layout lives in `create.ts`
 * and is exec'd on every open via `db.exec(SCHEMA)` in `open.ts`. This
 * module exists for two reasons:
 *
 *   1. To define `initializeVersion` — called by `open.ts` immediately after
 *      `db.exec(SCHEMA)` on a fresh DB. It pins `app_meta.schema_version`
 *      and ensures the FTS5 virtual tables + secondary indexes are present.
 *      Both FTS helpers are idempotent (`IF NOT EXISTS` everywhere) so
 *      calling them on every open is safe.
 *
 *   2. To define `migrateSchema` — also called on every open. With v1 as
 *      the only version, the body is a no-op for fresh installs and a
 *      defensive "make sure FTS + indexes exist" pass for any DB that
 *      somehow lost them.
 *
 * Earlier development carried a v6 → v7 → v8 chain (legacy `series_name`
 * column, hierarchy migration, drop-legacy migration). That history was
 * collapsed once the project committed to a green-field deploy: there are
 * no v6 or v7 databases in the wild, and `create.ts` already encodes the
 * post-collapse shape.
 */

const CURRENT_VERSION = 1;

function setVersion(db: Database.Database, v: number): void {
  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?)").run(String(v));
}

/**
 * Run on every open after `db.exec(SCHEMA)`. Idempotent. Re-asserts that
 * the FTS tables + secondary indexes exist; useful if a sibling tool has
 * dropped them out-of-band, or if a future version bump needs to do
 * something here.
 */
export function migrateSchema(db: Database.Database): void {
  ensureWatchRootsTable(db);
  ensureThumbnailStatusColumn(db);
  ensurePostMigrationIndexes(db);
  ensureSearchIndex(db);
  ensureSeriesSearchIndex(db);
}

/**
 * Called by `open.ts` immediately after `db.exec(SCHEMA)` on a fresh DB.
 * Pins schema_version and ensures the FTS + index objects exist.
 */
export function initializeVersion(db: Database.Database): void {
  ensureWatchRootsTable(db);
  ensureThumbnailStatusColumn(db);
  ensurePostMigrationIndexes(db);
  ensureSearchIndex(db);
  ensureSeriesSearchIndex(db);
  setVersion(db, CURRENT_VERSION);
}

function ensureThumbnailStatusColumn(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(comics)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'thumbnail_status')) {
    db.prepare(
      `ALTER TABLE comics
       ADD COLUMN thumbnail_status TEXT NOT NULL DEFAULT 'ready'
       CHECK (thumbnail_status IN ('ready','pending','failed'))`
    ).run();
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_comics_thumbnail_status
      ON comics(thumbnail_status, media_type, id);
  `);
}

function ensureWatchRootsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS library_watch_roots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_path TEXT NOT NULL,
      library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
      folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_library_watch_roots_unique
      ON library_watch_roots(root_path, library_id, COALESCE(folder_id, -1));
    CREATE INDEX IF NOT EXISTS idx_library_watch_roots_enabled
      ON library_watch_roots(enabled);
  `);
}

/**
 * Secondary indexes that aren't part of `create.ts`'s table-shape
 * definitions but are still part of the standard schema. Idempotent.
 */
export function ensurePostMigrationIndexes(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_comics_last_read ON comics(last_read);
    CREATE INDEX IF NOT EXISTS idx_comics_media_title ON comics(media_type, title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_comics_media_date_added ON comics(media_type, date_added);
    CREATE INDEX IF NOT EXISTS idx_comics_media_last_read ON comics(media_type, last_read);
    CREATE INDEX IF NOT EXISTS idx_comics_completed_media ON comics(completed, media_type);
  `);
}

/**
 * FTS5 virtual table mirroring the searchable text columns of `comics`,
 * plus the triggers that keep it in sync. External-content table
 * (`content='comics'`) so FTS5 indexes the text without a second copy on
 * disk. Idempotent — safe to run on every open.
 */
export function ensureSearchIndex(db: Database.Database): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS comics_fts USING fts5(
      title, file_path, author, summary,
      content='comics',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER IF NOT EXISTS comics_ai_fts AFTER INSERT ON comics BEGIN
      INSERT INTO comics_fts(rowid, title, file_path, author, summary)
      VALUES (new.id, new.title, new.file_path, new.author, new.summary);
    END;

    CREATE TRIGGER IF NOT EXISTS comics_ad_fts AFTER DELETE ON comics BEGIN
      INSERT INTO comics_fts(comics_fts, rowid, title, file_path, author, summary)
      VALUES ('delete', old.id, old.title, old.file_path, old.author, old.summary);
    END;

    CREATE TRIGGER IF NOT EXISTS comics_au_fts AFTER UPDATE ON comics BEGIN
      INSERT INTO comics_fts(comics_fts, rowid, title, file_path, author, summary)
      VALUES ('delete', old.id, old.title, old.file_path, old.author, old.summary);
      INSERT INTO comics_fts(rowid, title, file_path, author, summary)
      VALUES (new.id, new.title, new.file_path, new.author, new.summary);
    END;
  `);

  // Rebuild the FTS index if it lags the source table. Cheap when up to date.
  const ftsCount = (db.prepare('SELECT COUNT(*) AS cnt FROM comics_fts').get() as { cnt: number }).cnt;
  const comicsCount = (db.prepare('SELECT COUNT(*) AS cnt FROM comics').get() as { cnt: number }).cnt;
  if (ftsCount < comicsCount) {
    db.exec(`INSERT INTO comics_fts(comics_fts) VALUES ('rebuild');`);
  }
}

/**
 * FTS5 virtual table over the `series` table for series-level search
 * (R-11). External-content table — adds essentially zero disk cost over
 * `series` itself. Idempotent; safe to call on every open.
 */
export function ensureSeriesSearchIndex(db: Database.Database): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS series_fts USING fts5(
      name, localized_name, summary,
      content='series',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER IF NOT EXISTS series_ai_fts AFTER INSERT ON series BEGIN
      INSERT INTO series_fts(rowid, name, localized_name, summary)
      VALUES (new.id, new.name, COALESCE(new.localized_name,''), COALESCE(new.summary,''));
    END;

    CREATE TRIGGER IF NOT EXISTS series_ad_fts AFTER DELETE ON series BEGIN
      INSERT INTO series_fts(series_fts, rowid, name, localized_name, summary)
      VALUES ('delete', old.id, old.name, COALESCE(old.localized_name,''), COALESCE(old.summary,''));
    END;

    CREATE TRIGGER IF NOT EXISTS series_au_fts AFTER UPDATE ON series BEGIN
      INSERT INTO series_fts(series_fts, rowid, name, localized_name, summary)
      VALUES ('delete', old.id, old.name, COALESCE(old.localized_name,''), COALESCE(old.summary,''));
      INSERT INTO series_fts(rowid, name, localized_name, summary)
      VALUES (new.id, new.name, COALESCE(new.localized_name,''), COALESCE(new.summary,''));
    END;
  `);

  const ftsCount = (db.prepare('SELECT COUNT(*) AS cnt FROM series_fts').get() as { cnt: number }).cnt;
  const seriesCount = (db.prepare('SELECT COUNT(*) AS cnt FROM series').get() as { cnt: number }).cnt;
  if (ftsCount < seriesCount) {
    db.exec(`INSERT INTO series_fts(series_fts) VALUES ('rebuild');`);
  }
}
