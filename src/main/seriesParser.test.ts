import { describe, it, expect } from 'vitest';
import {
  parseSeriesFromFilename,
  normalizeSeriesName,
  computeSortName,
  parseFolderVolumeMarker,
  stripDatePrefix,
  chronologyGroupingName,
} from './seriesParser';

describe('parseSeriesFromFilename', () => {
  describe('volume markers', () => {
    it('parses "Title v01"', () => {
      expect(parseSeriesFromFilename('Berserk v01.cbz')).toEqual({
        seriesName: 'Berserk', volumeNumber: 1, chapterNumber: null,
      });
    });

    it('parses "Title Vol. 3"', () => {
      expect(parseSeriesFromFilename('Vinland Saga - Vol. 12.cbz')).toEqual({
        seriesName: 'Vinland Saga', volumeNumber: 12, chapterNumber: null,
      });
    });

    it('parses "Title Volume 5"', () => {
      expect(parseSeriesFromFilename('One Piece Volume 5.cbz')).toEqual({
        seriesName: 'One Piece', volumeNumber: 5, chapterNumber: null,
      });
    });

    it('parses decimal volume numbers', () => {
      expect(parseSeriesFromFilename('Title v1.5.cbz')).toMatchObject({
        seriesName: 'Title', volumeNumber: 1.5,
      });
    });
  });

  describe('chapter markers', () => {
    it('parses "Title #005"', () => {
      expect(parseSeriesFromFilename('Saga #005.cbz')).toEqual({
        seriesName: 'Saga', volumeNumber: null, chapterNumber: 5,
      });
    });

    it('parses "Title c001"', () => {
      expect(parseSeriesFromFilename('Attack on Titan c139.cbz')).toEqual({
        seriesName: 'Attack on Titan', volumeNumber: null, chapterNumber: 139,
      });
    });

    it('parses "Title Ch. 12"', () => {
      expect(parseSeriesFromFilename('Title Ch. 12.cbz')).toMatchObject({
        seriesName: 'Title', chapterNumber: 12,
      });
    });

    it('parses chapter range as the starting chapter', () => {
      expect(parseSeriesFromFilename('Bleach c001-005.cbz')).toEqual({
        seriesName: 'Bleach', volumeNumber: null, chapterNumber: 1,
      });
    });
  });

  describe('combined volume + chapter', () => {
    it('parses "Title Vol. 3 Ch. 12"', () => {
      expect(parseSeriesFromFilename('Title Vol. 3 Ch. 12.cbz')).toEqual({
        seriesName: 'Title', volumeNumber: 3, chapterNumber: 12,
      });
    });

    it('parses "Title v01 c001"', () => {
      expect(parseSeriesFromFilename('Naruto v01 c001.cbz')).toEqual({
        seriesName: 'Naruto', volumeNumber: 1, chapterNumber: 1,
      });
    });
  });

  describe('year stripping', () => {
    it('strips "(2020)" before chapter marker', () => {
      expect(parseSeriesFromFilename('Title (2020) #01.cbz')).toEqual({
        seriesName: 'Title', volumeNumber: null, chapterNumber: 1,
      });
    });
  });

  describe('scanlation group tag', () => {
    it('strips a leading "[Group]" tag', () => {
      expect(parseSeriesFromFilename('[Stick] Berserk v01.cbz')).toEqual({
        seriesName: 'Berserk', volumeNumber: 1, chapterNumber: null,
      });
    });

    it('strips a leading "(Group)" tag', () => {
      expect(parseSeriesFromFilename('(Group) Title v03.cbz')).toEqual({
        seriesName: 'Title', volumeNumber: 3, chapterNumber: null,
      });
    });
  });

  describe('trailing metadata tags', () => {
    it('strips "(Digital)" between series and volume', () => {
      // metadata after volume is already excluded by the cut, but this covers
      // the case where tags appear before the first marker.
      expect(parseSeriesFromFilename('Title (Group) v03.cbz')).toEqual({
        seriesName: 'Title', volumeNumber: 3, chapterNumber: null,
      });
    });

    it('strips multiple trailing tags', () => {
      expect(parseSeriesFromFilename('Title (Group) (Digital) v03.cbz')).toEqual({
        seriesName: 'Title', volumeNumber: 3, chapterNumber: null,
      });
    });
  });

  describe('filename normalization', () => {
    it('replaces underscores with spaces', () => {
      expect(parseSeriesFromFilename('Attack_on_Titan_c139.cbz')).toEqual({
        seriesName: 'Attack on Titan', volumeNumber: null, chapterNumber: 139,
      });
    });

    it('strips trailing separators', () => {
      expect(parseSeriesFromFilename('Title - v01.cbz')).toEqual({
        seriesName: 'Title', volumeNumber: 1, chapterNumber: null,
      });
    });
  });

  describe('series with numeric names', () => {
    it('does not eat digits in "7SEEDS"', () => {
      expect(parseSeriesFromFilename('7SEEDS v04.cbz')).toEqual({
        seriesName: '7SEEDS', volumeNumber: 4, chapterNumber: null,
      });
    });

    it('does not eat digits in "20th Century Boys"', () => {
      expect(parseSeriesFromFilename('20th Century Boys v01.cbz')).toEqual({
        seriesName: '20th Century Boys', volumeNumber: 1, chapterNumber: null,
      });
    });
  });

  describe('no-match fallback', () => {
    it('returns all-null for a bare title', () => {
      expect(parseSeriesFromFilename('Standalone Book.cbz')).toEqual({
        seriesName: null, volumeNumber: null, chapterNumber: null,
      });
    });

    it('parses Marvel-style "Series 001" bare trailing chapter (R-21)', () => {
      // Pre-v7 this was deliberately unmatched; R-21 promotes the trailing
      // 1-3 digit token (with whitespace before, no v/c/ch/# prefix) to
      // a chapter number. Constrained to 1-3 digits so a 4-digit year-style
      // suffix (`Doom 2099`) stays in the series name.
      expect(parseSeriesFromFilename('Bleach 001.cbz')).toEqual({
        seriesName: 'Bleach', volumeNumber: null, chapterNumber: 1,
      });
    });

    it('does NOT mistake a 4-digit number for a chapter ("Doom 2099")', () => {
      expect(parseSeriesFromFilename('Doom 2099.cbz')).toEqual({
        seriesName: null, volumeNumber: null, chapterNumber: null,
      });
    });

    it('parses Marvel-style "Series 001 (year)" with year tag stripped', () => {
      expect(parseSeriesFromFilename('Darth Vader 001 (2015) (Digital).cbz')).toMatchObject({
        seriesName: 'Darth Vader',
        chapterNumber: 1,
      });
    });

    it('returns all-null for empty input', () => {
      expect(parseSeriesFromFilename('')).toEqual({
        seriesName: null, volumeNumber: null, chapterNumber: null,
      });
    });
  });
});

