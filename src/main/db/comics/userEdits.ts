/**
 * comics/userEdits.ts — track which fields a user has manually edited so
 * a future re-ingest pass doesn't clobber their changes (R-16).
 *
 * The CSV format on `comics.user_edited_fields` is intentionally simple
 * — the field-name vocabulary is a closed set, no escaping needed.
 * Reads are O(F) per comic, which is fine since the set is small.
 *
 * Currently `addUserEditedFields` is called from `metadata.ts` whenever
 * `updateComicMetadata` runs; `isFieldUserEdited` is the read primitive
 * any future re-resolve flow will consult before overwriting.
 */
import type Database from 'better-sqlite3';

export function addUserEditedFields(db: Database.Database, comicId: number, fields: string[]): void {
  if (fields.length === 0) return;
  const row = db.prepare('SELECT user_edited_fields FROM comics WHERE id = ?').get(comicId) as
    { user_edited_fields: string | null } | undefined;
  const current = row?.user_edited_fields ? row.user_edited_fields.split(',').filter(Boolean) : [];
  const set = new Set(current);
  for (const f of fields) set.add(f);
  const next = [...set].join(',');
  db.prepare('UPDATE comics SET user_edited_fields = ? WHERE id = ?').run(next, comicId);
}

/** True if the user has edited the named field on this comic. R-16. */
export function isFieldUserEdited(
  db: Database.Database,
  comicId: number,
  fieldName: string,
): boolean {
  const row = db.prepare('SELECT user_edited_fields FROM comics WHERE id = ?').get(comicId) as
    { user_edited_fields: string | null } | undefined;
  if (!row?.user_edited_fields) return false;
  return row.user_edited_fields.split(',').includes(fieldName);
}
