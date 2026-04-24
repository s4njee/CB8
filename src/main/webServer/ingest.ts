import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LibraryDatabase } from '../libraryDatabase';
import { FileScannerImpl } from '../fileScanner';
import { IngestService } from '../ingestService';
import { COMIC_EXTENSIONS, BOOK_EXTENSIONS } from '../../shared/mediaTypes';

export const COMIC_EXTS = new Set([...COMIC_EXTENSIONS].map(e => `.${e}`));
export const BOOK_EXTS = new Set([...BOOK_EXTENSIONS].map(e => `.${e}`));

export async function addSingleFile(db: LibraryDatabase, filePath: string): Promise<{ added: boolean; error?: string }> {
  return new IngestService(db).addFile(filePath);
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
