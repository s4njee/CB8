import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { LibraryDatabase } from './libraryDatabase';
import * as ArchiveLoader from './archiveLoader';
import { extractEpubCover } from './epubCoverExtractor';
import { getPdfPageCount, renderPdfFirstPageCover } from './pdfCoverExtractor';
import { generateThumbnail } from './thumbnailGenerator';
import { resolve as resolveMetadata, type ResolvedMetadata } from './metadataResolver';
import { FolderGroupingResolver } from './folderGroupingResolver';
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
  /** Result of the v7 precedence chain (R-6, R-16, R-17, R-19, R-20, R-21). */
  metadata: ResolvedMetadata;
}

/**
 * Per-call options threaded through the ingest pipeline. R-6 requires a
 * library context for every comic; if `libraryId` is omitted, it is
 * resolved at flush time from `folderId` (folder→library lookup) or
 * falls back to the Inbox library (Option B for orphan ingests, e.g.
 * drag-drop a CBZ from Finder). The library is set on `library_comics`
 * inline, so callers do not need to call `addComicsToLibrary` separately
 * after ingest.
 */
export interface IngestOptions {
  libraryId?: number;
  folderId?: number;
  /**
   * Tree root of this ingest run, used by `metadataResolver` for the
   * one-shot ancestor guard (R-19). Defaults to the file's parent
   * directory for single-file ingests; directory scans pass the scan
   * root.
   */
  libraryRoot?: string;
}

export class IngestService {
  /**
   * Per-run cache of folder-grouping decisions (R-17). Created lazily on
   * first `prepareInsert`; reused across the run so a 50-file folder is
   * only scanned once for its recurring base name.
   */
  private folderGrouping = new FolderGroupingResolver();

  constructor(private db: LibraryDatabase) {}

  /**
   * Prepare an insert payload by doing all the slow async I/O (archive
   * open, cover extract, sharp encode, page count). Returns null for
   * dismissed paths, already-indexed files, and unsupported types.
   *
   * Pure async work — does not write to the DB. The caller is responsible
   * for batching the resulting payloads through `flushBatch`.
   */
  async prepareInsert(filePath: string, libraryRoot?: string): Promise<PreparedInsert | null> {
    const mediaType = detectMediaType(filePath);
    if (!mediaType) return null;
    if (this.db.comics.isDismissed(filePath)) return null;
    if (this.db.comics.comicExistsByPath(filePath)) return null;

    const ext = path.extname(filePath).toLowerCase();
    const stats = fs.statSync(filePath);
    const title = path.basename(filePath, ext);
    const root = libraryRoot ?? path.dirname(filePath);
    const metadata = await resolveMetadata(filePath, {
      libraryRoot: root,
      folderGrouping: this.folderGrouping,
    });

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
      return { filePath, title, pageCount, fileSize: stats.size, coverThumbnail, mediaType: 'book', metadata };
    }

