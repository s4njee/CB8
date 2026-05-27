import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { LibraryDatabase } from './libraryDatabase';
import { extractEpubCover } from './epubCoverExtractor';
import { getPdfPageCount, renderPdfFirstPageCover } from './pdfCoverExtractor';
import { generateThumbnail } from './thumbnailGenerator';
import type { ScanProgress } from '../shared/types';
import { COMIC_EXTENSIONS as COMIC_EXTS_BASE, BOOK_EXTENSIONS as BOOK_EXTS_BASE } from '../shared/mediaTypes';
import { IngestService, type IngestFailure } from './ingestService';
import { withTimeout } from './utils/timeout';

const COMIC_EXTENSIONS = new Set([...COMIC_EXTS_BASE].map(e => `.${e}`));
const BOOK_EXTENSIONS = new Set([...BOOK_EXTS_BASE].map(e => `.${e}`));
const COVER_EXTRACTION_TIMEOUT_MS = 5000;

export interface FileScanner {
  scan(
    directoryPath: string,
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
    folderId?: number,
  ): Promise<{ added: number; failures: IngestFailure[] }>;
  scanBooks(
    directoryPath: string,
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
    folderId?: number,
  ): Promise<{ added: number; failures: IngestFailure[] }>;
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
    folderId?: number,
  ): Promise<{ added: number; failures: IngestFailure[] }> {
    return this.scanFiles(directoryPath, COMIC_EXTENSIONS, 'comic', onProgress, signal, folderId);
  }

  async scanBooks(
    directoryPath: string,
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
    folderId?: number,
  ): Promise<{ added: number; failures: IngestFailure[] }> {
    return this.scanFiles(directoryPath, BOOK_EXTENSIONS, 'book', onProgress, signal, folderId);
  }

  private async scanFiles(
    directoryPath: string,
    _extensions: Set<string>,
    mediaType: 'comic' | 'book',
    onProgress: (progress: ScanProgress) => void,
    signal?: AbortSignal,
    folderId?: number,
  ): Promise<{ added: number; failures: IngestFailure[] }> {
    return this.ingestService.scanDirectory(directoryPath, mediaType, onProgress, signal, folderId);
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
