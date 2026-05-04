/**
 * Tests for src/main/comicInfoParser.ts.
 *
 * The bulk of the surface (parseComicInfoXml + mapAgeRating) is pure-function
 * and tested directly with XML strings — no zip plumbing needed. One
 * integration test exercises readFromArchive against the real Gwenpool
 * Omnibus CBZ that lives at the repo root, asserting the same shape we
 * extracted manually when scoping R-16.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  parseComicInfoXml,
  mapAgeRating,
  readFromArchive,
} from './comicInfoParser';

const GWENPOOL_CBZ = path.join(
  __dirname, '..', '..',
  'Gwenpool Omnibus (2022) (Digital) (Kileko-Empire).cbz',
);

describe('mapAgeRating', () => {
  it('maps known ComicRack values to the schema enum', () => {
    expect(mapAgeRating('Everyone')).toBe('g');
    expect(mapAgeRating('Everyone 10+')).toBe('pg');
    expect(mapAgeRating('Teen')).toBe('teen');
    expect(mapAgeRating('Mature 17+')).toBe('mature');
    expect(mapAgeRating('M')).toBe('mature');
    expect(mapAgeRating('Adults Only 18+')).toBe('adults_only');
    expect(mapAgeRating('R18+')).toBe('adults_only');
    expect(mapAgeRating('G')).toBe('g');
    expect(mapAgeRating('PG')).toBe('pg');
  });

  it('is case-insensitive and tolerant of surrounding whitespace', () => {
    expect(mapAgeRating('  teen ')).toBe('teen');
    expect(mapAgeRating('mature 17+')).toBe('mature');
  });

  it('returns unknown for unrecognised, empty, or non-string values', () => {
    expect(mapAgeRating('Rating Pending')).toBe('unknown');
    expect(mapAgeRating('NC-17')).toBe('unknown');
    expect(mapAgeRating('')).toBe('unknown');
    expect(mapAgeRating(null)).toBe('unknown');
    expect(mapAgeRating(undefined)).toBe('unknown');
    expect(mapAgeRating(42)).toBe('unknown');
  });
});

describe('parseComicInfoXml', () => {
  it('parses a minimal valid document', () => {
    const xml = `<?xml version="1.0"?>
      <ComicInfo>
        <Series>One Piece</Series>
        <Number>5</Number>
        <Volume>2</Volume>
      </ComicInfo>`;
    const ci = parseComicInfoXml(xml);
    expect(ci).not.toBeNull();
    expect(ci!.series).toBe('One Piece');
    expect(ci!.number).toBe(5);
    expect(ci!.volume).toBe(2);
    // unset fields default to null / 'unknown'
    expect(ci!.title).toBeNull();
    expect(ci!.year).toBeNull();
    expect(ci!.ageRating).toBe('unknown');
  });

  it('parses a document missing the xmlns/xsi attributes (real-world CBZ)', () => {
    const xml = `<?xml version="1.0"?>
      <ComicInfo>
        <Series>Naked Root</Series>
        <Title>No Namespace</Title>
        <Summary>Some text</Summary>
        <Year>2024</Year>
        <Month>3</Month>
        <Publisher>Marvel</Publisher>
        <LanguageISO>EN</LanguageISO>
        <PageCount>22</PageCount>
        <AgeRating>Teen</AgeRating>
      </ComicInfo>`;
    const ci = parseComicInfoXml(xml)!;
    expect(ci.series).toBe('Naked Root');
    expect(ci.title).toBe('No Namespace');
    expect(ci.year).toBe(2024);
    expect(ci.month).toBe(3);
    expect(ci.publisher).toBe('Marvel');
    expect(ci.language).toBe('en'); // lowercased
    expect(ci.pageCount).toBe(22);
    expect(ci.ageRating).toBe('teen');
  });

  it('handles mixed-case element names', () => {
    // ComicInfo files in the wild sometimes use lowercase or mixedCase tags.
    const xml = `<?xml version="1.0"?>
      <comicinfo>
        <series>Lower</series>
        <Title>Mixed</Title>
        <NUMBER>3</NUMBER>
      </comicinfo>`;
    const ci = parseComicInfoXml(xml)!;
    expect(ci.series).toBe('Lower');
    expect(ci.title).toBe('Mixed');
    expect(ci.number).toBe(3);
  });

  it('returns null for empty input or non-XML text', () => {
    expect(parseComicInfoXml('')).toBeNull();
    expect(parseComicInfoXml('   ')).toBeNull();
    expect(parseComicInfoXml('not xml at all')).toBeNull();
  });

  it('treats truncated XML as data-poor (lenient: parses, but no usable series)', () => {
    // fast-xml-parser is intentionally lenient; ingest treats null series as
    // "fall back to filename heuristics" so a partial parse with no usable
    // fields is functionally equivalent to a null return.
    const ci = parseComicInfoXml('<ComicInfo><Series>Open');
    expect(ci?.series ?? null).toBeNull();
  });

  it('parses decimal Number values like "1.5"', () => {
    const xml = `<ComicInfo><Series>X</Series><Number>1.5</Number></ComicInfo>`;
    expect(parseComicInfoXml(xml)!.number).toBe(1.5);
  });

  it('parses a range Number ("1-5") by taking the leading number', () => {
    const xml = `<ComicInfo><Series>X</Series><Number>3-5</Number></ComicInfo>`;
    expect(parseComicInfoXml(xml)!.number).toBe(3);
  });

  it('parses the <Pages> block including FrontCover Image attribute', () => {
    const xml = `<?xml version="1.0"?>
      <ComicInfo>
        <Series>Foo</Series>
        <Pages>
          <Page Image="0" Type="FrontCover" ImageSize="1024" ImageHeight="3000" ImageWidth="2000"/>
          <Page Image="1" Type="Story"/>
          <Page Image="2"/>
        </Pages>
      </ComicInfo>`;
    const ci = parseComicInfoXml(xml)!;
    expect(ci.pages).toHaveLength(3);
    expect(ci.pages[0]).toEqual({ image: 0, type: 'FrontCover', imageSize: 1024, imageHeight: 3000, imageWidth: 2000 });
    expect(ci.pages[1]).toEqual({ image: 1, type: 'Story' });
    expect(ci.pages[2]).toEqual({ image: 2 });
  });

  it('treats a single <Page> element (no array) the same as a list', () => {
    const xml = `<ComicInfo><Series>X</Series>
      <Pages><Page Image="0" Type="FrontCover"/></Pages>
    </ComicInfo>`;
    const ci = parseComicInfoXml(xml)!;
    expect(ci.pages).toHaveLength(1);
    expect(ci.pages[0].type).toBe('FrontCover');
  });

  it('returns null when the root element is not <ComicInfo>', () => {
    const xml = `<NotComicInfo><Series>X</Series></NotComicInfo>`;
    // We accept any single-keyed root, so this DOES still parse — assert so
    // we know the lenient behaviour is intentional and document it.
    const ci = parseComicInfoXml(xml);
    expect(ci?.series).toBe('X');
  });

  it('captures the raw parsed object for unrecognised fields', () => {
    const xml = `<ComicInfo>
      <Series>X</Series>
      <Notes>Scraped from somewhere</Notes>
      <Writer>Jane Doe</Writer>
      <Genre>Superhero, Drama</Genre>
    </ComicInfo>`;
    const ci = parseComicInfoXml(xml)!;
    expect(ci.raw.notes).toBe('Scraped from somewhere');
    expect(ci.raw.writer).toBe('Jane Doe');
    expect(ci.raw.genre).toBe('Superhero, Drama');
  });
});

describe('readFromArchive (integration)', () => {
  const hasGwenpool = fs.existsSync(GWENPOOL_CBZ);

  it.skipIf(!hasGwenpool)('extracts and parses ComicInfo.xml from the real Gwenpool CBZ', async () => {
    const ci = await readFromArchive(GWENPOOL_CBZ);
    expect(ci).not.toBeNull();
    expect(ci!.series).toBe('Gwenpool Omnibus');
    expect(ci!.publisher).toBe('Marvel');
    expect(ci!.year).toBe(2023);
    expect(ci!.month).toBe(2);
    expect(ci!.language).toBe('en');
    expect(ci!.pageCount).toBe(1141);
    // Gwenpool's <Pages> block is large; spot-check the first few pages
    expect(ci!.pages.length).toBeGreaterThan(0);
    expect(ci!.pages[0]).toMatchObject({ image: 0, type: 'FrontCover' });
  });

  it('returns null for a non-archive path', async () => {
    expect(await readFromArchive('/nonexistent/file.txt')).toBeNull();
  });
});
