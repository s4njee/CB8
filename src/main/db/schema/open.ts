import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import { SCHEMA } from './create';
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

export async function openOrRecreate(dbPath: string): Promise<Database.Database> {
  let db: Database.Database;
  try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 3000');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
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
    } catch (recreateErr) {
      throw new DbStartupError('corrupt', 'DB recreation failed after corrupt file detected', recreateErr);
    }
  }

  try {
    await runRepairs(db);
  } catch (err) {
    console.warn('[CB8] Non-fatal repair error during DB startup:', err);
  }

  return db;
}
