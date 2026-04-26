import Database from 'better-sqlite3';
import { backfillAccountFromPasswordHash } from './repairs';

const CURRENT_VERSION = 6;

/**
 * Read the stored schema version, or detect it from column presence for
 * databases that predate version tracking.
 */
function detectVersion(db: Database.Database): number {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
  if (row) return parseInt(row.value, 10) || 0;

  // Bootstrap: inspect columns to determine which migrations have already run.
  const comicCols = new Set(
    (db.prepare('PRAGMA table_info(comics)').all() as { name: string }[]).map((c) => c.name),
  );
  const userCols = new Set(
    (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name),
  );

  if (userCols.has('display_username')) return 3; // auth migration done; indexes will re-run (idempotent)
  if (comicCols.has('external_source'))  return 2;
  if (comicCols.has('media_type'))       return 1;
  return 0;
}

function setVersion(db: Database.Database, v: number): void {
  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?)").run(String(v));
}

export function migrateSchema(db: Database.Database): void {
  let version = detectVersion(db);

  if (version < 1) {
    db.prepare('ALTER TABLE comics ADD COLUMN last_page INTEGER DEFAULT NULL').run();
    db.prepare('ALTER TABLE comics ADD COLUMN last_location TEXT DEFAULT NULL').run();
    db.prepare('ALTER TABLE comics ADD COLUMN last_read TEXT DEFAULT NULL').run();
    db.prepare("ALTER TABLE comics ADD COLUMN media_type TEXT NOT NULL DEFAULT 'comic'").run();
    db.prepare('ALTER TABLE folders ADD COLUMN cover_comic_id INTEGER REFERENCES comics(id) ON DELETE SET NULL').run();
    version = 1; setVersion(db, version);
  }

  if (version < 2) {
    db.prepare("ALTER TABLE libraries ADD COLUMN media_type TEXT NOT NULL DEFAULT 'comic'").run();
    db.prepare('ALTER TABLE comics ADD COLUMN series_name TEXT').run();
    db.prepare('ALTER TABLE comics ADD COLUMN volume_number REAL').run();
    db.prepare('ALTER TABLE comics ADD COLUMN chapter_number REAL').run();
    db.prepare('ALTER TABLE comics ADD COLUMN completed INTEGER NOT NULL DEFAULT 0').run();
    db.prepare('ALTER TABLE comics ADD COLUMN author TEXT').run();
    db.prepare('ALTER TABLE comics ADD COLUMN artist TEXT').run();
    db.prepare('ALTER TABLE comics ADD COLUMN genre TEXT').run();
    db.prepare('ALTER TABLE comics ADD COLUMN year INTEGER').run();
    db.prepare('ALTER TABLE comics ADD COLUMN summary TEXT').run();
    db.prepare('ALTER TABLE comics ADD COLUMN external_id TEXT').run();
    db.prepare('ALTER TABLE comics ADD COLUMN external_source TEXT').run();
    version = 2; setVersion(db, version);
  }

  if (version < 3) {
    migrateAuthSchema(db);
    version = 3; setVersion(db, version);
  }

  if (version < 4) {
    ensurePostMigrationIndexes(db);
    version = 4; setVersion(db, version);
  }

  if (version < 5) {
    ensurePostMigrationIndexes(db);
    version = 5; setVersion(db, version);
  }

  if (version < 6) {
    ensureSearchIndex(db);
    version = 6; setVersion(db, version);
  }
}

/**
 * FTS5 virtual table mirroring the searchable text columns of `comics`,
 * plus the triggers that keep it in sync. Idempotent — safe to run on
 * every migration pass and on fresh installs.
 *
 * `content='comics'` makes this an external-content table: FTS5 indexes
 * the text but doesn't store a second copy, so it adds essentially zero
 * disk cost over the comics table itself. `content_rowid='id'` aligns
 * the FTS rowid with the comic id.
 */
export function ensureSearchIndex(db: Database.Database): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS comics_fts USING fts5(
      title, file_path, series_name, author, summary,
      content='comics',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER IF NOT EXISTS comics_ai_fts AFTER INSERT ON comics BEGIN
      INSERT INTO comics_fts(rowid, title, file_path, series_name, author, summary)
      VALUES (new.id, new.title, new.file_path, new.series_name, new.author, new.summary);
    END;

    CREATE TRIGGER IF NOT EXISTS comics_ad_fts AFTER DELETE ON comics BEGIN
      INSERT INTO comics_fts(comics_fts, rowid, title, file_path, series_name, author, summary)
      VALUES ('delete', old.id, old.title, old.file_path, old.series_name, old.author, old.summary);
    END;

    CREATE TRIGGER IF NOT EXISTS comics_au_fts AFTER UPDATE ON comics BEGIN
      INSERT INTO comics_fts(comics_fts, rowid, title, file_path, series_name, author, summary)
      VALUES ('delete', old.id, old.title, old.file_path, old.series_name, old.author, old.summary);
      INSERT INTO comics_fts(rowid, title, file_path, series_name, author, summary)
      VALUES (new.id, new.title, new.file_path, new.series_name, new.author, new.summary);
    END;
  `);

  // Backfill: only runs the first time the index is created (or after a
  // user has rebuilt). Cheap to detect — if FTS is already populated, skip.
  const ftsCount = (db.prepare('SELECT COUNT(*) AS cnt FROM comics_fts').get() as { cnt: number }).cnt;
  const comicsCount = (db.prepare('SELECT COUNT(*) AS cnt FROM comics').get() as { cnt: number }).cnt;
  if (ftsCount < comicsCount) {
    db.exec(`
      INSERT INTO comics_fts(comics_fts) VALUES ('rebuild');
    `);
  }
}

function migrateAuthSchema(db: Database.Database): void {
  db.prepare('ALTER TABLE users ADD COLUMN email TEXT').run();
  db.prepare('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0').run();
  db.prepare('ALTER TABLE users ADD COLUMN name TEXT').run();
  db.prepare('ALTER TABLE users ADD COLUMN image TEXT').run();
  db.prepare('ALTER TABLE users ADD COLUMN updated_at TEXT').run();
  db.prepare("UPDATE users SET updated_at = datetime('now') WHERE updated_at IS NULL").run();
  db.prepare('ALTER TABLE users ADD COLUMN display_username TEXT').run();
  backfillAccountFromPasswordHash(db);
}

export function ensurePostMigrationIndexes(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_comics_series ON comics(series_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_comics_last_read ON comics(last_read);
    CREATE INDEX IF NOT EXISTS idx_comics_media_title ON comics(media_type, title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_comics_media_date_added ON comics(media_type, date_added);
    CREATE INDEX IF NOT EXISTS idx_comics_media_last_read ON comics(media_type, last_read);
    CREATE INDEX IF NOT EXISTS idx_comics_completed_media ON comics(completed, media_type);
  `);
}

/** Called by open.ts on a freshly created DB to skip all migrations. */
export function initializeVersion(db: Database.Database): void {
  ensurePostMigrationIndexes(db);
  ensureSearchIndex(db);
  setVersion(db, CURRENT_VERSION);
}
