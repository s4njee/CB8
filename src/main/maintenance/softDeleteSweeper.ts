/**
 * softDeleteSweeper.ts — R-8 grace-window enforcer.
 *
 * Periodically hard-deletes soft-deleted rows whose `deleted_at` is older
 * than the configured grace window AND have no surviving user state
 * (user_progress, bookmarks, user_favorites). Rows with user state are
 * retained indefinitely so favoriting a comic that later disappears
 * doesn't lose the user's annotation.
 *
 * The sweep runs in three phases — comics first, then volumes, then
 * series — because a series with surviving live volumes shouldn't be
 * eligible (and a volume with surviving live comics shouldn't be
 * eligible). Doing comics first lets the volume/series checks see the
 * shrunken set.
 *
 * The grace window is currently hard-coded at 7 days (R-8). Promotion
 * to a config knob is deferred per the R-8 risk note.
 */
import type Database from 'better-sqlite3';

export const GRACE_WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export interface SweeperResult {
  comicsDeleted: number;
  volumesDeleted: number;
  seriesDeleted: number;
  /** Comic ids retained because they had attached user state. */
  comicsRetained: number;
  durationMs: number;
}

export function sweepSoftDeleted(db: Database.Database): SweeperResult {
  const start = Date.now();
  const cutoff = new Date(Date.now() - GRACE_WINDOW_DAYS * MS_PER_DAY).toISOString();

  const result: SweeperResult = {
    comicsDeleted: 0, volumesDeleted: 0, seriesDeleted: 0,
    comicsRetained: 0, durationMs: 0,
  };

  db.transaction(() => {
    // 1. Comics past grace AND with no user state get hard-deleted.
    const eligibleComics = db.prepare(`
      SELECT c.id FROM comics c
      WHERE c.deleted_at IS NOT NULL
        AND c.deleted_at < ?
        AND NOT EXISTS (SELECT 1 FROM user_progress  WHERE comic_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM bookmarks      WHERE comic_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM user_favorites WHERE comic_id = c.id)
    `).all(cutoff) as { id: number }[];

    // Track which series rows might become empty so we can re-evaluate them.
    const affectedSeriesRow = db.prepare('SELECT series_id FROM comics WHERE id = ?');
    const affectedSeries = new Set<number>();
    for (const c of eligibleComics) {
      const r = affectedSeriesRow.get(c.id) as { series_id: number | null } | undefined;
      if (r?.series_id != null) affectedSeries.add(r.series_id);
    }

    if (eligibleComics.length > 0) {
      const ids = eligibleComics.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM comics WHERE id IN (${placeholders})`).run(...ids);
      result.comicsDeleted = ids.length;
    }

    // Count retained comics for observability.
    const retained = db.prepare(`
      SELECT COUNT(*) AS c FROM comics c
      WHERE c.deleted_at IS NOT NULL
        AND c.deleted_at < ?
        AND (
          EXISTS (SELECT 1 FROM user_progress  WHERE comic_id = c.id)
          OR EXISTS (SELECT 1 FROM bookmarks      WHERE comic_id = c.id)
          OR EXISTS (SELECT 1 FROM user_favorites WHERE comic_id = c.id)
        )
    `).get(cutoff) as { c: number };
    result.comicsRetained = retained.c;

    // 2. Volumes past grace AND with no remaining live OR soft-deleted comics
    // (the comics' delete cascaded above). User state on volumes is not
    // tracked separately, so the only retain criterion is "still has comics."
    const eligibleVolumes = db.prepare(`
      SELECT v.id FROM volume v
      WHERE v.deleted_at IS NOT NULL
        AND v.deleted_at < ?
        AND NOT EXISTS (SELECT 1 FROM comics c WHERE c.volume_id = v.id)
    `).all(cutoff) as { id: number }[];

    if (eligibleVolumes.length > 0) {
      const ids = eligibleVolumes.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM volume WHERE id IN (${placeholders})`).run(...ids);
      result.volumesDeleted = ids.length;
    }

    // 3. Series past grace AND with no remaining volumes AND no remaining comics.
    const eligibleSeries = db.prepare(`
      SELECT s.id FROM series s
      WHERE s.deleted_at IS NOT NULL
        AND s.deleted_at < ?
        AND NOT EXISTS (SELECT 1 FROM volume v WHERE v.series_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM comics c WHERE c.series_id = s.id)
    `).all(cutoff) as { id: number }[];

    if (eligibleSeries.length > 0) {
      const ids = eligibleSeries.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM series WHERE id IN (${placeholders})`).run(...ids);
      result.seriesDeleted = ids.length;
    }

    // affectedSeries is currently informational; expose if a future caller
    // wants to log per-series detail.
    void affectedSeries;
  })();

  result.durationMs = Date.now() - start;
  return result;
}

export function logSweeperResult(prefix: string, r: SweeperResult): void {
  console.log(
    `${prefix} swept: comics=${r.comicsDeleted} (retained=${r.comicsRetained}), ` +
    `volumes=${r.volumesDeleted}, series=${r.seriesDeleted}, ${r.durationMs}ms`,
  );
}
