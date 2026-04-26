import { ipcMain, BrowserWindow, shell } from 'electron';

/**
 * Host-only window/shell IPC. Fullscreen toggling drives Electron's
 * BrowserWindow chrome (the browser SPA uses the native Fullscreen API
 * and never reaches this bridge). `shell:open-path` reveals a file in
 * the OS file manager / default app and is invoked from the SPA via
 * `host.openExternalPath`.
 */
export function registerAppHandlers(): void {
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

  ipcMain.handle('shell:open-path', async (_e, filePath: string) => {
    return shell.openPath(filePath);
  });
}
