import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { LibraryDatabase } from './libraryDatabase';
import { extractEpubCover } from './epubCoverExtractor';
import { getPdfPageCount, renderPdfFirstPageCover } from './pdfCoverExtractor';
import { generateThumbnail } from './thumbnailGenerator';
import type { ScanProgress } from '../shared/types';
import { COMIC_EXTENSIONS as COMIC_EXTS_BASE, BOOK_EXTENSIONS as BOOK_EXTS_BASE } from '../shared/mediaTypes';
import { IngestService } from './ingestService';
import { withTimeout } from './utils/timeout';

const COMIC_EXTENSIONS = new Set([...COMIC_EXTS_BASE].map(e => `.${e}`));
const BOOK_EXTENSIONS = new Set([...BOOK_EXTS_BASE].map(e => `.${e}`));
const COVER_EXTRACTION_TIMEOUT_MS = 5000;

export interface FileScanner {
  scan(
    directoryPath: string,
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<number>;
  scanBooks(
    directoryPath: string,
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<number>;
}

export class FileScannerImpl implements FileScanner {
  private ingestService: IngestService;

  constructor(private db: LibraryDatabase) {
    this.ingestService = new IngestService(db);
  }

  async scan(
    directoryPath: string,
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<number> {
    return this.scanFiles(directoryPath, COMIC_EXTENSIONS, 'comic', onProgress, signal);
  }

  async scanBooks(
    directoryPath: string,
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<number> {
    return this.scanFiles(directoryPath, BOOK_EXTENSIONS, 'book', onProgress, signal);
  }

  private async scanFiles(
    directoryPath: string,
    extensions: Set<string>,
    mediaType: 'comic' | 'book',
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<number> {
    const progress: ScanProgress = {
      discovered: 0,
      processed: 0,
      currentFile: '',
    };

    let newCount = 0;
    const filesToProcess: string[] = [];

    await this.discoverFiles(directoryPath, filesToProcess, extensions);
    if (signal?.aborted) return newCount;
    progress.discovered = filesToProcess.length;
    onProgress({ ...progress });

    for (const filePath of filesToProcess) {
      if (signal?.aborted) break;
      progress.currentFile = filePath;
      onProgress({ ...progress });

      try {
        if (this.db.isDismissed(filePath)) {
          // Skip: user previously removed this path from the library.
        } else if (this.db.comicExistsByPath(filePath)) {
          if (mediaType === 'book') {
            await this.refreshBookMetadata(filePath);
          }
        } else {
          const result = await this.ingestService.addFile(filePath);
          if (result.added) newCount++;
          else if (result.error) console.error(`Failed to process ${mediaType} at ${filePath}:`, result.error);
        }
      } catch (err) {
        console.error(`Failed to process ${mediaType} at ${filePath}:`, err);
      }

      progress.processed++;
      onProgress({ ...progress });
      await new Promise((resolve) => setImmediate(resolve));
    }

    return newCount;
  }

  private async discoverFiles(dirPath: string, files: string[], extensions: Set<string>): Promise<void> {
    try {
      const dir = await fs.opendir(dirPath);
      for await (const entry of dir) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.discoverFiles(fullPath, files, extensions);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.has(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to open directory ${dirPath}:`, err);
    }
  }

  async refreshBookMetadata(filePath: string): Promise<void> {
    const pageCount = await this.getBookPageCount(filePath);
    if (pageCount > 0) {
      this.db.updatePageCountByPath(filePath, pageCount);
    }

    const coverThumbnail = await this.getBookCoverThumbnail(filePath);
    if (coverThumbnail) {
      this.db.updateCoverThumbnailByPath(filePath, coverThumbnail);
    }
  }

  private async getBookPageCount(filePath: string): Promise<number> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.pdf') return 0;

    try {
      return await withTimeout(getPdfPageCount(filePath), COVER_EXTRACTION_TIMEOUT_MS);
    } catch (err) {
      console.warn(`Failed to read PDF page count from ${filePath}.`, err);
      return 0;
    }
  }

  private async getBookCoverThumbnail(filePath: string): Promise<Buffer | null> {
    const ext = path.extname(filePath).toLowerCase();

    try {
      if (ext === '.epub') {
        const coverImage = await withTimeout(extractEpubCover(filePath), COVER_EXTRACTION_TIMEOUT_MS);
        return coverImage ? await generateThumbnail(coverImage) : null;
      }
      if (ext === '.pdf') {
        return withTimeout(renderPdfFirstPageCover(filePath), COVER_EXTRACTION_TIMEOUT_MS);
      }
      return null;
    } catch (err) {
      console.warn(`Failed to extract book cover from ${filePath}; using placeholder thumbnail.`, err);
      return null;
    }
  }
}
