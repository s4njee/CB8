import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { LibraryDatabase } from './libraryDatabase';
import * as ArchiveLoader from './archiveLoader';
import { generateThumbnail } from './thumbnailGenerator';
import type { ScanProgress } from '../shared/types';

const COMIC_EXTENSIONS = new Set(['.cbz', '.cbr']);
const BOOK_EXTENSIONS = new Set(['.pdf', '.epub', '.mobi']);

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
        if (!this.db.comicExistsByPath(filePath)) {
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
        lastRead: null,
      });
    } finally {
      await ArchiveLoader.close(handle);
    }
  }

  private async processBookFile(filePath: string): Promise<void> {
    const stats = await fs.stat(filePath);
    const title = path.basename(filePath, path.extname(filePath));

    this.db.addComic({
      filePath,
      title,
      pageCount: 0,
      fileSize: stats.size,
      coverThumbnail: null,
      tags: [],
      mediaType: 'book',
      lastPage: null,
      lastRead: null,
    });
  }
}
