import { app, BrowserWindow, Menu, dialog, shell, type MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
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
let mainWindow: BrowserWindow | null = null;
const pendingOpenFiles: string[] = [];
const RECENT_FILE_LIMIT = 12;

/**
 * Shared mutable reference so registerIpcHandlers can update the active
 * server handle when the user enables/disables/reconfigures the web server.
 */
const webServerRef: { handle: WebServerHandle | null } = { handle: null };

app.setName('CB8');

function openFileInWindow(filePath: string): void {
  if (typeof app.addRecentDocument === 'function') {
    app.addRecentDocument(filePath);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('file-opened', filePath);
    return;
  }

  pendingOpenFiles.push(filePath);
}

function refreshRecentMenu(filePath?: string): void {
  if (filePath && typeof app.addRecentDocument === 'function') {
    app.addRecentDocument(filePath);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    Menu.setApplicationMenu(buildApplicationMenu(mainWindow));
  }
}

function buildRecentMenuItems(): MenuItemConstructorOptions[] {
  const recentRecords = db?.getRecentlyRead(RECENT_FILE_LIMIT) ?? [];
  const existingRecords = recentRecords.filter((record) => fs.existsSync(record.filePath));

  if (existingRecords.length === 0) {
    return [{ label: 'No Recent Files', enabled: false }];
  }

  return existingRecords.map((record) => ({
    label: record.title || path.basename(record.filePath),
    sublabel: record.filePath,
    click: () => openFileInWindow(record.filePath),
  }));
}

function buildApplicationMenu(win: BrowserWindow): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(win, {
              filters: [{ name: 'Supported Books and Comics', extensions: ['cbz', 'cbr', 'epub', 'pdf', 'mobi'] }],
              properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              openFileInWindow(result.filePaths[0]);
            }
          },
        },
        {
          label: 'Open Recent',
          submenu: buildRecentMenuItems(),
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
            win.webContents.send('open-settings');
          },
        },
        { type: 'separator' },
        {
          label: 'Open Web UI in Browser',
          enabled: false,
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
}

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
    registerIpcHandlers(db, webServerRef, refreshRecentMenu);
  } catch (err) {
    console.error('Failed to initialize database or IPC:', err);
  }

  mainWindow = new BrowserWindow({
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

  Menu.setApplicationMenu(buildApplicationMenu(mainWindow));

  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined') {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.webContents.once('did-finish-load', () => {
    for (const filePath of pendingOpenFiles.splice(0)) {
      openFileInWindow(filePath);
    }
  });

  // mainWindow.webContents.openDevTools();
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFileInWindow(filePath);
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
