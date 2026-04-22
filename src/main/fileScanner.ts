import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { LibraryDatabase } from './libraryDatabase';
import * as ArchiveLoader from './archiveLoader';
import { extractEpubCover } from './epubCoverExtractor';
import { getPdfPageCount, renderPdfFirstPageCover } from './pdfCoverExtractor';
import { generateThumbnail } from './thumbnailGenerator';
import type { ScanProgress } from '../shared/types';

const COMIC_EXTENSIONS = new Set(['.cbz', '.cbr']);
const BOOK_EXTENSIONS = new Set(['.pdf', '.epub', '.mobi']);
const COVER_EXTRACTION_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export interface FileScanner {
  scan(
    directoryPath: string,
    onProgress: (progress: ScanProgress) => void
  ): Promise<number>;
  scanBooks(
    directoryPath: string,
    onProgress: (progress: ScanProgress) => void
  ): Promise<number>;
}

export class FileScannerImpl implements FileScanner {
  constructor(private db: LibraryDatabase) {}

  async scan(
    directoryPath: string,
    onProgress: (progress: ScanProgress) => void
  ): Promise<number> {
    return this.scanFiles(directoryPath, COMIC_EXTENSIONS, 'comic', onProgress);
  }

  async scanBooks(
    directoryPath: string,
    onProgress: (progress: ScanProgress) => void
  ): Promise<number> {
    return this.scanFiles(directoryPath, BOOK_EXTENSIONS, 'book', onProgress);
  }

  private async scanFiles(
    directoryPath: string,
    extensions: Set<string>,
    mediaType: 'comic' | 'book',
    onProgress: (progress: ScanProgress) => void
  ): Promise<number> {
    const progress: ScanProgress = {
      discovered: 0,
      processed: 0,
      currentFile: '',
    };

    let newCount = 0;
    const filesToProcess: string[] = [];

    await this.discoverFiles(directoryPath, filesToProcess, extensions);
    progress.discovered = filesToProcess.length;
    onProgress({ ...progress });

    for (const filePath of filesToProcess) {
      progress.currentFile = filePath;
      onProgress({ ...progress });

      try {
        if (this.db.comicExistsByPath(filePath)) {
          if (mediaType === 'book') {
            await this.refreshBookMetadata(filePath);
          }
        } else {
          if (mediaType === 'comic') {
            await this.processComicFile(filePath);
          } else {
            await this.processBookFile(filePath);
          }
          newCount++;
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

  private async processComicFile(filePath: string): Promise<void> {
    const stats = await fs.stat(filePath);
    const handle = await ArchiveLoader.open(filePath);
    try {
      let coverImage: Buffer | null = null;
      try {
        coverImage = await ArchiveLoader.getCoverImage(handle);
      } catch (err) {
        console.warn(`Failed to extract cover from ${filePath}; using placeholder thumbnail.`, err);
      }
      const coverThumbnail = generateThumbnail(coverImage);
      const title = path.basename(filePath, path.extname(filePath));

      this.db.addComic({
        filePath,
        title,
        pageCount: handle.pageCount,
        fileSize: stats.size,
        coverThumbnail,
        tags: [],
        mediaType: 'comic',
        lastPage: null,
        lastLocation: null,
        lastRead: null,
      });
    } finally {
      await ArchiveLoader.close(handle);
    }
  }

  private async processBookFile(filePath: string): Promise<void> {
    const stats = await fs.stat(filePath);
    const title = path.basename(filePath, path.extname(filePath));

    const pageCount = await this.getBookPageCount(filePath);

    this.db.addComic({
      filePath,
      title,
      pageCount,
      fileSize: stats.size,
      coverThumbnail: null,
      tags: [],
      mediaType: 'book',
      lastPage: null,
      lastLocation: null,
      lastRead: null,
    });

    await this.refreshBookMetadata(filePath);
  }

  private async refreshBookMetadata(filePath: string): Promise<void> {
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
        return coverImage ? generateThumbnail(coverImage) : null;
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
