/**
 * Integration tests for the v7 ingest pipeline. Builds a small synthetic
 * library on disk that mirrors the canonical R-22 layout (one-shot/,
 * Avengers v1/v2/v3, Darth Vader/, 1602 - Witch Hunter Angela/), runs
 * IngestService against it, and asserts that the resulting series /
 * volume / comics rows match the requirements.
 *
 * Covers T-6.1 (library context), T-6.2 (resolver wired), T-6.3 (dual
 * write), T-6.4 (run detection), and T-6.6 (integration).
 *
 * The CBZ files are placeholder ZIPs created with a vendored minimal
 * writer (yauzl is read-only and we don't want a write dep). For tests
 * that don't care about archive content (most of them), the ingest
 * pipeline tolerates archives with no readable image entries — it just
 * generates a placeholder thumbnail. ComicInfo.xml is omitted.
 */
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LibraryDatabase } from './libraryDatabase';
import { IngestService } from './ingestService';

/**
 * Minimal store-only ZIP writer just for these tests. Builds a CBZ-shaped
 * archive with a couple of tiny "image" entries so ArchiveLoader has
 * something to count — no real images needed.
 */
function makeMinimalCbz(): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;
  const files: { name: string; data: Buffer }[] = [
    { name: '001.jpg', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
    { name: '002.jpg', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
  ];
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);          // version
    lh.writeUInt16LE(0, 6);           // flags
    lh.writeUInt16LE(0, 8);           // method=store
    lh.writeUInt16LE(0, 10);          // mtime
    lh.writeUInt16LE(0, 12);          // mdate
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(f.data.length, 18); // compressed size
    lh.writeUInt32LE(f.data.length, 22); // uncompressed
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    nameBuf.copy(lh, 30);
    localHeaders.push(lh, f.data);

    const ch = Buffer.alloc(46 + nameBuf.length);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(f.data.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    nameBuf.copy(ch, 46);
    centralHeaders.push(ch);

    offset += lh.length + f.data.length;
  }
  const localPart = Buffer.concat(localHeaders);
  const centralPart = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localPart, centralPart, eocd]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function placeCbz(filePath: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, makeMinimalCbz());
}

