import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { LibraryDatabase } from './libraryDatabase';
import * as ArchiveLoader from './archiveLoader';
import { extractEpubCover } from './epubCoverExtractor';
import { getPdfPageCount, renderPdfFirstPageCover } from './pdfCoverExtractor';
import { generateThumbnail } from './thumbnailGenerator';
import { parseSeriesFromFilename, type SeriesInfo } from './seriesParser';
import { detectMediaType, COMIC_EXTENSIONS, BOOK_EXTENSIONS } from '../shared/mediaTypes';
import type { ScanProgress } from '../shared/types';
import { withTimeout } from './utils/timeout';

const COVER_TIMEOUT_MS = 5000;

// Concurrency for parallel directory scans. Workers spend most of their
// time parked in async I/O (yauzl reads, sharp encodes — both libuv
// pool tasks), so overcommit beyond core count is a clear win. We cap
// at 64 to keep the pending-payload queue bounded; tune via the
// CB8_INGEST_CONCURRENCY env var if needed.
const MAX_INGEST_CONCURRENCY = (() => {
  const fromEnv = parseInt(process.env.CB8_INGEST_CONCURRENCY ?? '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return Math.min(64, Math.max(8, os.cpus().length * 2));
})();

// Flush batched inserts every N prepared records (or at end of run).
const FLUSH_BATCH_SIZE = 200;

export interface IngestResult {
  added: boolean;
  comicId?: number;
  error?: string;
}

/**
 * Async producer/consumer queue. Workers `await shift()` and block until
 * the producer pushes a path or signals completion. Lets directory walk
 * and ingest run concurrently — workers start consuming the first file
 * a few ms after discovery starts, instead of waiting for full enumeration.
 */
class IngestQueue {
  private items: string[] = [];
  private waiters: ((path: string | null) => void)[] = [];
  private done = false;
  private seen = 0;

  pushMany(paths: string[]): void {
    for (const p of paths) this.push(p);
  }

  push(p: string): void {
    this.seen++;
    const w = this.waiters.shift();
    if (w) w(p);
    else this.items.push(p);
  }

  complete(): void {
    this.done = true;
    for (const w of this.waiters) w(null);
    this.waiters.length = 0;
  }

  totalSeen(): number {
    return this.seen;
  }

  shift(): Promise<string | null> {
    const it = this.items.shift();
    if (it !== undefined) return Promise.resolve(it);
    if (this.done) return Promise.resolve(null);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

interface PreparedInsert {
  filePath: string;
  title: string;
  pageCount: number;
  fileSize: number;
  coverThumbnail: Buffer;
  mediaType: 'comic' | 'book';
  seriesInfo: SeriesInfo;
}

export class IngestService {
  constructor(private db: LibraryDatabase) {}

  /**
   * Prepare an insert payload by doing all the slow async I/O (archive
   * open, cover extract, sharp encode, page count). Returns null for
   * dismissed paths, already-indexed files, and unsupported types.
   *
   * Pure async work — does not write to the DB. The caller is responsible
   * for batching the resulting payloads through `flushBatch`.
   */
  async prepareInsert(filePath: string): Promise<PreparedInsert | null> {
    const mediaType = detectMediaType(filePath);
    if (!mediaType) return null;
    if (this.db.isDismissed(filePath)) return null;
    if (this.db.comicExistsByPath(filePath)) return null;

    const ext = path.extname(filePath).toLowerCase();
    const stats = fs.statSync(filePath);
    const title = path.basename(filePath, ext);
    const seriesInfo = parseSeriesFromFilename(path.basename(filePath));

    if (mediaType === 'book') {
      let pageCount = 0;
      if (ext === '.pdf') {
        try { pageCount = await withTimeout(getPdfPageCount(filePath), COVER_TIMEOUT_MS); } catch { /* ignore */ }
      }
      let coverThumbnail: Buffer;
      try {
        const raw = ext === '.epub'
          ? await withTimeout(extractEpubCover(filePath), COVER_TIMEOUT_MS)
          : ext === '.pdf'
            ? await withTimeout(renderPdfFirstPageCover(filePath), COVER_TIMEOUT_MS)
            : null;
        coverThumbnail = ext === '.epub'
          ? await generateThumbnail(raw)
          : (raw ?? await generateThumbnail(null));
      } catch {
        coverThumbnail = await generateThumbnail(null);
      }
      return { filePath, title, pageCount, fileSize: stats.size, coverThumbnail, mediaType: 'book', seriesInfo };
    }

    // Comic archive
    const handle = await ArchiveLoader.open(filePath);
    try {
      let coverImage: Buffer | null = null;
      try { coverImage = await ArchiveLoader.getCoverImage(handle); } catch { /* placeholder */ }
      const coverThumbnail = await generateThumbnail(coverImage);
      return {
        filePath, title, pageCount: handle.pageCount, fileSize: stats.size,
        coverThumbnail, mediaType: 'comic', seriesInfo,
      };
    } finally {
      await ArchiveLoader.close(handle);
    }
  }

  /**
   * Apply a batch of prepared inserts in a single SQLite transaction.
   * Returns the rowids of the inserted records (in input order).
   *
   * Synchronous: better-sqlite3 transactions cannot await. All async
   * work must already be done in `prepareInsert`.
   */
  flushBatch(batch: PreparedInsert[], folderId?: number): number[] {
    if (batch.length === 0) return [];
    const ids: number[] = [];
    this.db.runInTransaction(() => {
      for (const p of batch) {
        const id = this.db.addComicFast({
          filePath: p.filePath, title: p.title, pageCount: p.pageCount, fileSize: p.fileSize,
          coverThumbnail: p.coverThumbnail, mediaType: p.mediaType,
        });
        if (p.seriesInfo.seriesName) {
          this.db.setComicSeries(id, p.seriesInfo.seriesName, p.seriesInfo.volumeNumber, p.seriesInfo.chapterNumber);
        }
        ids.push(id);
      }
      if (folderId != null && ids.length > 0) {
        this.db.addComicsToFolderRaw(folderId, ids);
      }
    });
    return ids;
  }

  /**
   * Single-file ingest used by the upload route. Wraps prepare + flush
   * for one file; returns added/comicId/error in the original shape.
   */
  async addFile(filePath: string, folderId?: number): Promise<IngestResult> {
    try {
      const prepared = await this.prepareInsert(filePath);
      if (!prepared) {
        if (!detectMediaType(filePath)) return { added: false, error: 'Unsupported file type' };
        return { added: false };
      }
      const [id] = this.flushBatch([prepared], folderId);
      return { added: true, comicId: id };
    } catch (err) {
      return { added: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Parallel ingest of a discovered file list. Runs `MAX_INGEST_CONCURRENCY`
   * preparers concurrently and flushes batches of `FLUSH_BATCH_SIZE` to the
   * DB in single transactions. Returns the count of newly-inserted rows.
   *
   * Existing-on-disk hits (`comicExistsByPath`) and dismissed paths are
   * skipped silently. If `folderId` is set, existing items also get
   * attached to the folder so re-running an add-path with a folder is
   * additive.
   */
  async ingestParallel(
    filePaths: string[],
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
    folderId?: number,
  ): Promise<number> {
    const queue = new IngestQueue();
    queue.pushMany(filePaths);
    queue.complete();
    return this.runWorkers(queue, onProgress, signal, folderId);
  }

  private async runWorkers(
    queue: IngestQueue,
    onProgress: (progress: ScanProgress) => void,
    signal: AbortSignal | undefined,
    folderId: number | undefined,
  ): Promise<number> {
    const progress: ScanProgress = { discovered: 0, processed: 0, currentFile: '' };
    const pending: PreparedInsert[] = [];
    const existingForFolder: number[] = [];
    let added = 0;
    let lastEmit = 0;

    const emit = (force = false): void => {
      progress.discovered = queue.totalSeen();
      const now = Date.now();
      if (!force && now - lastEmit < 50) return;
      lastEmit = now;
      onProgress({ ...progress });
    };

    const flushIfFull = (): void => {
      if (pending.length >= FLUSH_BATCH_SIZE) {
        added += this.flushBatch(pending.splice(0, pending.length), folderId).length;
      }
      if (folderId != null && existingForFolder.length >= FLUSH_BATCH_SIZE) {
        const ids = existingForFolder.splice(0, existingForFolder.length);
        this.db.runInTransaction(() => this.db.addComicsToFolderRaw(folderId, ids));
      }
    };

    const worker = async (): Promise<void> => {
      while (true) {
        if (signal?.aborted) return;
        const filePath = await queue.shift();
        if (filePath === null) return; // queue closed and drained
        progress.currentFile = filePath;
        try {
          if (this.db.comicExistsByPath(filePath)) {
            if (folderId != null) {
              const existing = this.db.getComicByPath(filePath);
              if (existing) existingForFolder.push(existing.id);
            }
          } else {
            const prep = await this.prepareInsert(filePath);
            if (prep) pending.push(prep);
          }
          flushIfFull();
        } catch (err) {
          console.error(`Failed to process ${filePath}:`, err);
        }
        progress.processed++;
        emit();
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < MAX_INGEST_CONCURRENCY; i++) workers.push(worker());
    await Promise.all(workers);

    if (pending.length > 0) {
      added += this.flushBatch(pending.splice(0, pending.length), folderId).length;
    }
    if (folderId != null && existingForFolder.length > 0) {
      this.db.runInTransaction(() => this.db.addComicsToFolderRaw(folderId, existingForFolder));
    }
    emit(true);
    return added;
  }

  async scanDirectory(
    dirPath: string,
    mediaType: 'comic' | 'book',
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
    folderId?: number,
  ): Promise<number> {
    const extensions = mediaType === 'comic'
      ? new Set([...COMIC_EXTENSIONS].map(e => `.${e}`))
      : new Set([...BOOK_EXTENSIONS].map(e => `.${e}`));

    const files: string[] = [];
    await this.discoverFiles(dirPath, files, extensions, signal);
    if (signal?.aborted) return 0;
    return this.ingestParallel(files, onProgress, signal, folderId);
  }

  private async discoverFiles(dirPath: string, files: string[], extensions: Set<string>, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    try {
      const dir = await fsp.opendir(dirPath);
      for await (const entry of dir) {
        if (signal?.aborted) break;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.discoverFiles(fullPath, files, extensions, signal);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.has(ext)) files.push(fullPath);
        }
      }
    } catch (err) {
      console.error(`Failed to open directory ${dirPath}:`, err);
    }
  }
}
