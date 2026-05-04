/**
 * Unit tests for src/main/db/volume.ts. Each test boots a fresh in-memory
 * DB with the canonical schema and seeds one series.
 */
import Database from 'better-sqlite3';
import { describe, it, expect, vi } from 'vitest';
import { SCHEMA } from './schema/create';
import { initializeVersion } from './schema/migrations';
import * as seriesRepo from './series';
import * as volumeRepo from './volume';

function freshDb(): { db: Database.Database; seriesId: number } {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  initializeVersion(db);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  db.exec(`INSERT INTO libraries (id, name) VALUES (1, 'Lib1');`);
  const series = seriesRepo.getOrCreate(db, 1, 'Test Series');
  return { db, seriesId: series.id };
}

describe('volumeRepo.getOrCreate', () => {
  it('inserts a numbered volume', () => {
    const { db, seriesId } = freshDb();
    const v = volumeRepo.getOrCreate(db, seriesId, 1, 'v1');
    expect(v.number).toBe(1);
    expect(v.name).toBe('v1');
    expect(v.seriesId).toBe(seriesId);
  });

  it('is idempotent for (series_id, number)', () => {
    const { db, seriesId } = freshDb();
    const a = volumeRepo.getOrCreate(db, seriesId, 1);
    const b = volumeRepo.getOrCreate(db, seriesId, 1);
    expect(b.id).toBe(a.id);
  });

  it('updates name when called again with a non-null name', () => {
    const { db, seriesId } = freshDb();
    const a = volumeRepo.getOrCreate(db, seriesId, 1);
    expect(a.name).toBeNull();
    const b = volumeRepo.getOrCreate(db, seriesId, 1, '2015 run');
    expect(b.id).toBe(a.id);
    expect(b.name).toBe('2015 run');
  });

  it('treats different numbers as distinct', () => {
    const { db, seriesId } = freshDb();
    const a = volumeRepo.getOrCreate(db, seriesId, 1);
    const b = volumeRepo.getOrCreate(db, seriesId, 2);
    expect(a.id).not.toBe(b.id);
  });

  it('rejects non-finite numbers', () => {
    const { db, seriesId } = freshDb();
    expect(() => volumeRepo.getOrCreate(db, seriesId, NaN)).toThrow();
    expect(() => volumeRepo.getOrCreate(db, seriesId, Infinity)).toThrow();
  });

  it('restores a soft-deleted numbered volume rather than duplicating', () => {
    const { db, seriesId } = freshDb();
    const a = volumeRepo.getOrCreate(db, seriesId, 1);
    volumeRepo.softDelete(db, a.id);
    const b = volumeRepo.getOrCreate(db, seriesId, 1);
    expect(b.id).toBe(a.id);
    expect(b.deletedAt).toBeNull();
  });
});

describe('volumeRepo.getOrCreateImplicit', () => {
  it('inserts an implicit volume on first call', () => {
    const { db, seriesId } = freshDb();
    const v = volumeRepo.getOrCreateImplicit(db, seriesId);
    expect(v.number).toBeNull();
  });

  it('is idempotent — at most one implicit per series', () => {
    const { db, seriesId } = freshDb();
    const a = volumeRepo.getOrCreateImplicit(db, seriesId);
    const b = volumeRepo.getOrCreateImplicit(db, seriesId);
    expect(b.id).toBe(a.id);
    const count = (db.prepare(
      `SELECT COUNT(*) AS c FROM volume WHERE series_id = ? AND number IS NULL`
    ).get(seriesId) as { c: number }).c;
    expect(count).toBe(1);
  });

  it('coexists with numbered volumes', () => {
    const { db, seriesId } = freshDb();
    const numbered = volumeRepo.getOrCreate(db, seriesId, 1);
    const implicit = volumeRepo.getOrCreateImplicit(db, seriesId);
    expect(numbered.id).not.toBe(implicit.id);
    expect(numbered.number).toBe(1);
    expect(implicit.number).toBeNull();
  });

  it('restores a soft-deleted implicit volume rather than duplicating', () => {
    const { db, seriesId } = freshDb();
    const a = volumeRepo.getOrCreateImplicit(db, seriesId);
    volumeRepo.softDelete(db, a.id);
    const b = volumeRepo.getOrCreateImplicit(db, seriesId);
    expect(b.id).toBe(a.id);
    expect(b.deletedAt).toBeNull();
  });
});

describe('volumeRepo.listForSeries', () => {
  it('orders numbered volumes ascending then implicit last', () => {
    const { db, seriesId } = freshDb();
    volumeRepo.getOrCreateImplicit(db, seriesId);
    volumeRepo.getOrCreate(db, seriesId, 2);
    volumeRepo.getOrCreate(db, seriesId, 1);
    const list = volumeRepo.listForSeries(db, seriesId);
    expect(list.map((v) => v.number)).toEqual([1, 2, null]);
  });

  it('excludes implicit when asked', () => {
    const { db, seriesId } = freshDb();
    volumeRepo.getOrCreateImplicit(db, seriesId);
    volumeRepo.getOrCreate(db, seriesId, 1);
    const list = volumeRepo.listForSeries(db, seriesId, { includeImplicit: false });
    expect(list.map((v) => v.number)).toEqual([1]);
  });

  it('reports chapter counts (excluding soft-deleted chapters)', () => {
    const { db, seriesId } = freshDb();
    const v = volumeRepo.getOrCreate(db, seriesId, 1);
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size, volume_id, deleted_at)
      VALUES (1, '/a/1.cbz', '1', 1, 1, ?, NULL),
             (2, '/a/2.cbz', '2', 1, 1, ?, NULL),
             (3, '/a/3.cbz', '3', 1, 1, ?, '2024-01-01T00:00:00Z')
    `).run(v.id, v.id, v.id);
    const list = volumeRepo.listForSeries(db, seriesId);
    expect(list.find((row) => row.id === v.id)?.chapterCount).toBe(2);
  });

  it('excludes soft-deleted volumes by default', () => {
    const { db, seriesId } = freshDb();
    const a = volumeRepo.getOrCreate(db, seriesId, 1);
    const b = volumeRepo.getOrCreate(db, seriesId, 2);
    volumeRepo.softDelete(db, b.id);
    const list = volumeRepo.listForSeries(db, seriesId);
    expect(list.map((v) => v.id)).toEqual([a.id]);
    const all = volumeRepo.listForSeries(db, seriesId, { includeDeleted: true });
    expect(all.map((v) => v.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe('volumeRepo.update / softDelete / restore', () => {
  it('update changes name and coverComicId', () => {
    const { db, seriesId } = freshDb();
    const v = volumeRepo.getOrCreate(db, seriesId, 1);
    db.prepare(`INSERT INTO comics (id, file_path, title, page_count, file_size) VALUES (1,'/a','A',1,1)`).run();
    const updated = volumeRepo.update(db, v.id, { name: 'New Label', coverComicId: 1 });
    expect(updated?.name).toBe('New Label');
    expect(updated?.coverComicId).toBe(1);
  });

  it('softDelete + restore round-trip', () => {
    const { db, seriesId } = freshDb();
    const v = volumeRepo.getOrCreate(db, seriesId, 1);
    volumeRepo.softDelete(db, v.id);
    expect(volumeRepo.get(db, v.id)?.deletedAt).not.toBeNull();
    volumeRepo.restore(db, v.id);
    expect(volumeRepo.get(db, v.id)?.deletedAt).toBeNull();
  });
});
