/**
 * Tests for src/main/db/search.ts. Asserts that the union query returns
 * series + chapter hits, ranks series above chapters when both match,
 * respects soft-delete, and scopes by library.
 */
import Database from 'better-sqlite3';
import { describe, it, expect, vi } from 'vitest';
import { SCHEMA } from './schema/create';
import { initializeVersion } from './schema/migrations';
import * as seriesRepo from './series';
import { unionSearch } from './search';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  initializeVersion(db);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  db.exec(`INSERT INTO libraries (id, name) VALUES (1, 'Marvel'), (2, 'Other');`);
  return db;
}

describe('unionSearch', () => {
  it('returns the matching series and chapter rows', () => {
    const db = freshDb();
    seriesRepo.getOrCreate(db, 1, 'Darth Vader');
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size)
      VALUES (1, '/a/dv1.cbz', 'Darth Vader 001', 1, 1)
    `).run();

    const hits = unionSearch(db, 'darth');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const kinds = hits.map((h) => h.kind);
    expect(kinds).toContain('series');
    expect(kinds).toContain('chapter');
  });

  it('ranks series above chapters when both match', () => {
    const db = freshDb();
    seriesRepo.getOrCreate(db, 1, 'Spider-Man');
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size)
      VALUES (1, '/a/sm1.cbz', 'Spider-Man 001', 1, 1),
             (2, '/a/sm2.cbz', 'Spider-Man 002', 1, 1)
    `).run();

    const hits = unionSearch(db, 'spider');
    expect(hits[0].kind).toBe('series');
  });

  it('hides soft-deleted series and chapters', () => {
    const db = freshDb();
    const s = seriesRepo.getOrCreate(db, 1, 'Hidden');
    seriesRepo.softDelete(db, s.id);
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size, deleted_at)
      VALUES (1, '/a/h.cbz', 'Hidden Comic', 1, 1, '2024-01-01T00:00:00Z')
    `).run();

    expect(unionSearch(db, 'hidden')).toEqual([]);
  });

  it('returns empty for whitespace/punctuation-only queries', () => {
    const db = freshDb();
    seriesRepo.getOrCreate(db, 1, 'X');
    expect(unionSearch(db, '')).toEqual([]);
    expect(unionSearch(db, '   ')).toEqual([]);
    expect(unionSearch(db, '!!!')).toEqual([]);
  });

  it('respects libraryId scoping for series', () => {
    const db = freshDb();
    seriesRepo.getOrCreate(db, 1, 'Inkwell');
    seriesRepo.getOrCreate(db, 2, 'Inkwell');

    const hitsLib1 = unionSearch(db, 'inkwell', { libraryId: 1 });
    expect(hitsLib1.filter((h) => h.kind === 'series')).toHaveLength(1);
    expect(hitsLib1.filter((h) => h.kind === 'series')[0].libraryId).toBe(1);

    const hitsLib2 = unionSearch(db, 'inkwell', { libraryId: 2 });
    expect(hitsLib2.filter((h) => h.kind === 'series')).toHaveLength(1);
    expect(hitsLib2.filter((h) => h.kind === 'series')[0].libraryId).toBe(2);
  });

  it('respects libraryId scoping for chapters via library_comics', () => {
    const db = freshDb();
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size)
      VALUES (1, '/a/x.cbz', 'Wandering 001', 1, 1),
             (2, '/b/y.cbz', 'Wandering 002', 1, 1)
    `).run();
    db.prepare(`INSERT INTO library_comics (library_id, comic_id) VALUES (1, 1), (2, 2)`).run();

    const hitsLib1 = unionSearch(db, 'wandering', { libraryId: 1 });
    expect(hitsLib1.filter((h) => h.kind === 'chapter')).toHaveLength(1);
    expect(hitsLib1.filter((h) => h.kind === 'chapter')[0].id).toBe(1);
  });

  it('limits results to the requested count', () => {
    const db = freshDb();
    for (let i = 1; i <= 10; i++) {
      seriesRepo.getOrCreate(db, 1, `Foo ${i}`);
    }
    const hits = unionSearch(db, 'foo', { limit: 3 });
    expect(hits).toHaveLength(3);
  });

  it('uses prefix matching ("dar" matches "Darth")', () => {
    const db = freshDb();
    seriesRepo.getOrCreate(db, 1, 'Darth Vader');
    const hits = unionSearch(db, 'dar');
    expect(hits.some((h) => h.title === 'Darth Vader')).toBe(true);
  });
});
