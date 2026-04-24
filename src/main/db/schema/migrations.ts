import Database from 'better-sqlite3';
import { backfillAccountFromPasswordHash } from './repairs';

const CURRENT_VERSION = 4;

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
  `);
}

/** Called by open.ts on a freshly created DB to skip all migrations. */
export function initializeVersion(db: Database.Database): void {
  setVersion(db, CURRENT_VERSION);
}
