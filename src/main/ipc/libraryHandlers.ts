import { ipcMain, dialog, BrowserWindow } from 'electron';
import { ALL_EXTENSIONS_ARRAY } from '../../shared/mediaTypes';

/**
 * Registers the host-only dialog channels exposed to the SPA via the
 * preload bridge. Everything that used to live here for product logic
 * (libraries, folders, comics, tags, scans, archive paging, ingest) is
 * served by the embedded HTTP API now — see `src/main/webServer/routes/`.
 */
export function registerLibraryHandlers(): void {
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
}
