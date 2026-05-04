/**
 * Unit tests for src/main/db/series.ts. Each test boots a fresh in-memory
 * DB with the canonical schema (`SCHEMA` + `initializeVersion`) so the
 * partial unique indexes on `series` and `volume` are in place.
 */
import Database from 'better-sqlite3';
import { describe, it, expect, vi } from 'vitest';
import { SCHEMA } from './schema/create';
import { initializeVersion } from './schema/migrations';
import * as seriesRepo from './series';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  initializeVersion(db);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  db.exec(`INSERT INTO libraries (id, name) VALUES (1, 'Lib1'), (2, 'Lib2');`);
  return db;
}

describe('seriesRepo.getOrCreate', () => {
  it('inserts a new series with computed sort_name', () => {
    const db = freshDb();
    const s = seriesRepo.getOrCreate(db, 1, 'Foo Bar');
    expect(s.id).toBeGreaterThan(0);
    expect(s.name).toBe('Foo Bar');
    expect(s.sortName).toBe('foo bar');
    expect(s.libraryId).toBe(1);
  });

  it('is NOCASE-idempotent within a library', () => {
    const db = freshDb();
    const a = seriesRepo.getOrCreate(db, 1, 'Foo Bar');
    const b = seriesRepo.getOrCreate(db, 1, 'foo bar');
    const c = seriesRepo.getOrCreate(db, 1, '  FOO   BAR  ');
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
  });

  it('treats same name in different libraries as distinct', () => {
    const db = freshDb();
    const a = seriesRepo.getOrCreate(db, 1, 'Foo');
    const b = seriesRepo.getOrCreate(db, 2, 'Foo');
    expect(a.id).not.toBe(b.id);
  });

  it('restores a soft-deleted series instead of creating a duplicate', () => {
    const db = freshDb();
    const a = seriesRepo.getOrCreate(db, 1, 'Phantom');
    seriesRepo.softDelete(db, a.id);
    const b = seriesRepo.getOrCreate(db, 1, 'phantom');
    expect(b.id).toBe(a.id);
    expect(b.deletedAt).toBeNull();
  });

  it('throws on empty name', () => {
    const db = freshDb();
    expect(() => seriesRepo.getOrCreate(db, 1, '')).toThrow();
    expect(() => seriesRepo.getOrCreate(db, 1, '   ')).toThrow();
  });

  it('uses normalised whitespace as the canonical name', () => {
    const db = freshDb();
    const s = seriesRepo.getOrCreate(db, 1, '  Spider   Man  ');
    expect(s.name).toBe('Spider Man');
  });
});

describe('seriesRepo.lookupByName', () => {
  it('returns the live row by NOCASE match', () => {
    const db = freshDb();
    seriesRepo.getOrCreate(db, 1, 'Foo Bar');
    const r = seriesRepo.lookupByName(db, 1, 'foo bar');
    expect(r?.name).toBe('Foo Bar');
  });

  it('does not return soft-deleted rows', () => {
    const db = freshDb();
    const s = seriesRepo.getOrCreate(db, 1, 'Foo');
    seriesRepo.softDelete(db, s.id);
    expect(seriesRepo.lookupByName(db, 1, 'Foo')).toBeNull();
  });
});

describe('seriesRepo.update', () => {
  it('updates fields and recomputes sort_name when name changes', () => {
    const db = freshDb();
    const s = seriesRepo.getOrCreate(db, 1, 'Foo');
    const updated = seriesRepo.update(db, s.id, { name: 'Bar Baz', status: 'ongoing' });
    expect(updated?.name).toBe('Bar Baz');
    expect(updated?.sortName).toBe('bar baz');
    expect(updated?.status).toBe('ongoing');
  });

  it('rejects invalid status / age_rating via CHECK constraint', () => {
    const db = freshDb();
    const s = seriesRepo.getOrCreate(db, 1, 'Foo');
    expect(() => seriesRepo.update(db, s.id, { status: 'wrong' as never })).toThrow();
  });
});

describe('seriesRepo.softDelete + restore', () => {
  it('sets and clears deleted_at', () => {
    const db = freshDb();
    const s = seriesRepo.getOrCreate(db, 1, 'Foo');
    seriesRepo.softDelete(db, s.id);
    expect(seriesRepo.get(db, s.id)?.deletedAt).not.toBeNull();
    seriesRepo.restore(db, s.id);
    expect(seriesRepo.get(db, s.id)?.deletedAt).toBeNull();
  });

  it('softDelete is a no-op when already soft-deleted (preserves original timestamp)', () => {
    const db = freshDb();
    const s = seriesRepo.getOrCreate(db, 1, 'Foo');
    seriesRepo.softDelete(db, s.id, '2024-01-01T00:00:00Z');
    seriesRepo.softDelete(db, s.id, '2025-01-01T00:00:00Z');
    expect(seriesRepo.get(db, s.id)?.deletedAt).toBe('2024-01-01T00:00:00Z');
  });
});

describe('seriesRepo.listForLibrary', () => {
  it('returns chapter counts and last-added timestamps', () => {
    const db = freshDb();
    const s = seriesRepo.getOrCreate(db, 1, 'Foo');
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size, series_id, date_added)
      VALUES (1, '/a/1.cbz', '1', 1, 1, ?, '2024-06-01T00:00:00Z'),
             (2, '/a/2.cbz', '2', 1, 1, ?, '2024-09-01T00:00:00Z')
    `).run(s.id, s.id);
    db.prepare(`INSERT INTO library_comics (library_id, comic_id) VALUES (1, 1), (1, 2)`).run();
    const list = seriesRepo.listForLibrary(db, 1);
    expect(list.find((r) => r.id === s.id)?.chapterCount).toBe(2);
    expect(list.find((r) => r.id === s.id)?.lastChapterAddedAt).toBe('2024-09-01T00:00:00Z');
  });

  it('excludes soft-deleted series by default', () => {
    const db = freshDb();
    const a = seriesRepo.getOrCreate(db, 1, 'Live');
    const b = seriesRepo.getOrCreate(db, 1, 'Dead');
    seriesRepo.softDelete(db, b.id);
    const list = seriesRepo.listForLibrary(db, 1);
    expect(list.map((r) => r.id)).toContain(a.id);
    expect(list.map((r) => r.id)).not.toContain(b.id);
  });

  it('includes soft-deleted series when asked', () => {
    const db = freshDb();
    const b = seriesRepo.getOrCreate(db, 1, 'Dead');
    seriesRepo.softDelete(db, b.id);
    const list = seriesRepo.listForLibrary(db, 1, { includeDeleted: true });
    expect(list.map((r) => r.id)).toContain(b.id);
  });

  it('returns chapter count of 0 for empty series', () => {
    const db = freshDb();
    const s = seriesRepo.getOrCreate(db, 1, 'Empty');
    const list = seriesRepo.listForLibrary(db, 1);
    expect(list.find((r) => r.id === s.id)?.chapterCount).toBe(0);
    expect(list.find((r) => r.id === s.id)?.lastChapterAddedAt).toBeNull();
  });
});
