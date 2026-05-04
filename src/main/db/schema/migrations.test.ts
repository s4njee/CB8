/**
 * Tests for the schema bootstrap path. Project is green-field at v1, so
 * there's no upgrade chain to test — instead we verify that opening a
 * fresh DB produces the expected shape and that the FTS triggers stay
 * in sync on writes.
 */
import Database from 'better-sqlite3';
import { describe, it, expect, vi } from 'vitest';
import { SCHEMA } from './create';
import { initializeVersion, migrateSchema } from './migrations';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  initializeVersion(db);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  return db;
}

describe('schema bootstrap', () => {
  it('pins app_meta.schema_version to 1', () => {
    const db = freshDb();
    const v = (db.prepare(`SELECT value FROM app_meta WHERE key = 'schema_version'`).get() as { value: string }).value;
    expect(v).toBe('1');
  });

  it('passes PRAGMA foreign_key_check on a fresh DB', () => {
    const db = freshDb();
    expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
  });

  it('exposes the v7 hierarchy tables (series, volume) and the legacy columns are gone', () => {
    const db = freshDb();
    const tables = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all() as { name: string }[]).map((r) => r.name);
    expect(tables).toContain('series');
    expect(tables).toContain('volume');

    const comicCols = (db.prepare('PRAGMA table_info(comics)').all() as { name: string }[]).map((c) => c.name);
    expect(comicCols).not.toContain('series_name');
    expect(comicCols).not.toContain('volume_number');
    expect(comicCols).toContain('chapter_number');
    expect(comicCols).toContain('series_id');
    expect(comicCols).toContain('volume_id');
    expect(comicCols).toContain('deleted_at');
  });

  it('sets up the partial unique indexes that gate volume uniqueness', () => {
    const db = freshDb();
    db.exec(`INSERT INTO libraries (id, name) VALUES (1, 'L');`);
    db.prepare(`INSERT INTO series (library_id, name, sort_name) VALUES (1, 'S', 's')`).run();
    db.prepare(`INSERT INTO volume (series_id, number) VALUES (1, NULL)`).run();
    expect(() =>
      db.prepare(`INSERT INTO volume (series_id, number) VALUES (1, NULL)`).run()
    ).toThrow(/UNIQUE/);
    db.prepare(`INSERT INTO volume (series_id, number) VALUES (1, 1)`).run();
    expect(() =>
      db.prepare(`INSERT INTO volume (series_id, number) VALUES (1, 1)`).run()
    ).toThrow(/UNIQUE/);
  });

  it('migrateSchema is a no-op when called on an already-initialised DB', () => {
    const db = freshDb();
    const before = (db.prepare('SELECT COUNT(*) AS c FROM sqlite_master').get() as { c: number }).c;
    migrateSchema(db);
    migrateSchema(db);
    const after = (db.prepare('SELECT COUNT(*) AS c FROM sqlite_master').get() as { c: number }).c;
    expect(after).toBe(before);
  });
});

describe('comics_fts triggers', () => {
  it('fts row count matches comics row count after inserts/updates/deletes', () => {
    const db = freshDb();
    db.prepare(`
      INSERT INTO comics (id, file_path, title, page_count, file_size, author, summary)
      VALUES (1, '/a/x.cbz', 'X', 1, 1, 'Jane', 'Foo')
    `).run();
    let hits = db.prepare(`SELECT title FROM comics_fts WHERE comics_fts MATCH 'jane'`).all() as { title: string }[];
    expect(hits.map((h) => h.title)).toContain('X');

    db.prepare(`UPDATE comics SET author = 'Mary' WHERE id = 1`).run();
    hits = db.prepare(`SELECT title FROM comics_fts WHERE comics_fts MATCH 'jane'`).all() as { title: string }[];
    expect(hits.map((h) => h.title)).not.toContain('X');
    hits = db.prepare(`SELECT title FROM comics_fts WHERE comics_fts MATCH 'mary'`).all() as { title: string }[];
    expect(hits.map((h) => h.title)).toContain('X');

    db.prepare(`DELETE FROM comics WHERE id = 1`).run();
    hits = db.prepare(`SELECT title FROM comics_fts WHERE comics_fts MATCH 'mary'`).all() as { title: string }[];
    expect(hits).toHaveLength(0);
  });
});

describe('series_fts triggers', () => {
  it('fts row count tracks series row count on insert/update/delete', () => {
    const db = freshDb();
    db.exec(`INSERT INTO libraries (id, name) VALUES (1, 'L');`);
    db.prepare(`INSERT INTO series (library_id, name, sort_name) VALUES (1, 'Brave New', 'brave new')`).run();
    let hits = db.prepare(`SELECT name FROM series_fts WHERE series_fts MATCH 'brave'`).all() as { name: string }[];
    expect(hits.map((h) => h.name)).toContain('Brave New');

    const id = (db.prepare(`SELECT id FROM series WHERE name = 'Brave New'`).get() as { id: number }).id;
    db.prepare(`UPDATE series SET name = 'Brave Old' WHERE id = ?`).run(id);
    hits = db.prepare(`SELECT name FROM series_fts WHERE series_fts MATCH 'brave'`).all() as { name: string }[];
    expect(hits.map((h) => h.name)).toContain('Brave Old');
    expect(hits.map((h) => h.name)).not.toContain('Brave New');

    db.prepare(`DELETE FROM series WHERE id = ?`).run(id);
    hits = db.prepare(`SELECT name FROM series_fts WHERE series_fts MATCH 'brave'`).all() as { name: string }[];
    expect(hits.map((h) => h.name)).not.toContain('Brave Old');
  });
});
