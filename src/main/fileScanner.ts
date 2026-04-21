import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { LibraryDatabase } from './libraryDatabase';
import * as ArchiveLoader from './archiveLoader';
import { generateThumbnail } from './thumbnailGenerator';
import type { ScanProgress } from '../shared/types';

export interface FileScanner {
  scan(
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
    const progress: ScanProgress = {
      discovered: 0,
      processed: 0,
      currentFile: '',
    };

    let newComicsCount = 0;
    const filesToProcess: string[] = [];

    // Step 1: Discover all CBZ/CBR files recursively
    await this.discoverFiles(directoryPath, filesToProcess);
    progress.discovered = filesToProcess.length;
    onProgress({ ...progress });

    // Step 2: Process each file
    for (const filePath of filesToProcess) {
      progress.currentFile = filePath;
      onProgress({ ...progress });

      try {
        if (!this.db.comicExistsByPath(filePath)) {
          await this.processFile(filePath);
          newComicsCount++;
        }
      } catch (err) {
        console.error(`Failed to process comic at ${filePath}:`, err);
        // Continue scanning even if one file fails
      }

      progress.processed++;
      onProgress({ ...progress });

      // Yield control to the event loop periodically
      await new Promise((resolve) => setImmediate(resolve));
    }

    return newComicsCount;
  }

  private async discoverFiles(dirPath: string, files: string[]): Promise<void> {
    try {
      const dir = await fs.opendir(dirPath);
      for await (const entry of dir) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.discoverFiles(fullPath, files);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext === '.cbz' || ext === '.cbr') {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to open directory ${dirPath}:`, err);
    }
  }

  private async processFile(filePath: string): Promise<void> {
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
      });
    } finally {
      await ArchiveLoader.close(handle);
    }
  }
}
