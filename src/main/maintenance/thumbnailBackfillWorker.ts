import type Database from 'better-sqlite3';
import type { LibraryDatabase } from '../libraryDatabase';
import * as ArchiveLoader from '../archiveLoader';
import { generateThumbnail } from '../thumbnailGenerator';

interface PendingThumbnailRow {
  id: number;
  file_path: string;
}

export interface ThumbnailBackfillWorker {
  start(): void;
  stop(): Promise<void>;
}

const START_DELAY_MS = parseInt(process.env.CB8_THUMBNAIL_BACKFILL_START_DELAY_MS ?? '30000', 10);
const IDLE_DELAY_MS = parseInt(process.env.CB8_THUMBNAIL_BACKFILL_IDLE_DELAY_MS ?? '30000', 10);
const ERROR_DELAY_MS = parseInt(process.env.CB8_THUMBNAIL_BACKFILL_ERROR_DELAY_MS ?? '60000', 10);
const BATCH_SIZE = Math.max(1, parseInt(process.env.CB8_THUMBNAIL_BACKFILL_BATCH_SIZE ?? '4', 10));

interface CancellableDelay {
  /** Resolves when the timer fires or `cancel()` runs — whichever is first. */
  wait: Promise<void>;
  cancel: () => void;
}

function cancellableDelay(ms: number): CancellableDelay {
  let cancel = () => { /* set below */ };
  const wait = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, ms));
    if (timer.unref) timer.unref();
    cancel = () => { clearTimeout(timer); resolve(); };
  });
  return { wait, cancel };
}

function getPendingRows(db: Database.Database): PendingThumbnailRow[] {
  return db.prepare(
    `SELECT id, file_path
     FROM comics
     WHERE media_type = 'comic'
       AND deleted_at IS NULL
       AND thumbnail_status = 'pending'
     ORDER BY id
     LIMIT ?`
  ).all(BATCH_SIZE) as PendingThumbnailRow[];
}

async function buildComicThumbnail(filePath: string): Promise<Buffer> {
  const handle = await ArchiveLoader.open(filePath);
  try {
    const coverImage = await ArchiveLoader.getCoverImage(handle);
    return generateThumbnail(coverImage);
  } finally {
    await ArchiveLoader.close(handle);
  }
}

async function seedPendingPlaceholderRows(db: Database.Database): Promise<number> {
  const placeholder = await generateThumbnail(null);
  const result = db.prepare(
    `UPDATE comics
     SET thumbnail_status = 'pending'
     WHERE media_type = 'comic'
       AND thumbnail_status = 'ready'
       AND cover_thumbnail = ?`
  ).run(placeholder);
  return result.changes;
}

export function startThumbnailBackfillWorker(database: LibraryDatabase): ThumbnailBackfillWorker {
  const db = database.raw;
  let stopped = false;
  let running: Promise<void> | null = null;
  // Tracks the worker's current idle/start/error timer so stop() can wake it
  // immediately instead of blocking until the next 30s tick.
  let pendingDelay: CancellableDelay | null = null;

  const sleep = async (ms: number): Promise<void> => {
    if (stopped) return;
    const d = cancellableDelay(ms);
    pendingDelay = d;
    try { await d.wait; }
    finally { pendingDelay = null; }
  };

  const updateReady = db.prepare(
    `UPDATE comics
     SET cover_thumbnail = ?, thumbnail_status = 'ready'
     WHERE id = ?`
  );
  const updateFailed = db.prepare(
    `UPDATE comics
     SET thumbnail_status = 'failed'
     WHERE id = ?`
  );

  const run = async (): Promise<void> => {
    await sleep(Number.isFinite(START_DELAY_MS) ? START_DELAY_MS : 30000);
    if (stopped) return;
    try {
      const seeded = await seedPendingPlaceholderRows(db);
      if (seeded > 0) {
        console.log(`[CB8 thumbnails] queued ${seeded} placeholder comic thumbnails for backfill`);
      }
    } catch (err) {
      console.warn('[CB8 thumbnails] failed to seed placeholder rows:', err instanceof Error ? err.message : err);
    }

    while (!stopped) {
      let rows: PendingThumbnailRow[] = [];
      try {
        rows = getPendingRows(db);
      } catch (err) {
        console.warn('[CB8 thumbnails] failed to query pending rows:', err instanceof Error ? err.message : err);
        await sleep(Number.isFinite(ERROR_DELAY_MS) ? ERROR_DELAY_MS : 60000);
        continue;
      }

      if (rows.length === 0) {
        await sleep(Number.isFinite(IDLE_DELAY_MS) ? IDLE_DELAY_MS : 30000);
        continue;
      }

      let completed = 0;
      for (const row of rows) {
        if (stopped) break;
        try {
          const thumb = await buildComicThumbnail(row.file_path);
          updateReady.run(thumb, row.id);
          completed++;
        } catch (err) {
          updateFailed.run(row.id);
          console.warn(
            `[CB8 thumbnails] failed to backfill ${row.file_path}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      if (completed > 0) {
        console.log(`[CB8 thumbnails] backfilled ${completed} thumbnail${completed === 1 ? '' : 's'}`);
      }
    }
  };

  const worker: ThumbnailBackfillWorker = {
    start() {
      if (running || process.env.CB8_THUMBNAIL_BACKFILL_DISABLED === '1') return;
      running = run().catch((err) => {
        console.warn('[CB8 thumbnails] worker stopped after error:', err instanceof Error ? err.message : err);
      });
    },
    async stop() {
      stopped = true;
      pendingDelay?.cancel();
      await running;
    },
  };
  worker.start();
  return worker;
}
