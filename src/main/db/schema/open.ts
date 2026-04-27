import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import { SCHEMA } from './create';
import { migrateSchema, initializeVersion } from './migrations';
import { runRepairs } from './repairs';

export class DbStartupError extends Error {
  constructor(
    public readonly category: 'corrupt' | 'migration' | 'repair',
    public readonly detail: string,
    public readonly cause?: unknown,
  ) {
    super(detail);
    this.name = 'DbStartupError';
  }
}

export function openOrRecreate(dbPath: string): Database.Database {
  // Only the open+exec(SCHEMA) path is guarded by the wipe-and-recreate
  // fallback — migrateSchema failures must NOT destroy a working library DB.
  let db: Database.Database;
  try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 3000');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
    initializeVersion(db); // fresh install: skip all migrations
  } catch (err) {
    console.warn(
      `Database corrupted or unreadable at ${dbPath}, recreating.`,
      err instanceof Error ? err.message : err,
    );
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
    }
    try {
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 3000');
      db.pragma('foreign_keys = ON');
      db.exec(SCHEMA);
      initializeVersion(db);
    } catch (recreateErr) {
      throw new DbStartupError('corrupt', 'DB recreation failed after corrupt file detected', recreateErr);
    }
  }

  try {
    migrateSchema(db);
  } catch (err) {
    throw new DbStartupError('migration', 'Schema migration failed', err);
  }

  // Repairs include async image work (sharp). Fire-and-forget — they're
  // idempotent and gated by app_meta keys, so a missed run just retries
  // on next startup. Errors are logged and never fatal.
  void runRepairs(db).catch((err) => {
    console.warn('[CB8] Non-fatal repair error during DB startup:', err);
  });

  return db;
}
