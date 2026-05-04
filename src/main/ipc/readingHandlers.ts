import { ipcMain } from 'electron';
import type { LibraryDatabase } from '../libraryDatabase';

/**
 * Registers the single host-only reading channel: a path→record lookup
 * used by main when an OS-driven file open needs to be turned into a
 * library comic id before notifying the SPA. Reading progress and
 * recently-read queries went to HTTP in PLAN10 Phase 6.
 */
export function registerReadingHandlers(db: LibraryDatabase | null): void {
  ipcMain.handle('reading:get-comic-by-path', (_e, filePath: string) => {
    return db?.comics.getComicByPath(filePath) ?? null;
  });
}
