import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LibraryDatabase } from '../libraryDatabase';
import * as ArchiveLoader from '../archiveLoader';
import { FileScannerImpl } from '../fileScanner';
import { extractEpubCover } from '../epubCoverExtractor';
import { getPdfPageCount, renderPdfFirstPageCover } from '../pdfCoverExtractor';
import { generateThumbnail } from '../thumbnailGenerator';
import { parseSeriesFromFilename } from '../seriesParser';

export const COMIC_EXTS = new Set(['.cbz', '.cbr']);
export const BOOK_EXTS = new Set(['.pdf', '.epub', '.mobi']);
const COVER_EXTRACTION_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function addSingleFile(db: LibraryDatabase, filePath: string): Promise<{ added: boolean; error?: string }> {
  const ext = path.extname(filePath).toLowerCase();
  if (!COMIC_EXTS.has(ext) && !BOOK_EXTS.has(ext)) {
    return { added: false, error: 'Unsupported file type' };
  }
  if (db.comicExistsByPath(filePath)) return { added: false };
  try {
    const stats = fs.statSync(filePath);
    const title = path.basename(filePath, ext);
    const seriesInfo = parseSeriesFromFilename(path.basename(filePath));

    if (BOOK_EXTS.has(ext)) {
      let pageCount = 0;
      if (ext === '.pdf') {
        try { pageCount = await withTimeout(getPdfPageCount(filePath), COVER_EXTRACTION_TIMEOUT_MS); } catch { /* ignore */ }
      }
      const record = db.addComic({
        filePath, title, pageCount, fileSize: stats.size,
        coverThumbnail: null, tags: [], mediaType: 'book',
        lastPage: null, lastLocation: null, lastRead: null,
      });
      if (seriesInfo.seriesName) {
        db.setComicSeries(record.id, seriesInfo.seriesName, seriesInfo.volumeNumber, seriesInfo.chapterNumber);
      }
      if (ext === '.epub' || ext === '.pdf') {
        try {
          const coverThumbnail = ext === '.epub'
            ? generateThumbnail(await withTimeout(extractEpubCover(filePath), COVER_EXTRACTION_TIMEOUT_MS))
            : await withTimeout(renderPdfFirstPageCover(filePath), COVER_EXTRACTION_TIMEOUT_MS);
          if (coverThumbnail) db.updateCoverThumbnailByPath(record.filePath, coverThumbnail);
        } catch { /* placeholder thumbnail */ }
      }
      return { added: true };
    }

    const handle = await ArchiveLoader.open(filePath);
    try {
      let coverImage: Buffer | null = null;
      try { coverImage = await ArchiveLoader.getCoverImage(handle); } catch { /* placeholder */ }
      const coverThumbnail = generateThumbnail(coverImage);
      const record = db.addComic({
        filePath, title, pageCount: handle.pageCount, fileSize: stats.size,
        coverThumbnail, tags: [], mediaType: 'comic',
        lastPage: null, lastLocation: null, lastRead: null,
      });
      if (seriesInfo.seriesName) {
        db.setComicSeries(record.id, seriesInfo.seriesName, seriesInfo.volumeNumber, seriesInfo.chapterNumber);
      }
    } finally {
      await ArchiveLoader.close(handle);
    }
    return { added: true };
  } catch (err) {
    return { added: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type IngestEvent =
  | { type: 'progress'; phase: 'comics' | 'books' | 'file'; discovered: number; processed: number; currentFile: string }
  | { type: 'error'; message: string }
  | { type: 'done'; added: number };

export async function ingestPathStreaming(
  db: LibraryDatabase,
  targetPath: string,
  emit: (event: IngestEvent) => void,
): Promise<void> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(targetPath);
  } catch (err) {
    emit({ type: 'error', message: `Cannot access path: ${err instanceof Error ? err.message : String(err)}` });
    emit({ type: 'done', added: 0 });
    return;
  }

  if (stat.isDirectory()) {
    const scanner = new FileScannerImpl(db);
    let added = 0;
    try {
      added += await scanner.scan(targetPath, (p) => {
        emit({ type: 'progress', phase: 'comics', discovered: p.discovered, processed: p.processed, currentFile: path.basename(p.currentFile) });
      });
    } catch (err) {
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    try {
      added += await scanner.scanBooks(targetPath, (p) => {
        emit({ type: 'progress', phase: 'books', discovered: p.discovered, processed: p.processed, currentFile: path.basename(p.currentFile) });
      });
    } catch (err) {
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    emit({ type: 'done', added });
    return;
  }

  if (stat.isFile()) {
    emit({ type: 'progress', phase: 'file', discovered: 1, processed: 0, currentFile: path.basename(targetPath) });
    const result = await addSingleFile(db, targetPath);
    emit({ type: 'progress', phase: 'file', discovered: 1, processed: 1, currentFile: path.basename(targetPath) });
    if (result.error) emit({ type: 'error', message: `${targetPath}: ${result.error}` });
    emit({ type: 'done', added: result.added ? 1 : 0 });
    return;
  }

  emit({ type: 'error', message: 'Path is not a regular file or directory' });
  emit({ type: 'done', added: 0 });
}
