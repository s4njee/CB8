/**
 * Tests for src/main/metadataResolver.ts. The precedence chain is
 * driven directly via the `comicInfo` injection so tests don't need
 * real archive files; one disk-backed fixture exercises folder grouping
 * end-to-end.
 */
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, isUnderOneShot } from './metadataResolver';
import { FolderGroupingResolver } from './folderGroupingResolver';
import type { ComicInfo } from './comicInfoParser';

function ci(over: Partial<ComicInfo> = {}): ComicInfo {
  return {
    series: null, volume: null, number: null, title: null, summary: null,
    publisher: null, language: null, year: null, month: null, pageCount: null,
    ageRating: 'unknown', pages: [], raw: {},
    ...over,
  };
}

describe('isUnderOneShot', () => {
  it('matches "one-shot"', () => {
    expect(isUnderOneShot('/lib/one-shot/Foo/foo.cbz', '/lib')).toBe(true);
  });
  it('matches "oneshot"', () => {
    expect(isUnderOneShot('/lib/oneshot/foo.cbz', '/lib')).toBe(true);
  });
  it('matches "one shot"', () => {
    expect(isUnderOneShot('/lib/one shot/foo.cbz', '/lib')).toBe(true);
  });
  it('is case-insensitive', () => {
    expect(isUnderOneShot('/lib/ONE-SHOT/foo.cbz', '/lib')).toBe(true);
    expect(isUnderOneShot('/lib/One-Shot/foo.cbz', '/lib')).toBe(true);
  });
  it('does not match a file literally named "one-shot.cbz"', () => {
    expect(isUnderOneShot('/lib/Series/one-shot.cbz', '/lib')).toBe(false);
  });
  it('does not match unrelated names', () => {
    expect(isUnderOneShot('/lib/Avengers v1/foo.cbz', '/lib')).toBe(false);
    expect(isUnderOneShot('/lib/oneshots/foo.cbz', '/lib')).toBe(false); // plural
  });
  it('returns false when the file is not under the library root', () => {
    expect(isUnderOneShot('/elsewhere/one-shot/foo.cbz', '/lib')).toBe(false);
  });
});

