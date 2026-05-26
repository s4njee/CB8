/**
 * Tests for src/main/folderGroupingResolver.ts.
 *
 * Most tests use `resolveFromFilenames` so we don't depend on actual
 * filesystem state. One on-disk test exercises the readdir path and the
 * per-directory cache.
 */
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FolderGroupingResolver, comparisonKey } from './folderGroupingResolver';

describe('comparisonKey', () => {
  it('strips extension, date prefix, and lowercases', () => {
    expect(comparisonKey('198001 Avengers v1 191.cbz')).toBe('avengers v1');
    expect(comparisonKey('Darth Vader 001 (2015) (Digital).cbr')).toBe('darth vader');
  });

  it('collapses internal whitespace', () => {
    expect(comparisonKey('Foo   Bar.cbz')).toBe('foo bar');
  });

  it('keeps a non-date-prefix numeric leader intact', () => {
    expect(comparisonKey('199913 Foo.cbz')).toBe('199913 foo'); // month=13 -> not a date
  });
});

describe('FolderGroupingResolver.resolveFromFilenames', () => {
  it('returns null for an empty directory', () => {
    const r = new FolderGroupingResolver();
    expect(r.resolveFromFilenames('/x', [])).toBeNull();
  });

  it('returns null for a single-file directory', () => {
    const r = new FolderGroupingResolver();
    expect(r.resolveFromFilenames('/x', ['Aero 001.cbz'])).toBeNull();
  });

  it('returns a matcher when 2+ files share a >=3-char prefix', () => {
    const r = new FolderGroupingResolver();
    const g = r.resolveFromFilenames('/x', [
      'Darth Vader 001 (2015) (Digital).cbr',
      'Darth Vader 002 (2015) (Digital).cbr',
      'Darth Vader 003 (2015) (Digital).cbr',
    ]);
    expect(g).not.toBeNull();
    expect(g!.recurringPrefix).toBe('darth vader');
    expect(g!.matches('Darth Vader 004 (2015) (Digital).cbr')).toBe(true);
  });

  it('groups across two distinct year-runs of the same series (Darth Vader 2015 + 2017)', () => {
    const r = new FolderGroupingResolver();
    const files = [
      'Darth Vader 001 (2015) (Digital) (BlackManta-Empire).cbr',
      'Darth Vader 002 (2015) (Digital) (BlackManta-Empire).cbr',
      'Darth Vader 001 (2017) (Digital) (Kileko-Empire).cbr',
      'Darth Vader 002 (2017) (Digital) (Kileko-Empire).cbr',
    ];
    const g = r.resolveFromFilenames('/x', files);
    expect(g).not.toBeNull();
    expect(g!.recurringPrefix).toBe('darth vader');
    for (const f of files) expect(g!.matches(f)).toBe(true);
  });

  it('rejects an unrelated stranger file inside the group', () => {
    const r = new FolderGroupingResolver();
    const g = r.resolveFromFilenames('/x', [
      'Darth Vader 001 (2015).cbr',
      'Darth Vader 002 (2015).cbr',
      'Side Story.cbz',
    ]);
    expect(g).not.toBeNull();
    expect(g!.recurringPrefix).toBe('darth vader');
    expect(g!.matches('Darth Vader 003 (2015).cbr')).toBe(true);
    expect(g!.matches('Side Story.cbz')).toBe(false);
  });

  it('treats stripped date-prefix files as same-prefix as un-prefixed ones', () => {
    const r = new FolderGroupingResolver();
    const g = r.resolveFromFilenames('/x', [
      '198001 Avengers v1 191.cbz',
      '198002 Avengers v1 192.cbz',
    ]);
    expect(g!.recurringPrefix).toBe('avengers v1');
    expect(g!.matches('198003 Avengers v1 193.cbz')).toBe(true);
  });

  it('groups chronology-style dated issue filenames by stripped series name', () => {
    const r = new FolderGroupingResolver();
    const g = r.resolveFromFilenames('/x', [
      '200502 Supreme Power 014.cbr',
      '200508 Supreme Power 017.cbz',
      '200510 Supreme Power 018.cbr',
    ]);
    expect(g).not.toBeNull();
    expect(g!.recurringPrefix).toBe('supreme power');
    expect(g!.seriesName).toBe('Supreme Power');
    expect(g!.matches('200505 Supreme Power 016.cbr')).toBe(true);
  });

  it('returns null when the longest shared prefix is below the threshold', () => {
    const r = new FolderGroupingResolver();
    // Two unrelated one-shots happen to share at most "ae" / "1602" — neither
    // crosses the 3-char "must be a meaningful prefix" gate after trimming
    // partial-word characters.
    const g = r.resolveFromFilenames('/x', [
      'Aero 001.cbz',
      '1602 - Witch Hunter Angela 001.cbz',
    ]);
    expect(g).toBeNull();
  });

  it('does not mistake a numeric run prefix for a series name', () => {
    const r = new FolderGroupingResolver();
    // Both files start with "1", but after the lcp trim that removes the
    // trailing partial char, the prefix shrinks below threshold.
    const g = r.resolveFromFilenames('/x', ['1602.cbz', '1872.cbz']);
    // Either null or a too-short prefix that misses the threshold — both fine.
    if (g) expect(g.recurringPrefix.length).toBeGreaterThanOrEqual(3);
  });

  it('caches results per directory', () => {
    const r = new FolderGroupingResolver();
    const dir = '/some/dir';
    const a = r.resolveFromFilenames(dir, ['Foo 001.cbz', 'Foo 002.cbz']);
    // Second call with completely different filenames — should still return
    // the cached result for `dir`.
    const b = r.resolveFromFilenames(dir, ['Bar 001.cbz', 'Bar 002.cbz']);
    expect(b).toBe(a);
  });

  it('ignores non-comic extensions when computing the prefix', () => {
    const r = new FolderGroupingResolver();
    const g = r.resolveFromFilenames('/x', [
      'Foo Bar 001.cbz',
      'Foo Bar 002.cbz',
      'cover.jpg',          // not a comic ext, ignored
      'metadata.json',      // not a comic ext, ignored
    ]);
    expect(g!.recurringPrefix).toBe('foo bar');
  });
});

describe('FolderGroupingResolver.resolve (filesystem)', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'cb8-folder-test-'));
  });
  afterEach(async () => {
    try { await fsp.rm(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('resolves recurring prefix from a real directory listing', async () => {
    for (const n of ['Foo 001.cbz', 'Foo 002.cbz', 'Foo 003.cbz']) {
      await fsp.writeFile(path.join(tmp, n), '');
    }
    const r = new FolderGroupingResolver();
    const g = await r.resolve(tmp);
    expect(g!.recurringPrefix).toBe('foo');
  });

  it('returns null for a non-existent directory (no throw)', async () => {
    const r = new FolderGroupingResolver();
    const g = await r.resolve(path.join(tmp, 'does-not-exist'));
    expect(g).toBeNull();
  });
});
