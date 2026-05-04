/**
 * comics/metadata.ts — read/write user-editable metadata fields on a
 * comic, with R-16 user-edit tracking.
 *
 * `updateComicMetadata` records each touched field via
 * `addUserEditedFields` so a future re-resolve flow can refuse to
 * overwrite manual edits.
 */
import type Database from 'better-sqlite3';
import type { SqlParam } from '../types';
import { addUserEditedFields } from './userEdits';

export function updateComicMetadata(
  db: Database.Database,
  comicId: number,
  fields: {
    title?: string; author?: string | null; artist?: string | null; genre?: string | null;
    year?: number | null; summary?: string | null; externalId?: string | null; externalSource?: string | null;
    chapterNumber?: number | null;
    /** Direct FK setters — pass null to detach the comic from a series/volume. */
    seriesId?: number | null; volumeId?: number | null;
  },
): void {
  const parts: string[] = [];
  const vals: SqlParam[] = [];
  const editedFields: string[] = [];
  // Helper that records both the SQL set and which logical field was touched.
  // The logical name is what re-ingest's user-edit guard checks (R-16),
  // so it must match the field-name vocabulary used in metadataResolver.
  const set = (sql: string, val: SqlParam, fieldName: string): void => {
    parts.push(sql); vals.push(val); editedFields.push(fieldName);
  };
  if (fields.title          !== undefined) set('title = ?',           fields.title,          'title');
  if (fields.author         !== undefined) set('author = ?',          fields.author,         'author');
  if (fields.artist         !== undefined) set('artist = ?',          fields.artist,         'artist');
  if (fields.genre          !== undefined) set('genre = ?',           fields.genre,          'genre');
  if (fields.year           !== undefined) set('year = ?',            fields.year,           'year');
  if (fields.summary        !== undefined) set('summary = ?',         fields.summary,        'summary');
  if (fields.externalId     !== undefined) set('external_id = ?',     fields.externalId,     'externalId');
  if (fields.externalSource !== undefined) set('external_source = ?', fields.externalSource, 'externalSource');
  if (fields.chapterNumber  !== undefined) set('chapter_number = ?',  fields.chapterNumber,  'chapterNumber');
  if (fields.seriesId       !== undefined) set('series_id = ?',       fields.seriesId,       'seriesId');
  if (fields.volumeId       !== undefined) set('volume_id = ?',       fields.volumeId,       'volumeId');
  if (parts.length === 0) return;

  db.transaction(() => {
    db.prepare(`UPDATE comics SET ${parts.join(', ')} WHERE id = ?`).run(...vals, comicId);
    addUserEditedFields(db, comicId, editedFields);
  })();
}

export function getComicMetadata(
  db: Database.Database,
  id: number,
): {
  author: string | null; artist: string | null; genre: string | null; year: number | null;
  summary: string | null; externalId: string | null; externalSource: string | null;
  chapterNumber: number | null;
  seriesId: number | null; seriesName: string | null;
  volumeId: number | null; volumeNumber: number | null;
} | null {
  const row = db.prepare(`
    SELECT c.author, c.artist, c.genre, c.year, c.summary,
           c.external_id, c.external_source, c.chapter_number,
           c.series_id, s.name AS series_name,
           c.volume_id, v.number AS volume_number
    FROM comics c
    LEFT JOIN series s ON s.id = c.series_id
    LEFT JOIN volume v ON v.id = c.volume_id
    WHERE c.id = ?
  `).get(id) as {
    author: string | null; artist: string | null; genre: string | null; year: number | null;
    summary: string | null; external_id: string | null; external_source: string | null;
    chapter_number: number | null;
    series_id: number | null; series_name: string | null;
    volume_id: number | null; volume_number: number | null;
  } | undefined;
  if (!row) return null;
  return {
    author: row.author, artist: row.artist, genre: row.genre, year: row.year,
    summary: row.summary, externalId: row.external_id, externalSource: row.external_source,
    chapterNumber: row.chapter_number,
    seriesId: row.series_id, seriesName: row.series_name,
    volumeId: row.volume_id, volumeNumber: row.volume_number,
  };
}
