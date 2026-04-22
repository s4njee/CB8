import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as ArchiveLoader from './archiveLoader';
import type { ArchiveHandle } from './archiveLoader';
import { LibraryDatabase } from './libraryDatabase';
import { FileScannerImpl } from './fileScanner';
import { extractEpubCover } from './epubCoverExtractor';
import { getPdfPageCount, renderPdfFirstPageCover } from './pdfCoverExtractor';
import { generateThumbnail } from './thumbnailGenerator';
import { startWebServer, closeAllHandles } from './webServer';
import type { WebServerHandle } from './webServer';
import type { QueryOptions } from '../shared/types';

let currentHandle: ArchiveHandle | null = null;
const COVER_EXTRACTION_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function registerIpcHandlers(
  db: LibraryDatabase | null,
  webServerRef?: { handle: WebServerHandle | null },
): void {
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

  ipcMain.handle('book:read-file', async (_e, filePath: string) => {
    const bytes = await fsp.readFile(filePath);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  });

  // --- Dialog channels ---

  ipcMain.handle('dialog:open-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      filters: [{ name: 'Supported Books and Comics', extensions: ['cbz', 'cbr', 'epub', 'pdf', 'mobi'] }],
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

  ipcMain.handle('library:scan-books', async (e, directoryPath: string) => {
    if (!scanner) return 0;
    const win = BrowserWindow.fromWebContents(e.sender);
    return scanner.scanBooks(directoryPath, (progress) => {
      win?.webContents.send('library:scan-progress', progress);
    });
  });

  ipcMain.handle('library:add-files', async (_e, filePaths: string[]) => {
    if (!db) return { added: 0, errors: [] };
    let added = 0;
    const errors: string[] = [];
    const bookExts = new Set(['.pdf', '.epub', '.mobi']);
    for (const filePath of filePaths) {
      try {
        if (db.comicExistsByPath(filePath)) continue;
        const ext = path.extname(filePath).toLowerCase();
        const stats = fs.statSync(filePath);
        const title = path.basename(filePath, ext);

        if (bookExts.has(ext)) {
          let pageCount = 0;
          if (ext === '.pdf') {
            try {
              pageCount = await withTimeout(getPdfPageCount(filePath), COVER_EXTRACTION_TIMEOUT_MS);
            } catch (pageErr) {
              console.warn(`Failed to read PDF page count from ${filePath}.`, pageErr);
            }
          }
          const record = db.addComic({
            filePath, title, pageCount, fileSize: stats.size,
            coverThumbnail: null, tags: [], mediaType: 'book', lastPage: null, lastLocation: null, lastRead: null,
          });
          if (ext === '.epub' || ext === '.pdf') {
            try {
              const coverThumbnail = ext === '.epub'
                ? generateThumbnail(await withTimeout(extractEpubCover(filePath), COVER_EXTRACTION_TIMEOUT_MS))
                : await withTimeout(renderPdfFirstPageCover(filePath), COVER_EXTRACTION_TIMEOUT_MS);
              if (coverThumbnail) db.updateCoverThumbnailByPath(record.filePath, coverThumbnail);
            } catch (coverErr) {
              console.warn(`Failed to extract book cover from ${filePath}; using placeholder thumbnail.`, coverErr);
            }
          }
          added++;
        } else {
          const handle = await ArchiveLoader.open(filePath);
          try {
            let coverImage: Buffer | null = null;
            try {
              coverImage = await ArchiveLoader.getCoverImage(handle);
            } catch (err) {
              console.warn(`Failed to extract cover from ${filePath}; using placeholder thumbnail.`, err);
            }
            const coverThumbnail = generateThumbnail(coverImage);
            db.addComic({
              filePath, title, pageCount: handle.pageCount, fileSize: stats.size,
              coverThumbnail, tags: [], mediaType: 'comic', lastPage: null, lastLocation: null, lastRead: null,
            });
            added++;
          } finally {
            await ArchiveLoader.close(handle);
          }
        }
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

    const ext = path.extname(record.filePath).toLowerCase();
    if (ext === '.pdf' && record.pageCount <= 0) {
      try {
        const pageCount = await withTimeout(getPdfPageCount(record.filePath), COVER_EXTRACTION_TIMEOUT_MS);
        if (pageCount > 0) db.updatePageCountByPath(record.filePath, pageCount);
      } catch (pageErr) {
        console.warn(`Failed to read PDF page count from ${record.filePath}.`, pageErr);
      }
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

  // --- Reading progress channels ---

  ipcMain.handle('reading:update-progress', (_e, comicId: number, pageIndex: number) => {
    db?.updateReadingProgress(comicId, pageIndex);
  });

  ipcMain.handle('reading:update-location', (_e, comicId: number, location: string) => {
    db?.updateReadingLocation(comicId, location);
  });

  ipcMain.handle('reading:recently-read', (_e, limit?: number, mediaType?: 'comic' | 'book') => {
    return db?.getRecentlyRead(limit ?? 10, mediaType) ?? [];
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

  // --- Web server settings channels ---

  const WEB_ENABLED_KEY = 'web_server_enabled';
  const WEB_PORT_KEY = 'web_server_port';
  const DEFAULT_PORT = 8008;

  // Auto-start web server on boot if previously enabled
  if (db && webServerRef && db.getAppMeta(WEB_ENABLED_KEY) === 'true' && !webServerRef.handle) {
    const rawPort = db.getAppMeta(WEB_PORT_KEY);
    const port = rawPort ? parseInt(rawPort, 10) : DEFAULT_PORT;
    const safePort = isNaN(port) ? DEFAULT_PORT : Math.max(1024, Math.min(65535, port));
    try {
      webServerRef.handle = startWebServer(db, safePort);
    } catch (err) {
      console.error('[CB8] Failed to auto-start web server:', err);
    }
  }

  function getWebSettings() {
    const rawEnabled = db ? db.getAppMeta(WEB_ENABLED_KEY) : null;
    const enabled = rawEnabled === 'true'; // default false (opt-in)
    const rawPort = db ? db.getAppMeta(WEB_PORT_KEY) : null;
    const port = rawPort ? parseInt(rawPort, 10) : DEFAULT_PORT;
    const handle = webServerRef?.handle ?? null;
    return {
      enabled,
      port: isNaN(port) ? DEFAULT_PORT : port,
      url: handle ? handle.url : null,
      lanUrl: handle ? handle.lanUrl : null,
    };
  }

  ipcMain.handle('webserver:get-settings', () => {
    return getWebSettings();
  });

  ipcMain.handle('webserver:set-settings', async (_e, enabled: boolean, port: number) => {
    if (!db || !webServerRef) return getWebSettings();

    const safePort = Math.max(1024, Math.min(65535, Math.floor(port)));
    db.setAppMeta(WEB_ENABLED_KEY, String(enabled));
    db.setAppMeta(WEB_PORT_KEY, String(safePort));

    const currentHandle = webServerRef.handle;

    if (!enabled && currentHandle) {
      // Stop the server
      await new Promise<void>((resolve) => {
        currentHandle.server.close(() => resolve());
        setTimeout(resolve, 1000);
      });
      await closeAllHandles();
      webServerRef.handle = null;
    } else if (enabled && !currentHandle) {
      // Start the server
      try {
        webServerRef.handle = startWebServer(db, safePort);
      } catch (err) {
        console.error('[CB8] Failed to start web server:', err);
      }
    } else if (enabled && currentHandle && currentHandle.port !== safePort) {
      // Port changed — restart
      await new Promise<void>((resolve) => {
        currentHandle.server.close(() => resolve());
        setTimeout(resolve, 1000);
      });
      await closeAllHandles();
      try {
        webServerRef.handle = startWebServer(db, safePort);
      } catch (err) {
        console.error('[CB8] Failed to restart web server:', err);
        webServerRef.handle = null;
      }
    }

    return getWebSettings();
  });
}
