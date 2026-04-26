import Database from 'better-sqlite3';
import { generateThumbnail } from '../../thumbnailGenerator';

export function repairExistingThumbnails(db: Database.Database): void {
  const repairKey = 'thumbnail_repair_v1';
  const completed = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(repairKey) as { value: string } | undefined;
  if (completed?.value === 'complete') return;

  try {
    const rows = db.prepare('SELECT id, cover_thumbnail FROM comics').all() as { id: number; cover_thumbnail: Buffer | null }[];
    if (rows.length > 0) {
      const update = db.prepare('UPDATE comics SET cover_thumbnail = ? WHERE id = ?');
      const tx = db.transaction((items: { id: number; cover_thumbnail: Buffer | null }[]) => {
        for (const row of items) {
          update.run(generateThumbnail(row.cover_thumbnail), row.id);
        }
      });
      tx(rows);
    }

    db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(repairKey, 'complete');
  } catch (err) {
    console.warn('Failed to repair existing thumbnails; will retry on next startup.', err);
  }
}

// One-shot: mark rows as completed when their progress is already at the
// final page. Needed because the auto-complete logic in updateReadingProgress
// only runs on new progress writes.
export function backfillCompletedOnFinalPage(db: Database.Database): void {
  const repairKey = 'completed_backfill_v1';
  const done = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(repairKey) as { value: string } | undefined;
  if (done?.value === 'complete') return;

  try {
    db.prepare(
      `UPDATE comics
       SET completed = 1
       WHERE completed = 0
         AND page_count > 0
         AND last_page IS NOT NULL
         AND last_page >= page_count - 1`
    ).run();

    db.prepare(
      `UPDATE user_progress
       SET completed = 1
       WHERE completed = 0
         AND last_page IS NOT NULL
         AND comic_id IN (
           SELECT id FROM comics
           WHERE page_count > 0
             AND user_progress.last_page >= page_count - 1
         )`
    ).run();

    db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(repairKey, 'complete');
  } catch (err) {
    console.warn('Failed to backfill completed flag; will retry on next startup.', err);
  }
}

export function backfillAccountFromPasswordHash(db: Database.Database): void {
  const repairKey = 'auth_account_backfill_v1';
  const done = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(repairKey) as { value: string } | undefined;
  if (done?.value === 'complete') return;
  try {
    db.prepare(
      `INSERT INTO account (user_id, account_id, provider_id, password, created_at, updated_at)
       SELECT u.id, u.username, 'credential', u.password_hash, u.created_at, u.created_at
       FROM users u
       WHERE u.password_hash IS NOT NULL
         AND u.username IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM account a
           WHERE a.user_id = u.id AND a.provider_id = 'credential'
         )`
    ).run();
    db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(repairKey, 'complete');
  } catch (err) {
    console.warn('Failed to backfill account rows from password_hash; will retry on next startup.', err);
  }
}

export function runRepairs(db: Database.Database): void {
  repairExistingThumbnails(db);
  backfillCompletedOnFinalPage(db);
  backfillAccountFromPasswordHash(db);
}