describe('normalizeSeriesName', () => {
  it('collapses internal whitespace', () => {
    expect(normalizeSeriesName('One   Piece')).toBe('One Piece');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeSeriesName('  Berserk  ')).toBe('Berserk');
  });
});

describe('chronologyGroupingName', () => {
  it('drops a leading YYYYMM date and trailing issue number', () => {
    expect(chronologyGroupingName('200502 Supreme Power 014.cbr')).toBe('Supreme Power');
    expect(chronologyGroupingName('200508 Supreme Power 017.cbz')).toBe('Supreme Power');
  });

  it('keeps dated names with no trailing issue as their stripped title', () => {
    expect(chronologyGroupingName('200502 Supreme Power')).toBe('Supreme Power');
  });

  it('drops cover-count suffixes after a dated name', () => {
    expect(chronologyGroupingName('200310 Supreme Power v1 001 02 of 02 covers.cbr')).toBe('Supreme Power v1');
  });
});

describe('computeSortName', () => {
  it('lowercases via en-US locale and collapses whitespace', () => {
    expect(computeSortName('Foo BAR  baz')).toBe('foo bar baz');
  });

  it('zero-pads runs of digits to 10 places for natural sort', () => {
    // Lexical sort puts "Volume 10" before "Volume 2" without padding.
    const v2  = computeSortName('Volume 2');
    const v10 = computeSortName('Volume 10');
    expect(v2 < v10).toBe(true);
    expect(v2).toBe('volume 0000000002');
    expect(v10).toBe('volume 0000000010');
  });

  it('pads multiple digit runs independently', () => {
    expect(computeSortName('Doom 2099 v1')).toBe('doom 0000002099 v0000000001');
  });

  it('returns empty string for nullish or empty input', () => {
    expect(computeSortName(null)).toBe('');
    expect(computeSortName(undefined)).toBe('');
    expect(computeSortName('')).toBe('');
    expect(computeSortName('   ')).toBe('');
  });

  it('produces a comparable ordering for the Avengers v1/v2/v3 group', () => {
    const sorted = ['Avengers v3', 'Avengers v1', 'Avengers v2', 'Avengers v10']
      .map((n) => ({ n, k: computeSortName(n) }))
      .sort((a, b) => a.k.localeCompare(b.k))
      .map((x) => x.n);
    expect(sorted).toEqual(['Avengers v1', 'Avengers v2', 'Avengers v3', 'Avengers v10']);
  });
});

