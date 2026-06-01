import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LibraryDatabase } from '../libraryDatabase';
import { FileScannerImpl } from '../fileScanner';
import { IngestService, type IngestFailure } from '../ingestService';
import { COMIC_EXTENSIONS, BOOK_EXTENSIONS } from '../../shared/mediaTypes';

export const COMIC_EXTS = new Set([...COMIC_EXTENSIONS].map(e => `.${e}`));
export const BOOK_EXTS = new Set([...BOOK_EXTENSIONS].map(e => `.${e}`));

export async function addSingleFile(
  db: LibraryDatabase,
  filePath: string,
  folderId?: number,
): Promise<{ added: boolean; error?: string }> {
  return new IngestService(db).addFile(filePath, folderId);
}

/** Number of per-file failure examples emitted at the end of a scan. The full
 * list lives in the persistent `ingest-errors.jsonl`; we just give the SPA
 * enough to render a useful summary without flooding the wire. */
const FAILURE_SAMPLE_SIZE = 20;

export type IngestEvent =
  | { type: 'progress'; phase: 'comics' | 'books' | 'file'; discovered: number; processed: number; currentFile: string }
  | { type: 'error'; message: string }
  | { type: 'failures-summary'; total: number; byClass: Record<string, number>; sample: IngestFailure[] }
  | { type: 'done'; added: number };

export interface IngestPathOptions {
  folderId?: number;
  useFolderNamesAsSeries?: boolean;
}

export async function ingestPathStreaming(
  db: LibraryDatabase,
  targetPath: string,
  emit: (event: IngestEvent) => void,
  options: IngestPathOptions = {},
): Promise<void> {
  const { folderId, useFolderNamesAsSeries = false } = options;
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
    const allFailures: IngestFailure[] = [];
    try {
      const r = await scanner.scan(targetPath, (p) => {
        emit({ type: 'progress', phase: 'comics', discovered: p.discovered, processed: p.processed, currentFile: path.basename(p.currentFile) });
      }, undefined, folderId, { useFolderNamesAsSeries });
      added += r.added;
      allFailures.push(...r.failures);
    } catch (err) {
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    try {
      const r = await scanner.scanBooks(targetPath, (p) => {
        emit({ type: 'progress', phase: 'books', discovered: p.discovered, processed: p.processed, currentFile: path.basename(p.currentFile) });
      }, undefined, folderId, { useFolderNamesAsSeries });
      added += r.added;
      allFailures.push(...r.failures);
    } catch (err) {
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    if (allFailures.length > 0) emit(buildFailuresSummary(allFailures));
    emit({ type: 'done', added });
    return;
  }

  if (stat.isFile()) {
    emit({ type: 'progress', phase: 'file', discovered: 1, processed: 0, currentFile: path.basename(targetPath) });
    const result = await addSingleFile(db, targetPath, folderId);
    emit({ type: 'progress', phase: 'file', discovered: 1, processed: 1, currentFile: path.basename(targetPath) });
    if (result.error) emit({ type: 'error', message: `${targetPath}: ${result.error}` });
    emit({ type: 'done', added: result.added ? 1 : 0 });
    return;
  }

  emit({ type: 'error', message: 'Path is not a regular file or directory' });
  emit({ type: 'done', added: 0 });
}

function buildFailuresSummary(failures: IngestFailure[]): IngestEvent {
  const byClass: Record<string, number> = {};
  for (const f of failures) byClass[f.errorClass] = (byClass[f.errorClass] ?? 0) + 1;
  return {
    type: 'failures-summary',
    total: failures.length,
    byClass,
    sample: failures.slice(0, FAILURE_SAMPLE_SIZE),
  };
}
