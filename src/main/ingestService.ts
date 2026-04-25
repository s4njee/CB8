import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { LibraryDatabase } from './libraryDatabase';
import * as ArchiveLoader from './archiveLoader';
import { extractEpubCover } from './epubCoverExtractor';
import { getPdfPageCount, renderPdfFirstPageCover } from './pdfCoverExtractor';
import { generateThumbnail } from './thumbnailGenerator';
import { parseSeriesFromFilename } from './seriesParser';
import { detectMediaType, COMIC_EXTENSIONS, BOOK_EXTENSIONS } from '../shared/mediaTypes';
import type { ScanProgress } from '../shared/types';
import { withTimeout } from './utils/timeout';

const COVER_TIMEOUT_MS = 5000;

export interface IngestResult {
  added: boolean;
  error?: string;
}

export class IngestService {
  constructor(private db: LibraryDatabase) {}

  async addFile(filePath: string): Promise<IngestResult> {
    const mediaType = detectMediaType(filePath);
    if (!mediaType) return { added: false, error: 'Unsupported file type' };
    if (this.db.isDismissed(filePath)) return { added: false };
    if (this.db.comicExistsByPath(filePath)) return { added: false };

    try {
      const ext = path.extname(filePath).toLowerCase();
      const stats = fs.statSync(filePath);
      const title = path.basename(filePath, ext);
      const seriesInfo = parseSeriesFromFilename(path.basename(filePath));

      if (mediaType === 'book') {
        let pageCount = 0;
        if (ext === '.pdf') {
          try { pageCount = await withTimeout(getPdfPageCount(filePath), COVER_TIMEOUT_MS); } catch { /* ignore */ }
        }
        const record = this.db.addComic({
          filePath, title, pageCount, fileSize: stats.size,
          coverThumbnail: null, tags: [], mediaType: 'book',
          lastPage: null, lastLocation: null, lastRead: null,
        });
        if (seriesInfo.seriesName) {
          this.db.setComicSeries(record.id, seriesInfo.seriesName, seriesInfo.volumeNumber, seriesInfo.chapterNumber);
        }
        if (ext === '.epub' || ext === '.pdf') {
          try {
            const coverThumbnail = ext === '.epub'
              ? await generateThumbnail(await withTimeout(extractEpubCover(filePath), COVER_TIMEOUT_MS))
              : await withTimeout(renderPdfFirstPageCover(filePath), COVER_TIMEOUT_MS);
            if (coverThumbnail) this.db.updateCoverThumbnailByPath(record.filePath, coverThumbnail);
          } catch { /* placeholder thumbnail */ }
        }
        return { added: true };
      }

      // Comic archive
      const handle = await ArchiveLoader.open(filePath);
      try {
        let coverImage: Buffer | null = null;
        try { coverImage = await ArchiveLoader.getCoverImage(handle); } catch { /* placeholder */ }
        const coverThumbnail = await generateThumbnail(coverImage);
        const record = this.db.addComic({
          filePath, title, pageCount: handle.pageCount, fileSize: stats.size,
          coverThumbnail, tags: [], mediaType: 'comic',
          lastPage: null, lastLocation: null, lastRead: null,
        });
        if (seriesInfo.seriesName) {
          this.db.setComicSeries(record.id, seriesInfo.seriesName, seriesInfo.volumeNumber, seriesInfo.chapterNumber);
        }
      } finally {
        await ArchiveLoader.close(handle);
      }
      return { added: true };
    } catch (err) {
      return { added: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async scanDirectory(
    dirPath: string,
    mediaType: 'comic' | 'book',
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<number> {
    const extensions = mediaType === 'comic'
      ? new Set([...COMIC_EXTENSIONS].map(e => `.${e}`))
      : new Set([...BOOK_EXTENSIONS].map(e => `.${e}`));

    const progress: ScanProgress = { discovered: 0, processed: 0, currentFile: '' };
    let newCount = 0;
    const filesToProcess: string[] = [];

    await this.discoverFiles(dirPath, filesToProcess, extensions, signal);
    if (signal?.aborted) return newCount;
    progress.discovered = filesToProcess.length;
    onProgress({ ...progress });

    for (const filePath of filesToProcess) {
      if (signal?.aborted) break;
      progress.currentFile = filePath;
      onProgress({ ...progress });

      try {
        const result = await this.addFile(filePath);
        if (result.added) newCount++;
        else if (result.error) console.error(`Failed to process ${mediaType} at ${filePath}:`, result.error);
      } catch (err) {
        console.error(`Failed to process ${mediaType} at ${filePath}:`, err);
      }

      progress.processed++;
      onProgress({ ...progress });
      await new Promise((resolve) => setImmediate(resolve));
    }

    return newCount;
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