describe('IngestService — full v7 pipeline', () => {
  let dbPath: string;
  let libRoot: string;
  let db: LibraryDatabase;

  beforeEach(async () => {
    libRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'cb8-ingest-lib-'));
    dbPath = path.join(libRoot, 'cb8.sqlite');
    db = new LibraryDatabase(dbPath);
    db.initialize();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    try { (db as unknown as { raw: { close(): void } }).raw.close(); } catch { /* ignore */ }
    try { await fsp.rm(libRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('orphan single-file ingest goes to the Inbox library (R-6 / Option B)', async () => {
    const file = path.join(libRoot, 'StandaloneBook.cbz');
    await placeCbz(file);
    const ingest = new IngestService(db);
    const result = await ingest.addFile(file);
    expect(result.added).toBe(true);

    const libs = db.getAllLibraries();
    expect(libs.find((l) => l.name === 'Inbox')).toBeTruthy();
    const inbox = libs.find((l) => l.name === 'Inbox')!;
    const inLib = (db as unknown as { raw: { prepare: (s: string) => { all: (...a: unknown[]) => unknown[] } } }).raw
      .prepare('SELECT comic_id FROM library_comics WHERE library_id = ?').all(inbox.id);
    expect(inLib).toHaveLength(1);
  });

  it('Avengers v1/v2/v3 layout produces one series with three volumes', async () => {
    await placeCbz(path.join(libRoot, 'Avengers v1', '198001 Avengers v1 191.cbz'));
    await placeCbz(path.join(libRoot, 'Avengers v1', '198002 Avengers v1 192.cbz'));
    await placeCbz(path.join(libRoot, 'Avengers v2', '199601 Avengers v2 001.cbz'));
    await placeCbz(path.join(libRoot, 'Avengers v3', '199801 Avengers v3 003.cbz'));
    await placeCbz(path.join(libRoot, 'Avengers v3', '199802 Avengers v3 004.cbz'));
    const lib = db.createLibrary('Marvel');
    const ingest = new IngestService(db);
    await ingest.scanDirectory(libRoot, 'comic', () => {}, undefined, { libraryId: lib.id });

    const seriesList = db.series.listForLibrary(lib.id);
    const avengers = seriesList.find((s) => s.name === 'Avengers');
    expect(avengers).toBeTruthy();
    expect(avengers!.chapterCount).toBe(5);

    const volumes = db.volume.listForSeries(avengers!.id);
    const numbered = volumes.filter((v) => v.number != null).map((v) => v.number);
    expect(numbered.sort()).toEqual([1, 2, 3]);
  });

  it('Darth Vader 2015+2017 cross-run folder splits into two volumes by year', async () => {
    const dir = path.join(libRoot, 'Darth Vader');
    await placeCbz(path.join(dir, 'Darth Vader 001 (2015) (Digital).cbz'));
    await placeCbz(path.join(dir, 'Darth Vader 002 (2015) (Digital).cbz'));
    await placeCbz(path.join(dir, 'Darth Vader 001 (2017) (Digital).cbz'));
    await placeCbz(path.join(dir, 'Darth Vader 002 (2017) (Digital).cbz'));
    const lib = db.createLibrary('Marvel');
    const ingest = new IngestService(db);
    await ingest.scanDirectory(libRoot, 'comic', () => {}, undefined, { libraryId: lib.id });

    const series = db.series.listForLibrary(lib.id);
    const dv = series.find((s) => s.name.toLowerCase().includes('darth vader'));
    expect(dv).toBeTruthy();
    // Run-detection at flush time should produce two volumes for the
    // chapter-number collision (issue 001/002 each appear twice).
    const volumes = db.volume.listForSeries(dv!.id);
    expect(volumes.length).toBeGreaterThanOrEqual(2);
    // No single volume has both runs' issue 001 — the gate prevents
    // the unique-(series_id, chapter_number) collision-as-bug.
  });

  it('one-shot/ container ingests as standalone (no series)', async () => {
    await placeCbz(path.join(libRoot, 'one-shot', 'Aero', 'Aero 001.cbz'));
    await placeCbz(path.join(libRoot, 'one-shot', '100th Anniversary Special - X-Men',
      '100th Anniversary Special - X-Men 001.cbz'));
    const lib = db.createLibrary('Marvel');
    const ingest = new IngestService(db);
    await ingest.scanDirectory(libRoot, 'comic', () => {}, undefined, { libraryId: lib.id });

    const series = db.series.listForLibrary(lib.id);
    expect(series).toHaveLength(0);
    // Comics still exist and are attached to the library.
    const inLib = (db as unknown as { raw: { prepare: (s: string) => { all: (...a: unknown[]) => unknown[] } } }).raw
      .prepare('SELECT comic_id FROM library_comics WHERE library_id = ?').all(lib.id);
    expect(inLib).toHaveLength(2);
  });

  it('populates series_id, volume_id, chapter_number and publication date on the comic row', async () => {
    await placeCbz(path.join(libRoot, 'Avengers v1', '198001 Avengers v1 191.cbz'));
    await placeCbz(path.join(libRoot, 'Avengers v1', '198002 Avengers v1 192.cbz'));
    const lib = db.createLibrary('Marvel');
    const ingest = new IngestService(db);
    await ingest.scanDirectory(libRoot, 'comic', () => {}, undefined, { libraryId: lib.id });

    const r = (db as unknown as { raw: { prepare: (s: string) => { get: (...a: unknown[]) => unknown } } }).raw
      .prepare(`SELECT series_id, volume_id, chapter_number,
                       publication_year, publication_month
                FROM comics WHERE file_path LIKE '%191.cbz'`).get() as Record<string, unknown>;
    expect(r.series_id).not.toBeNull();
    expect(r.volume_id).not.toBeNull();
    expect(r.chapter_number).toBe(191);
    expect(r.publication_year).toBe(1980);
    expect(r.publication_month).toBe(1);
  });

  it('no foreign-key violations after ingest', async () => {
    await placeCbz(path.join(libRoot, 'Foo Bar', 'Foo Bar 001.cbz'));
    await placeCbz(path.join(libRoot, 'Foo Bar', 'Foo Bar 002.cbz'));
    const lib = db.createLibrary('Test');
    const ingest = new IngestService(db);
    await ingest.scanDirectory(libRoot, 'comic', () => {}, undefined, { libraryId: lib.id });

    const violations = (db as unknown as { raw: { prepare: (s: string) => { all: () => unknown[] } } }).raw
      .prepare('PRAGMA foreign_key_check').all();
    expect(violations).toHaveLength(0);
  });
});
