import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import path from 'node:path';
import { LibraryDatabase } from './libraryDatabase';
import { registerIpcHandlers } from './ipcHandlers';
import { closeAllHandles } from './webServer';
import type { WebServerHandle } from './webServer';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
try {
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch {
  // electron-squirrel-startup not available on non-Windows platforms
}

let db: LibraryDatabase | null = null;

/**
 * Shared mutable reference so registerIpcHandlers can update the active
 * server handle when the user enables/disables/reconfigures the web server.
 */
const webServerRef: { handle: WebServerHandle | null } = { handle: null };

app.setName('CB8');

const createWindow = (): void => {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(path.join(__dirname, '../../book.png'));
  }

  // Initialize database inside ready handler
  try {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'library.db');
    db = new LibraryDatabase(dbPath);
    db.initialize();
    registerIpcHandlers(db, webServerRef);
  } catch (err) {
    console.error('Failed to initialize database or IPC:', err);
  }

  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: 'CB8',
    icon: path.join(__dirname, '../../book.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              filters: [{ name: 'Supported Books and Comics', extensions: ['cbz', 'cbr', 'epub', 'pdf', 'mobi'] }],
              properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('file-opened', result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Settings',
      submenu: [
        {
          label: 'Web Server…',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.send('open-settings');
          },
        },
        { type: 'separator' },
        {
          label: 'Open Web UI in Browser',
          enabled: false, // updated at runtime by renderer after settings change
          id: 'open-web-ui',
          click: () => {
            if (webServerRef.handle) {
              shell.openExternal(webServerRef.handle.url);
            }
          },
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined') {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // mainWindow.webContents.openDevTools();
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await closeAllHandles();
  if (webServerRef.handle) {
    webServerRef.handle.server.close();
    webServerRef.handle = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
