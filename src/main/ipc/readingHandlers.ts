import { app, ipcMain } from 'electron';
import type { LibraryDatabase } from '../libraryDatabase';

export function registerReadingHandlers(
  db: LibraryDatabase | null,
  onRecentFilesChanged?: (filePath?: string) => void,
): void {
  ipcMain.handle('reading:update-progress', (_e, comicId: number, pageIndex: number) => {
    db?.updateReadingProgress(comicId, pageIndex);
    const record = db?.getComic(comicId);
    if (record) {
      app.addRecentDocument(record.filePath);
      onRecentFilesChanged?.(record.filePath);
    }
  });

  ipcMain.handle('reading:update-location', (_e, comicId: number, location: string) => {
    db?.updateReadingLocation(comicId, location);
    const record = db?.getComic(comicId);
    if (record) {
      app.addRecentDocument(record.filePath);
      onRecentFilesChanged?.(record.filePath);
    }
  });

  ipcMain.handle('reading:recently-read', (_e, limit?: number, mediaType?: 'comic' | 'book') => {
    return db?.getRecentlyRead(limit ?? 10, mediaType) ?? [];
  });

  ipcMain.handle('reading:get-comic-by-path', (_e, filePath: string) => {
    return db?.getComicByPath(filePath) ?? null;
  });
}