    // Comic archive
    const handle = await ArchiveLoader.open(filePath);
    try {
      let coverImage: Buffer | null = null;
      try { coverImage = await ArchiveLoader.getCoverImage(handle); } catch { /* placeholder */ }
      const coverThumbnail = await generateThumbnail(coverImage);
      return {
        filePath, title, pageCount: handle.pageCount, fileSize: stats.size,
        coverThumbnail, mediaType: 'comic', metadata,
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
   * work (including the metadata precedence chain) must already be
   * done in `prepareInsert`.
   *
   * For each prepared insert this:
   *   1. Inserts the comic row.
   *   2. Upserts the series/volume rows under the resolved libraryId
   *      (R-6 / R-1 / R-2). Run-detection by chapter-number collision
   *      (R-17) splits same-numbered files across distinct volumes.
   *   3. Sets `comics.series_id` and `comics.volume_id`.
   *   4. Sets `comics.chapter_number` (intrinsic to the comic).
   *   5. Persists `publication_year`/`publication_month`/`comicinfo_json`.
   *   6. Attaches the comic to `library_comics` (inline, R-6).
   *   7. Attaches to the folder if one was given.
   */
  flushBatch(batch: PreparedInsert[], opts: IngestOptions = {}): number[] {
    if (batch.length === 0) return [];
    const ids: number[] = [];
    const libraryId = this.resolveLibraryId(opts);

    // R-17 run detection: when same-numbered chapters appear within a series,
    // assign each file a distinct volume number derived from publication
    // year (or a placeholder integer). Mutates `m.volumeNumber` /
    // `m.volumeLabel` on the prepared inserts in place.
    this.applyRunDetection(batch);

    this.db.runInTransaction(() => {
      for (const p of batch) {
        const m = p.metadata;
        const id = this.db.comics.addComicFast({
          filePath: p.filePath, title: p.title, pageCount: p.pageCount, fileSize: p.fileSize,
          coverThumbnail: p.coverThumbnail, mediaType: p.mediaType,
        });

        // Hierarchy upsert + comic FK.
        if (m.seriesName && !m.isStandalone) {
          const series = this.db.series.getOrCreate(libraryId, m.seriesName);
          const volume = m.volumeNumber != null
            ? this.db.volume.getOrCreate(series.id, m.volumeNumber, m.volumeLabel)
            : this.db.volume.getOrCreateImplicit(series.id);
          this.db.raw.prepare('UPDATE comics SET series_id = ?, volume_id = ? WHERE id = ?')
            .run(series.id, volume.id, id);
        }

        // chapter_number stays intrinsic to the comic — write it whether or
        // not the file has a series, so standalone "Volume 5" books still
        // sort correctly inside their library view.
        if (m.chapterNumber != null) {
          this.db.raw.prepare('UPDATE comics SET chapter_number = ? WHERE id = ?')
            .run(m.chapterNumber, id);
        }

        // Publication metadata + raw ComicInfo.
        if (m.publicationYear != null || m.publicationMonth != null || m.comicinfoJson != null) {
          this.db.raw.prepare(
            `UPDATE comics SET publication_year = ?, publication_month = ?, comicinfo_json = ? WHERE id = ?`
          ).run(m.publicationYear, m.publicationMonth, m.comicinfoJson, id);
        }

        ids.push(id);
      }

      // (6) attach to the resolved library inline. R-6.
      if (ids.length > 0) {
        const stmt = this.db.raw.prepare(
          'INSERT OR IGNORE INTO library_comics (library_id, comic_id) VALUES (?, ?)'
        );
        for (const id of ids) stmt.run(libraryId, id);
      }

      // (7) folder attachment, if requested.
      if (opts.folderId != null && ids.length > 0) {
        this.db.folders.addComicsToFolderRaw(opts.folderId, ids);
      }
    });
    return ids;
  }

  /**
   * Resolve the effective library for a batch:
   *   1. explicit `libraryId` from caller
   *   2. derive from `folderId` via `library_folders`
   *   3. fall back to the Inbox library (R-6 Option B for orphan ingests)
   */
  private resolveLibraryId(opts: IngestOptions): number {
    if (opts.libraryId != null) return opts.libraryId;
    if (opts.folderId != null) {
      const lib = this.db.libraries.getLibraryForFolder(opts.folderId);
      if (lib != null) return lib;
    }
    return this.db.libraries.getOrCreateInbox();
  }

  /**
   * R-17 run detection. Group prepared inserts by series; if the same
   * chapter_number appears more than once, assign each file a distinct
   * volume number so the volume row partial-unique index doesn't reject
   * the upsert.
   *
   * Number assignment precedence:
   *   1. If volumeNumber is already set on the metadata (ComicInfo
   *      `<Volume>` or folder `vN`), keep it.
   *   2. Else, if publicationYear is set, use the year as the volume
   *      number — matches user intent for Marvel-style year-tag runs
   *      (Darth Vader 2015 vs 2017 each map to volume.number = 2015 / 2017).
   *   3. Else, allocate sequential placeholder numbers starting at a
   *      high base so they don't collide with normal volume indices.
   *
   * The label is set alongside for display: explicit volumeLabel kept if
   * present, otherwise `vN` for ComicInfo/folder vN, year string for
   * year-tag runs, "Run A/B/..." for placeholders.
   */
  private applyRunDetection(batch: PreparedInsert[]): void {
    const bySeries = new Map<string, PreparedInsert[]>();
    for (const p of batch) {
      const key = p.metadata.seriesName?.toLowerCase();
      if (!key) continue;
      const arr = bySeries.get(key) ?? [];
      arr.push(p);
      bySeries.set(key, arr);
    }
    for (const [, items] of bySeries) {
      // Detect chapter-number collisions.
      const byChapter = new Map<number, PreparedInsert[]>();
      for (const p of items) {
        const ch = p.metadata.chapterNumber;
        if (ch == null) continue;
        const arr = byChapter.get(ch) ?? [];
        arr.push(p);
        byChapter.set(ch, arr);
      }
      const hasCollision = [...byChapter.values()].some((a) => a.length > 1);
      if (!hasCollision) continue;

      // Allocate placeholder numbers for run buckets that have no year/volume.
      const PLACEHOLDER_BASE = 9_000_000;
      let nextPlaceholder = 0;
      const placeholderByLabel = new Map<string, number>();

      for (const p of items) {
        const m = p.metadata;
        if (m.volumeNumber != null) continue; // already pinned by ComicInfo/folder vN
        if (m.publicationYear != null) {
          m.volumeNumber = m.publicationYear;
          m.volumeLabel ??= String(m.publicationYear);
          continue;
        }
        // No year — bucket files by an existing label (if any) or an auto label.
        const labelKey = m.volumeLabel ?? `Run ${String.fromCharCode(0x41 + nextPlaceholder)}`;
        if (!placeholderByLabel.has(labelKey)) {
          placeholderByLabel.set(labelKey, PLACEHOLDER_BASE + nextPlaceholder);
          nextPlaceholder++;
        }
        m.volumeNumber = placeholderByLabel.get(labelKey)!;
        m.volumeLabel ??= labelKey;
      }
    }
  }

  /**
   * Single-file ingest used by the upload route. Wraps prepare + flush
   * for one file; returns added/comicId/error in the original shape.
   */
  async addFile(filePath: string, opts: IngestOptions = {}): Promise<IngestResult> {
    try {
      const prepared = await this.prepareInsert(filePath, opts.libraryRoot);
      if (!prepared) {
        if (!detectMediaType(filePath)) return { added: false, error: 'Unsupported file type' };
        return { added: false };
      }
      const [id] = this.flushBatch([prepared], opts);
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
    opts: IngestOptions = {},
  ): Promise<number> {
    const queue = new IngestQueue();
    queue.pushMany(filePaths);
    queue.complete();
    return this.runWorkers(queue, onProgress, signal, opts);
  }

  private async runWorkers(
    queue: IngestQueue,
    onProgress: (progress: ScanProgress) => void,
    signal: AbortSignal | undefined,
    opts: IngestOptions,
  ): Promise<number> {
    const progress: ScanProgress = { discovered: 0, processed: 0, currentFile: '' };
    const pending: PreparedInsert[] = [];
    const existingForFolder: number[] = [];
    let added = 0;
    let lastEmit = 0;
    const folderId = opts.folderId;

    const emit = (force = false): void => {
      progress.discovered = queue.totalSeen();
      const now = Date.now();
      if (!force && now - lastEmit < 50) return;
      lastEmit = now;
      onProgress({ ...progress });
    };

    const flushIfFull = (): void => {
      if (pending.length >= FLUSH_BATCH_SIZE) {
        added += this.flushBatch(pending.splice(0, pending.length), opts).length;
      }
      if (folderId != null && existingForFolder.length >= FLUSH_BATCH_SIZE) {
        const ids = existingForFolder.splice(0, existingForFolder.length);
        this.db.runInTransaction(() => this.db.folders.addComicsToFolderRaw(folderId, ids));
      }
    };

    const worker = async (): Promise<void> => {
      while (true) {
        if (signal?.aborted) return;
        const filePath = await queue.shift();
        if (filePath === null) return; // queue closed and drained
        progress.currentFile = filePath;
        try {
          if (this.db.comics.comicExistsByPath(filePath)) {
            if (folderId != null) {
              const existing = this.db.comics.getComicByPath(filePath);
              if (existing) existingForFolder.push(existing.id);
            }
          } else {
            const prep = await this.prepareInsert(filePath, opts.libraryRoot);
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
      added += this.flushBatch(pending.splice(0, pending.length), opts).length;
    }
    if (folderId != null && existingForFolder.length > 0) {
      this.db.runInTransaction(() => this.db.folders.addComicsToFolderRaw(folderId, existingForFolder));
    }
    emit(true);
    return added;
  }

  async scanDirectory(
    dirPath: string,
    mediaType: 'comic' | 'book',
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
    opts: IngestOptions = {},
  ): Promise<number> {
    const extensions = mediaType === 'comic'
      ? new Set([...COMIC_EXTENSIONS].map(e => `.${e}`))
      : new Set([...BOOK_EXTENSIONS].map(e => `.${e}`));

    const files: string[] = [];
    await this.discoverFiles(dirPath, files, extensions, signal);
    if (signal?.aborted) return 0;
    // Use the scan root as libraryRoot for the one-shot guard (R-19) so a
    // file at <scanRoot>/one-shot/Foo/foo.cbz is correctly recognised.
    return this.ingestParallel(files, onProgress, signal, { ...opts, libraryRoot: opts.libraryRoot ?? dirPath });
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