describe('metadataResolver.resolve precedence', () => {
  // Use a dedicated tmp dir so test files exist and folderGrouping has
  // real siblings to scan.
  let lib: string;
  beforeEach(async () => { lib = await fsp.mkdtemp(path.join(os.tmpdir(), 'cb8-meta-')); });
  afterEach(async () => { try { await fsp.rm(lib, { recursive: true, force: true }); } catch { /* ignore */ } });

  async function place(rel: string): Promise<string> {
    const full = path.join(lib, rel);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, '');
    return full;
  }

  it('ComicInfo wins over folder vN for series and volume', async () => {
    const file = await place('Avengers v1/Avengers 191.cbz');
    const md = await resolve(file, {
      libraryRoot: lib,
      comicInfo: ci({ series: 'Iron Man', volume: 5, number: 100 }),
    });
    expect(md.seriesName).toBe('Iron Man');
    expect(md.volumeNumber).toBe(5);
    expect(md.chapterNumber).toBe(100);
    expect(md.isStandalone).toBe(false);
  });

  it('falls through to folder vN when ComicInfo lacks the field', async () => {
    const file = await place('Avengers v3/Avengers 003.cbz');
    const md = await resolve(file, {
      libraryRoot: lib,
      comicInfo: ci({ title: 'A Title' }), // no series/volume in ComicInfo
    });
    expect(md.seriesName).toBe('Avengers');
    expect(md.volumeNumber).toBe(3);
    expect(md.title).toBe('A Title');
  });

  it('folder grouping fills the series name when no vN suffix', async () => {
    // Two sibling files so folder grouping triggers.
    await place('Darth Vader/Darth Vader 001.cbz');
    const file = await place('Darth Vader/Darth Vader 002.cbz');
    const md = await resolve(file, {
      libraryRoot: lib,
      comicInfo: null,
      folderGrouping: new FolderGroupingResolver(),
    });
    expect(md.seriesName).toBe('Darth Vader');
  });

  it('folder grouping does NOT apply inside the one-shot container', async () => {
    // Even with sibling-name similarity, a comic inside one-shot/ stays standalone.
    await place('one-shot/100th Anniversary Special/100th Anniversary Special 001.cbz');
    const sibling = await place(
      'one-shot/100th Anniversary Special/100th Anniversary Special 002.cbz',
    );
    // Note: parseSeriesFromFilename will hit the chapter pattern and try to
    // produce a series. That's OK — the *grouping* signal is suppressed,
    // but R-19 says the file is standalone unless ComicInfo says otherwise.
    const md = await resolve(sibling, {
      libraryRoot: lib,
      comicInfo: null,
      folderGrouping: new FolderGroupingResolver(),
    });
    expect(md.isStandalone).toBe(true);
  });

  it('YYYYMM filename prefix is captured as publication date', async () => {
    const file = await place('Avengers v1/198001 Avengers v1 191.cbz');
    const md = await resolve(file, { libraryRoot: lib, comicInfo: null });
    expect(md.publicationYear).toBe(1980);
    expect(md.publicationMonth).toBe(1);
  });

  it('ComicInfo year/month overrides the filename date prefix', async () => {
    const file = await place('Foo/198001 Foo 1.cbz');
    const md = await resolve(file, {
      libraryRoot: lib,
      comicInfo: ci({ series: 'Foo', year: 2020, month: 5 }),
    });
    expect(md.publicationYear).toBe(2020);
    expect(md.publicationMonth).toBe(5);
  });

  it('strips YYYYMM before chapter parsing so the trailing number is found', async () => {
    const file = await place('Avengers v1/198001 Avengers v1 191.cbz');
    const md = await resolve(file, { libraryRoot: lib, comicInfo: null });
    expect(md.seriesName).toBe('Avengers');
    expect(md.volumeNumber).toBe(1);
    expect(md.chapterNumber).toBe(191);
  });

  it('groups dated issue filenames under the stripped series name', async () => {
    await place('Supreme Power/200502 Supreme Power 014.cbr');
    const file = await place('Supreme Power/200508 Supreme Power 017.cbz');
    const md = await resolve(file, {
      libraryRoot: lib,
      comicInfo: null,
      folderGrouping: new FolderGroupingResolver(),
    });
    expect(md.seriesName).toBe('Supreme Power');
    expect(md.volumeNumber).toBeNull();
    expect(md.chapterNumber).toBe(17);
    expect(md.isStandalone).toBe(false);
  });

  it('one-shot guard alone (no ComicInfo) produces standalone', async () => {
    const file = await place('one-shot/Aero/Aero 001.cbz');
    const md = await resolve(file, { libraryRoot: lib, comicInfo: null });
    expect(md.isStandalone).toBe(true);
  });

  it('ComicInfo with <Series> rescues a one-shot file from standalone', async () => {
    const file = await place('one-shot/Aero/Aero 001.cbz');
    const md = await resolve(file, {
      libraryRoot: lib,
      comicInfo: ci({ series: 'Aero (Volume 1)', number: 1 }),
    });
    expect(md.isStandalone).toBe(false);
    expect(md.seriesName).toBe('Aero (Volume 1)');
    expect(md.chapterNumber).toBe(1);
  });

  it('a comic with no series signal anywhere is standalone', async () => {
    const file = await place('lone.cbz');
    const md = await resolve(file, { libraryRoot: lib, comicInfo: null });
    expect(md.isStandalone).toBe(true);
    expect(md.seriesName).toBeNull();
  });

  it('attaches the raw ComicInfo as comicinfoJson', async () => {
    const file = await place('Foo/Foo 1.cbz');
    const md = await resolve(file, {
      libraryRoot: lib,
      comicInfo: ci({ series: 'Foo', raw: { writer: 'Jane Doe', genre: 'Sci-Fi' } }),
    });
    expect(md.comicinfoJson).not.toBeNull();
    const parsed = JSON.parse(md.comicinfoJson!);
    expect(parsed.writer).toBe('Jane Doe');
  });

  it('reuses the FolderGroupingResolver cache across calls', async () => {
    await place('Bar/Bar 001.cbz');
    const a = await place('Bar/Bar 002.cbz');
    const b = await place('Bar/Bar 003.cbz');
    const fg = new FolderGroupingResolver();
    const md1 = await resolve(a, { libraryRoot: lib, comicInfo: null, folderGrouping: fg });
    const md2 = await resolve(b, { libraryRoot: lib, comicInfo: null, folderGrouping: fg });
    expect(md1.seriesName).toBe('Bar');
    expect(md2.seriesName).toBe('Bar');
  });
});
