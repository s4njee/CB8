import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ArchiveLoader from './archiveLoader';
import type { ArchiveHandle } from './archiveLoader';
import { LibraryDatabase } from './libraryDatabase';
import { FileScannerImpl } from './fileScanner';
import { generateThumbnail } from './thumbnailGenerator';
import type { QueryOptions } from '../shared/types';

let currentHandle: ArchiveHandle | null = null;

export function registerIpcHandlers(db: LibraryDatabase | null): void {
  const scanner = db ? new FileScannerImpl(db) : null;

  // --- Archive channels ---

  ipcMain.handle('archive:open', async (_e, filePath: string) => {
    try {
      if (currentHandle) await ArchiveLoader.close(currentHandle);
      currentHandle = await ArchiveLoader.open(filePath);
      return { pageCount: currentHandle.pageCount, filename: currentHandle.filePath };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('archive:page', async (_e, pageIndex: number) => {
    if (!currentHandle) return { error: 'No archive open' };
    try {
      const buf = await ArchiveLoader.getPage(currentHandle, pageIndex);
      const ext = currentHandle.entries[pageIndex]?.filename.split('.').pop()?.toLowerCase() ?? '';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
        avif: 'image/avif', jxl: 'image/png', // JXL decoded to PNG
      };
      const mime = mimeMap[ext] ?? 'image/png';
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      return { dataUrl };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('archive:close', async () => {
    if (currentHandle) {
      await ArchiveLoader.close(currentHandle);
      currentHandle = null;
    }
  });

  // --- Dialog channels ---

  ipcMain.handle('dialog:open-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      filters: [{ name: 'Comic Archives', extensions: ['cbz', 'cbr'] }],
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
    return scanner.scan(directoryPath, (progress) => {
      win?.webContents.send('library:scan-progress', progress);
    });
  });

  ipcMain.handle('library:add-files', async (_e, filePaths: string[]) => {
    if (!db) return { added: 0, errors: [] };
    let added = 0;
    const errors: string[] = [];
    for (const filePath of filePaths) {
      try {
        if (db.comicExistsByPath(filePath)) continue;
        const stats = fs.statSync(filePath);
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
          db.addComic({
            filePath,
            title,
            pageCount: handle.pageCount,
            fileSize: stats.size,
            coverThumbnail,
            tags: [],
          });
          added++;
        } finally {
          await ArchiveLoader.close(handle);
        }
      } catch (err) {
        errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { added, errors };
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
    const comic = db?.getComic(comicId);
    return comic?.coverThumbnail ?? null;
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

  ipcMain.handle('libraries:list', () => {
    return db?.getAllLibraries() ?? [];
  });

  ipcMain.handle('libraries:create', (_e, name: string) => {
    return db?.createLibrary(name) ?? null;
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

  // --- Reading progress channels ---

  ipcMain.handle('reading:update-progress', (_e, comicId: number, pageIndex: number) => {
    db?.updateReadingProgress(comicId, pageIndex);
  });

  ipcMain.handle('reading:recently-read', (_e, limit?: number) => {
    return db?.getRecentlyRead(limit ?? 10) ?? [];
  });

  ipcMain.handle('reading:get-comic-by-path', (_e, filePath: string) => {
    return db?.getComicByPath(filePath) ?? null;
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

  // --- Window channels ---

  ipcMain.handle('window:toggle-fullscreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (process.platform === 'linux') {
      win.setSimpleFullScreen(!win.isSimpleFullScreen());
    } else {
      win.setFullScreen(!win.isFullScreen());
    }
  });

  ipcMain.handle('window:exit-fullscreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (process.platform === 'linux') {
      win.setSimpleFullScreen(false);
    } else {
      win.setFullScreen(false);
    }
  });
}
