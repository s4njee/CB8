import { ipcMain, BrowserWindow } from 'electron';
import type { LibraryDatabase } from '../libraryDatabase';

export function registerAppHandlers(db: LibraryDatabase | null): void {
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

  ipcMain.handle('app-meta:get', (_e, key: string) => {
    return db?.getAppMeta(key) ?? null;
  });

  ipcMain.handle('app-meta:set', (_e, key: string, value: string) => {
    db?.setAppMeta(key, value);
  });
}
