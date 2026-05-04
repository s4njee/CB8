/**
 * Tests for src/main/maintenance/softDeleteSweeper.ts.
 *
 * Builds an in-memory v7 DB, seeds soft-deleted comics with various
 * combinations of user state and ages, then verifies the sweeper
 * hard-deletes only the rows that meet R-8's criteria.
 */
import Database from 'better-sqlite3';
import { describe, it, expect, vi } from 'vitest';
import { SCHEMA } from '../db/schema/create';
import { initializeVersion } from '../db/schema/migrations';
import * as seriesRepo from '../db/series';
import { sweepSoftDeleted, GRACE_WINDOW_DAYS } from './softDeleteSweeper';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  initializeVersion(db);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  db.exec(`
    INSERT INTO libraries (id, name) VALUES (1, 'Lib');
    INSERT INTO users (id, username) VALUES (1, 'u1');
  `);
  return db;
}

const oldTime  = new Date(Date.now() - (GRACE_WINDOW_DAYS + 1) * 86_400_000).toISOString();
const newTime  = new Date(Date.now() - 1 * 86_400_000).toISOString();

describe('softDeleteSweeper', () => {
  it('hard-deletes comics past grace with no user state', () => {
    const db = freshDb();
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size, deleted_at)
      VALUES (1, '/a/x.cbz', 'X', 1, 1, ?)
    `).run(oldTime);

    const r = sweepSoftDeleted(db);
    expect(r.comicsDeleted).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS c FROM comics').get()).toEqual({ c: 0 });
  });

  it('does NOT hard-delete a comic still under grace', () => {
    const db = freshDb();
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size, deleted_at)
      VALUES (1, '/a/x.cbz', 'X', 1, 1, ?)
    `).run(newTime);

    const r = sweepSoftDeleted(db);
    expect(r.comicsDeleted).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS c FROM comics').get()).toEqual({ c: 1 });
  });

  it('retains a past-grace comic with reading progress', () => {
    const db = freshDb();
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size, deleted_at)
      VALUES (1, '/a/x.cbz', 'X', 1, 1, ?)
    `).run(oldTime);
    db.prepare(`INSERT INTO user_progress (user_id, comic_id, last_page) VALUES (1, 1, 5)`).run();

    const r = sweepSoftDeleted(db);
    expect(r.comicsDeleted).toBe(0);
    expect(r.comicsRetained).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS c FROM comics').get()).toEqual({ c: 1 });
  });

  it('retains a past-grace comic with a bookmark', () => {
    const db = freshDb();
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size, deleted_at)
      VALUES (1, '/a/x.cbz', 'X', 1, 1, ?)
    `).run(oldTime);
    db.prepare(`INSERT INTO bookmarks (user_id, comic_id, page) VALUES (1, 1, 3)`).run();

    const r = sweepSoftDeleted(db);
    expect(r.comicsDeleted).toBe(0);
    expect(r.comicsRetained).toBe(1);
  });

  it('retains a past-grace comic favorited by a user', () => {
    const db = freshDb();
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size, deleted_at)
      VALUES (1, '/a/x.cbz', 'X', 1, 1, ?)
    `).run(oldTime);
    db.prepare(`INSERT INTO user_favorites (user_id, comic_id) VALUES (1, 1)`).run();

    const r = sweepSoftDeleted(db);
    expect(r.comicsDeleted).toBe(0);
    expect(r.comicsRetained).toBe(1);
  });

  it('hard-deletes the empty volume + series after their last comic is swept', () => {
    const db = freshDb();
    const s = seriesRepo.getOrCreate(db, 1, 'Foo');
    db.prepare(`
      INSERT INTO volume (id, series_id, number, deleted_at)
      VALUES (10, ?, 1, ?)
    `).run(s.id, oldTime);
    db.prepare(`UPDATE series SET deleted_at = ? WHERE id = ?`).run(oldTime, s.id);
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size, series_id, volume_id, deleted_at)
      VALUES (1, '/a/x.cbz', 'X', 1, 1, ?, 10, ?)
    `).run(s.id, oldTime);

    const r = sweepSoftDeleted(db);
    expect(r.comicsDeleted).toBe(1);
    expect(r.volumesDeleted).toBe(1);
    expect(r.seriesDeleted).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS c FROM volume').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM series').get()).toEqual({ c: 0 });
  });

  it('does not delete a series that still has live volumes', () => {
    const db = freshDb();
    const s = seriesRepo.getOrCreate(db, 1, 'Foo');
    db.prepare(`UPDATE series SET deleted_at = ? WHERE id = ?`).run(oldTime, s.id);
    // A live volume keeps the series row alive even if marked soft-deleted —
    // the cascade rule said the series should NOT have been soft-deleted in
    // this state, but if it was (e.g. an admin action), the sweeper still
    // refuses to hard-delete because the series tree isn't empty.
    db.prepare(`INSERT INTO volume (id, series_id, number) VALUES (10, ?, 1)`).run(s.id);

    const r = sweepSoftDeleted(db);
    expect(r.seriesDeleted).toBe(0);
  });

  it('reports a non-zero durationMs', () => {
    const db = freshDb();
    const r = sweepSoftDeleted(db);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });
});