describe('parseFolderVolumeMarker', () => {
  it('parses simple "X v1" forms', () => {
    expect(parseFolderVolumeMarker('Avengers v1')).toEqual({ seriesName: 'Avengers', volumeNumber: 1 });
    expect(parseFolderVolumeMarker('Captain America v3')).toEqual({ seriesName: 'Captain America', volumeNumber: 3 });
    expect(parseFolderVolumeMarker('Iron Man v10')).toEqual({ seriesName: 'Iron Man', volumeNumber: 10 });
  });

  it('parses series with internal numbers ("Doom 2099 v1")', () => {
    expect(parseFolderVolumeMarker('Doom 2099 v1')).toEqual({ seriesName: 'Doom 2099', volumeNumber: 1 });
  });

  it('is case-insensitive on the v', () => {
    expect(parseFolderVolumeMarker('Avengers V2')).toEqual({ seriesName: 'Avengers', volumeNumber: 2 });
  });

  it('trims surrounding whitespace before matching', () => {
    expect(parseFolderVolumeMarker('  Avengers v1  ')).toEqual({ seriesName: 'Avengers', volumeNumber: 1 });
  });

  it('rejects "vs" since digits do not follow', () => {
    expect(parseFolderVolumeMarker('Avengers vs Pet Avengers')).toBeNull();
    expect(parseFolderVolumeMarker('Avengers vs X-Men Program')).toBeNull();
  });

  it('rejects names with no v marker', () => {
    expect(parseFolderVolumeMarker('Avengers Forever')).toBeNull();
    expect(parseFolderVolumeMarker('1602')).toBeNull();
    expect(parseFolderVolumeMarker('1602 - Witch Hunter Angela')).toBeNull();
  });

  it('rejects vN with no preceding series name', () => {
    expect(parseFolderVolumeMarker('v1')).toBeNull();
    expect(parseFolderVolumeMarker(' v1')).toBeNull();
  });

  it('rejects v with no digits or non-integer digits', () => {
    expect(parseFolderVolumeMarker('Foo v')).toBeNull();
    expect(parseFolderVolumeMarker('Foo v1.5')).toBeNull(); // R-20: integers only
    expect(parseFolderVolumeMarker('Foo va')).toBeNull();
  });

  it('rejects names where the v is not preceded by any space', () => {
    expect(parseFolderVolumeMarker('Foov1')).toBeNull();
  });

  it('tolerates multi-space between series and v (treated as one space)', () => {
    // The series name passes through normalizeSeriesName which collapses
    // whitespace. Two spaces in input → single space in canonical output.
    expect(parseFolderVolumeMarker('Foo  v1')).toEqual({ seriesName: 'Foo', volumeNumber: 1 });
  });
});

describe('stripDatePrefix', () => {
  it('strips a YYYYMM prefix and reports the date', () => {
    expect(stripDatePrefix('198001 Avengers v1 191.cbz')).toEqual({
      stripped: 'Avengers v1 191.cbz', year: 1980, month: 1,
    });
    expect(stripDatePrefix('200912 Foo.cbz')).toEqual({
      stripped: 'Foo.cbz', year: 2009, month: 12,
    });
  });

  it('does not strip when month is out of range', () => {
    expect(stripDatePrefix('199913 Foo.cbz')).toEqual({ stripped: '199913 Foo.cbz' });
    expect(stripDatePrefix('199900 Foo.cbz')).toEqual({ stripped: '199900 Foo.cbz' });
  });

  it('does not strip when year is implausible', () => {
    expect(stripDatePrefix('189901 Foo.cbz')).toEqual({ stripped: '189901 Foo.cbz' });
    // Year well past +5 from current year
    const farFuture = String(new Date().getUTCFullYear() + 100) + '01 Foo.cbz';
    expect(stripDatePrefix(farFuture)).toEqual({ stripped: farFuture });
  });

  it('does not strip without exactly 6 digits + space', () => {
    expect(stripDatePrefix('19800 Foo.cbz')).toEqual({ stripped: '19800 Foo.cbz' });   // 5 digits
    expect(stripDatePrefix('1980011 Foo.cbz')).toEqual({ stripped: '1980011 Foo.cbz' }); // 7 digits
    expect(stripDatePrefix('198001Foo.cbz')).toEqual({ stripped: '198001Foo.cbz' });     // no space
  });

  it('returns the original on empty or non-string input', () => {
    expect(stripDatePrefix('')).toEqual({ stripped: '' });
    expect(stripDatePrefix('Foo.cbz')).toEqual({ stripped: 'Foo.cbz' });
  });
});
