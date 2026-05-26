import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { LibraryDatabase } from './libraryDatabase';
import { registerIpcHandlers } from './ipcHandlers';
import { closeAllHandles, startWebServer } from './webServer';
import { setImageCacheRoot } from './imageResizer';
import type { WebServerHandle } from './webServer';
import { DbStartupError } from './db/schema';
import { buildApplicationMenu, type MenuContext } from './menu';
import { IngestService } from './ingestService';
import { sweepSoftDeleted, logSweeperResult } from './maintenance/softDeleteSweeper';
import { LibraryWatcher } from './libraryWatcher';
import { startThumbnailBackfillWorker, type ThumbnailBackfillWorker } from './maintenance/thumbnailBackfillWorker';

const isHeadless =
  process.argv.includes('--headless') ||
  process.env.CB8_HEADLESS === '1';

// On headless servers there is no display / GPU — skip hardware acceleration
// so Electron doesn't try to initialise it and fail. Must be called before
// `app.ready` fires, hence the top-level position.
if (isHeadless) {
  app.disableHardwareAcceleration();
}

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
let sweeperTimer: NodeJS.Timeout | null = null;
let libraryWatcher: LibraryWatcher | null = null;
let thumbnailWorker: ThumbnailBackfillWorker | null = null;

const SWEEPER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * R-8 maintenance: run the soft-delete sweeper at app start (covers the
 * case where the app was idle for >24h and missed a tick) and once per
 * 24h thereafter. Errors are logged and swallowed — a failed sweep is
 * never fatal, the next tick will retry.
 */
function startSweeperSchedule(database: LibraryDatabase): void {
  const run = (label: string): void => {
    try {
      const result = sweepSoftDeleted(database.raw);
      logSweeperResult(`[CB8 sweeper:${label}]`, result);
    } catch (err) {
      console.warn('[CB8 sweeper] error:', err instanceof Error ? err.message : err);
    }
  };
  run('start');
  if (sweeperTimer) clearInterval(sweeperTimer);
  sweeperTimer = setInterval(() => run('tick'), SWEEPER_INTERVAL_MS);
  if (sweeperTimer.unref) sweeperTimer.unref();
}

function startLibraryWatcher(database: LibraryDatabase): void {
  void libraryWatcher?.stop();
  libraryWatcher = new LibraryWatcher(database);
  libraryWatcher.start();
}

function startThumbnailWorker(database: LibraryDatabase): void {
  void thumbnailWorker?.stop();
  thumbnailWorker = startThumbnailBackfillWorker(database);
}

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
    void resolveAndDispatchComic(filePath);
    return;
  }

  pendingOpenFiles.push(filePath);
}

/**
 * Translate an OS-driven file path into a library comic id and notify the
 * SPA so it can navigate to the reader. Falls back to ingesting the file
 * if it is not yet in the library. Errors are logged but never thrown.
 */
async function resolveAndDispatchComic(filePath: string): Promise<void> {
  const win = mainWindow;
  if (!win || win.isDestroyed() || !db) return;
  try {
    let record = db.comics.getComicByPath(filePath);
    if (!record) {
      const ingest = new IngestService(db);
      // No library context here (Finder drag-drop); IngestService falls back
      // to the Inbox library per R-6 / Option B.
      const result = await ingest.addFile(filePath);
      if (!result.added && result.error) {
        console.warn(`[CB8] Cannot open file '${filePath}': ${result.error}`);
        return;
      }
      record = db.comics.getComicByPath(filePath);
    }
    if (!record) return;
    if (win.isDestroyed()) return;
    win.webContents.send('comic-opened', record.id);
  } catch (err) {
    console.error(`[CB8] Failed to resolve file '${filePath}' to a comic id:`, err);
  }
}

function menuContext(): MenuContext {
  return {
    getDb: () => db,
    setDb: (next) => { db = next; },
    webServerRef,
    openFile: openFileInWindow,
  };
}

const createWindow = (): void => {
  if (process.platform === 'darwin') {
    const dockIconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'book.png')
      : path.join(__dirname, '../../book.png');
    app.dock?.setIcon(dockIconPath);
  }

  // Open the database and register IPC handlers. Keep these independent so a
  // DB-init failure doesn't leave the renderer without any handlers — it
  // still gets real "db unavailable"-style errors from the channels instead
  // of "No handler registered".
  const userDataPath = app.getPath('userData');
  setImageCacheRoot(path.join(userDataPath, 'image-cache'));
  const dbPath = path.join(userDataPath, 'library.db');
  try {
    db = new LibraryDatabase(dbPath);
    db.initialize();
    startSweeperSchedule(db);
    startLibraryWatcher(db);
    startThumbnailWorker(db);
  } catch (err) {
    if (err instanceof DbStartupError) {
      console.error(`[CB8] DB startup failed (${err.category}): ${err.detail}`, err.cause);
    } else {
      console.error(`[CB8] Failed to open database at ${dbPath}:`, err);
    }
    db = null;
  }
  try {
    // 'desktop' mode keeps the embedded server alive at all times — the
    // BrowserWindow loads the SPA from it. The user-facing "enabled" toggle
    // controls LAN exposure (bind 0.0.0.0 vs 127.0.0.1), not server existence.
    registerIpcHandlers(db, webServerRef, 'desktop');
  } catch (err) {
    console.error('[CB8] Failed to register IPC handlers:', err);
  }

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: 'CB8',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'book.png')
      : path.join(__dirname, '../../book.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(buildApplicationMenu(mainWindow, menuContext()));

  // Load the SPA from the embedded server. registerIpcHandlers' desktop-mode
  // autostart guarantees a handle exists when DB init succeeded; if it failed,
  // fall back to a direct URL using the saved/default port so a stale server
  // (or a manual `pnpm start --headless` already binding the port) is still
  // reachable.
  const handle = webServerRef.handle;
  const port = handle?.port ?? 8008;
  mainWindow.loadURL(`http://127.0.0.1:${port}`);

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
    setImageCacheRoot(path.join(userDataPath, 'image-cache'));
    const dbPath = path.join(userDataPath, 'library.db');
    console.log(`[CB8] Headless startup: opening database at ${dbPath}`);
    db = new LibraryDatabase(dbPath);
    db.initialize();
    startSweeperSchedule(db);
    startLibraryWatcher(db);
    startThumbnailWorker(db);
    console.log('[CB8] Headless startup: database ready');
  } catch (err) {
    console.error('[CB8] Failed to initialize database or IPC:', err);
    process.exit(1);
  }

  const rawPort = db!.appMeta.getAppMeta('web_server_port');
  const parsed = rawPort ? parseInt(rawPort, 10) : NaN;
  const port = Number.isFinite(parsed)
    ? Math.max(1024, Math.min(65535, parsed))
    : 8008;

  try {
    console.log(`[CB8] Headless startup: starting web server on port ${port}`);
    if (!webServerRef.handle) {
      webServerRef.handle = startWebServer(db!, port);
    }
    console.log(`[CB8] Headless startup: web server handle ${webServerRef.handle ? 'created' : 'missing'}`);
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
    try { await thumbnailWorker?.stop(); } catch { /* ignore */ }
    thumbnailWorker = null;
    try { await libraryWatcher?.stop(); } catch { /* ignore */ }
    libraryWatcher = null;
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
