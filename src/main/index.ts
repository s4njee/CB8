import { app, BrowserWindow, Menu, dialog, shell, type MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { LibraryDatabase } from './libraryDatabase';
import { registerIpcHandlers } from './ipcHandlers';
import { closeAllHandles, startWebServer } from './webServer';
import type { WebServerHandle } from './webServer';
import { DbStartupError } from './db/schema';
import { resetDefaultAdmin } from './adminReset';

const isHeadless =
  process.argv.includes('--headless') ||
  process.env.CB8_HEADLESS === '1';

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

/**
 * Close the DB, unlink the sqlite file + its WAL/SHM sidecars, then relaunch
 * Electron so the app starts against a fresh schema. Destructive; requires
 * explicit confirmation from the user.
 */
async function clearDatabaseAndRelaunch(win: BrowserWindow): Promise<void> {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'library.db');
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Cancel', 'Clear database'],
    defaultId: 0,
    cancelId: 0,
    title: 'Clear database',
    message: 'Delete the entire CB8 library database?',
    detail:
      `This will remove all libraries, folders, tags, reading progress, and user accounts.\n\n` +
      `Comic and book files on disk are NOT removed. CB8 will restart with an empty database.\n\n` +
      `Database: ${dbPath}`,
  });
  if (result.response !== 1) return;

  // Close handles so SQLite releases the file.
  try { await closeAllHandles(); } catch { /* ignore */ }
  if (webServerRef.handle) {
    try { webServerRef.handle.server.close(); } catch { /* ignore */ }
    webServerRef.handle = null;
  }
  try {
    if (db) {
      db.raw.close();
    }
  } catch (err) {
    console.warn('[CB8] Failed to close DB before clear:', err);
  }
  db = null;

  for (const suffix of ['', '-wal', '-shm']) {
    const target = dbPath + suffix;
    try { fs.unlinkSync(target); } catch { /* may not exist */ }
  }

  if (app.isPackaged) {
    app.relaunch();
  }
  app.quit();
}

/**
 * Reset the default admin account (`admin` / `gentrification`) in-place:
 * useful when the operator can't log into the web UI. Keeps the rest of the
 * library intact — this only touches the admin row and its credential row.
 */
async function resetAdminPassword(win: BrowserWindow): Promise<void> {
  if (!db) {
    await dialog.showMessageBox(win, {
      type: 'error',
      title: 'Database unavailable',
      message: 'Cannot reset admin password: database is not open.',
    });
    return;
  }
  const confirm = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Cancel', 'Reset admin password'],
    defaultId: 0,
    cancelId: 0,
    title: 'Reset admin password',
    message: 'Reset the admin account to the default password?',
    detail:
      'Sets the user named "admin" back to the default password ' +
      '"gentrification" and creates the account if it does not exist.\n\n' +
      'Library, users, and other accounts are left untouched.',
  });
  if (confirm.response !== 1) return;

  try {
    const result = await resetDefaultAdmin(db);
    await dialog.showMessageBox(win, {
      type: 'info',
      title: result.created ? 'Admin created' : 'Admin password reset',
      message: result.created ? 'Admin account created.' : 'Admin password reset.',
      detail: `Username: ${result.username}\nPassword: ${result.password}\n\nChange it after signing in.`,
    });
  } catch (err) {
    await dialog.showMessageBox(win, {
      type: 'error',
      title: 'Reset failed',
      message: 'Failed to reset the admin password.',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
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
        { type: 'separator' },
        {
          label: 'Reset Admin Password…',
          click: () => {
            resetAdminPassword(win).catch((err) => {
              console.error('[CB8] Reset admin password failed:', err);
            });
          },
        },
        {
          label: 'Clear Database…',
          click: () => {
            clearDatabaseAndRelaunch(win).catch((err) => {
              console.error('[CB8] Clear database failed:', err);
            });
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

  // Open the database and register IPC handlers. Keep these independent so a
  // DB-init failure doesn't leave the renderer without any handlers — it
  // still gets real "db unavailable"-style errors from the channels instead
  // of "No handler registered".
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'library.db');
  try {
    db = new LibraryDatabase(dbPath);
    db.initialize();
  } catch (err) {
    if (err instanceof DbStartupError) {
      console.error(`[CB8] DB startup failed (${err.category}): ${err.detail}`, err.cause);
    } else {
      console.error(`[CB8] Failed to open database at ${dbPath}:`, err);
    }
    db = null;
  }
  try {
    registerIpcHandlers(db, webServerRef, refreshRecentMenu);
  } catch (err) {
    console.error('[CB8] Failed to register IPC handlers:', err);
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

function startHeadless(): void {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  try {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'library.db');
    db = new LibraryDatabase(dbPath);
    db.initialize();
    registerIpcHandlers(db, webServerRef);
  } catch (err) {
    console.error('[CB8] Failed to initialize database or IPC:', err);
    process.exit(1);
  }

  const rawPort = db!.getAppMeta('web_server_port');
  const parsed = rawPort ? parseInt(rawPort, 10) : NaN;
  const port = Number.isFinite(parsed)
    ? Math.max(1024, Math.min(65535, parsed))
    : 8008;

  try {
    if (!webServerRef.handle) {
      webServerRef.handle = startWebServer(db!, port);
    }
  } catch (err) {
    console.error('[CB8] Failed to start web server in headless mode:', err);
    process.exit(1);
  }

  const shutdown = (): void => {
    console.log('[CB8] Shutting down headless server…');
    app.quit();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

app.on('ready', () => {
  if (isHeadless) {
    startHeadless();
  } else {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (isHeadless) return;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFileInWindow(filePath);
});

let isQuitting = false;
app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  (async () => {
    try { await closeAllHandles(); } catch { /* ignore */ }
    if (webServerRef.handle) {
      try { webServerRef.handle.server.close(); } catch { /* ignore */ }
      webServerRef.handle = null;
    }
    try {
      if (db) db.raw.close();
    } catch { /* ignore */ }
    db = null;
    app.quit();
  })();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
