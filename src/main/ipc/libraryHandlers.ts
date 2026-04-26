import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fsp from 'node:fs/promises';
import type { LibraryDatabase } from '../libraryDatabase';
import { FileScannerImpl } from '../fileScanner';
import { IngestService } from '../ingestService';
import type { QueryOptions } from '../../shared/types';
import { ALL_EXTENSIONS_ARRAY } from '../../shared/mediaTypes';

export function registerLibraryHandlers(
  db: LibraryDatabase | null,
  onRecentFilesChanged?: (filePath?: string) => void,
): void {
  const scanner = db ? new FileScannerImpl(db) : null;
  let scanAbortController: AbortController | null = null;

  // --- Dialog channels ---

  ipcMain.handle('dialog:open-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      filters: [{ name: 'Supported Books and Comics', extensions: ALL_EXTENSIONS_ARRAY }],
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:open-directory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // --- Library channels ---

  ipcMain.handle('library:query', (_e, options: QueryOptions) => {
    if (!db) return { records: [], totalCount: 0 };
    return db.queryComics(options);
  });

  ipcMain.handle('library:scan', async (e, directoryPath: string) => {
    if (!scanner) return 0;
    const win = BrowserWindow.fromWebContents(e.sender);
    scanAbortController = new AbortController();
    try {
      return await scanner.scan(directoryPath, (progress) => {
        win?.webContents.send('library:scan-progress', progress);
      }, scanAbortController.signal);
    } finally {
      scanAbortController = null;
    }
  });

  ipcMain.handle('library:scan-books', async (e, directoryPath: string) => {
    if (!scanner) return 0;
    const win = BrowserWindow.fromWebContents(e.sender);
    scanAbortController = new AbortController();
    try {
      return await scanner.scanBooks(directoryPath, (progress) => {
        win?.webContents.send('library:scan-progress', progress);
      }, scanAbortController.signal);
    } finally {
      scanAbortController = null;
    }
  });

  ipcMain.on('library:scan-cancel', () => {
    scanAbortController?.abort();
    scanAbortController = null;
  });

  ipcMain.handle('library:classify-paths', async (_e, paths: string[]) => {
    const files: string[] = [];
    const directories: string[] = [];
    for (const p of paths) {
      try {
        const stats = await fsp.stat(p);
        if (stats.isDirectory()) directories.push(p);
        else if (stats.isFile()) files.push(p);
      } catch (err) {
        console.warn(`Failed to stat dropped path ${p}:`, err);
      }
    }
    return { files, directories };
  });

  ipcMain.handle('library:add-files', async (_e, filePaths: string[]) => {
    if (!db) return { added: 0, errors: [] };
    const ingestService = new IngestService(db);
    let added = 0;
    const errors: string[] = [];
    for (const filePath of filePaths) {
      try {
        const result = await ingestService.addFile(filePath);
        if (result.added) added++;
        else if (result.error) errors.push(`${filePath}: ${result.error}`);
      } catch (err) {
        errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { added, errors };
  });

  ipcMain.handle('library:refresh-book-metadata', async (_e, comicId: number) => {
    if (!db) return null;
    const record = db.getComic(comicId);
    if (!record || record.mediaType !== 'book') return record;

    if (scanner && record.filePath.toLowerCase().endsWith('.pdf') && record.pageCount <= 0) {
      await scanner.refreshBookMetadata(record.filePath);
    }

    return db.getComic(comicId);
  });

  ipcMain.handle('library:add-tag', (_e, comicId: number, tag: string) => {
    db?.addTag(comicId, tag);
  });

  ipcMain.handle('library:remove-tag', (_e, comicId: number, tag: string) => {
    db?.removeTag(comicId, tag);
  });

  ipcMain.handle('library:remove-comics', (_e, ids: number[]) => {
    db?.removeComics(ids);
  });

  ipcMain.handle('library:get-thumbnail', (_e, comicId: number) => {
    return db?.getCoverThumbnail(comicId) ?? null;
  });

  ipcMain.handle('library:get-tags', () => {
    return db?.getAllTags() ?? [];
  });

  ipcMain.handle('library:rename-tag', (_e, oldName: string, newName: string) => {
    db?.renameTag(oldName, newName);
  });

  ipcMain.handle('library:delete-tag', (_e, tag: string) => {
    db?.deleteTag(tag);
  });

  ipcMain.handle('library:add-tag-bulk', (_e, comicIds: number[], tag: string) => {
    db?.addTagBulk(comicIds, tag);
  });

  ipcMain.handle('library:remove-tag-bulk', (_e, comicIds: number[], tag: string) => {
    db?.removeTagBulk(comicIds, tag);
  });

  // --- Library collection channels ---

  ipcMain.handle('libraries:list', (_e, mediaType?: 'comic' | 'book') => {
    return db?.getAllLibraries(mediaType) ?? [];
  });

  ipcMain.handle('libraries:create', (_e, name: string, mediaType?: 'comic' | 'book') => {
    return db?.createLibrary(name, mediaType ?? 'comic') ?? null;
  });

  ipcMain.handle('libraries:rename', (_e, id: number, newName: string) => {
    db?.renameLibrary(id, newName);
  });

  ipcMain.handle('libraries:delete', (_e, id: number) => {
    db?.deleteLibrary(id);
  });

  ipcMain.handle('libraries:add-comics', (_e, libraryId: number, comicIds: number[]) => {
    db?.addComicsToLibrary(libraryId, comicIds);
  });

  ipcMain.handle('libraries:add-folders', (_e, libraryId: number, folderIds: number[]) => {
    db?.addFoldersToLibrary(libraryId, folderIds);
  });

  ipcMain.handle('libraries:remove-comics', (_e, libraryId: number, comicIds: number[]) => {
    db?.removeComicsFromLibrary(libraryId, comicIds);
  });

  ipcMain.handle('libraries:query', (_e, libraryId: number, options: QueryOptions) => {
    if (!db) return { records: [], totalCount: 0 };
    return db.queryComicsByLibrary(libraryId, options);
  });

  // --- Folder channels ---

  ipcMain.handle('folders:list', (_e, libraryId?: number | null) => {
    return db?.getAllFolders(libraryId) ?? [];
  });

  ipcMain.handle('folders:create', (_e, name: string, comicIds: number[]) => {
    return db?.createFolder(name, comicIds) ?? null;
  });

  ipcMain.handle('folders:rename', (_e, id: number, newName: string) => {
    db?.renameFolder(id, newName);
  });

  ipcMain.handle('folders:delete', (_e, id: number) => {
    db?.deleteFolder(id);
  });

  ipcMain.handle('folders:add-comics', (_e, folderId: number, comicIds: number[]) => {
    db?.addComicsToFolder(folderId, comicIds);
  });

  ipcMain.handle('folders:remove-comics', (_e, folderId: number, comicIds: number[]) => {
    db?.removeComicsFromFolder(folderId, comicIds);
  });

  ipcMain.handle('folders:query', (_e, folderId: number, options: QueryOptions) => {
    if (!db) return { records: [], totalCount: 0 };
    return db.getFolderComics(folderId, options);
  });
}
