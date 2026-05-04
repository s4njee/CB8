/**
 * menu.ts — Application menu construction + the destructive admin
 * operations it triggers (Clear Database, Reset Admin Password). All of
 * this only ever runs from menu clicks, so keeping it together puts the
 * UI and its actions next to each other.
 *
 * The menu reads mutable state through a `MenuContext` rather than
 * importing index.ts state directly — this avoids a cycle and makes the
 * dependencies explicit.
 */

import {
  app, BrowserWindow, Menu, dialog, shell,
  type MenuItemConstructorOptions,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { LibraryDatabase } from './libraryDatabase';
import { closeAllHandles } from './webServer';
import type { WebServerHandle } from './webServer';
import { resetDefaultAdmin } from './adminReset';

const RECENT_FILE_LIMIT = 12;

export interface MenuContext {
  /** Returns the live DB handle (or null if init failed). */
  getDb: () => LibraryDatabase | null;
  /** Clears the in-process DB reference after a destructive operation. */
  setDb: (db: LibraryDatabase | null) => void;
  /** Shared web-server handle reference. */
  webServerRef: { handle: WebServerHandle | null };
  /** Open a file in the renderer (or queue it if no window yet). */
  openFile: (filePath: string) => void;
}

function buildRecentMenuItems(ctx: MenuContext): MenuItemConstructorOptions[] {
  const db = ctx.getDb();
  const recentRecords = db?.comics.getRecentlyRead(RECENT_FILE_LIMIT) ?? [];
  const existingRecords = recentRecords.filter((record) => fs.existsSync(record.filePath));

  if (existingRecords.length === 0) {
    return [{ label: 'No Recent Files', enabled: false }];
  }

  return existingRecords.map((record) => ({
    label: record.title || path.basename(record.filePath),
    sublabel: record.filePath,
    click: () => ctx.openFile(record.filePath),
  }));
}

/**
 * Close the DB, unlink the sqlite file + its WAL/SHM sidecars, then relaunch
 * Electron so the app starts against a fresh schema. Destructive; requires
 * explicit confirmation from the user.
 */
async function clearDatabaseAndRelaunch(win: BrowserWindow, ctx: MenuContext): Promise<void> {
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
  if (ctx.webServerRef.handle) {
    try { ctx.webServerRef.handle.server.close(); } catch { /* ignore */ }
    ctx.webServerRef.handle = null;
  }
  try {
    const db = ctx.getDb();
    if (db) db.raw.close();
  } catch (err) {
    console.warn('[CB8] Failed to close DB before clear:', err);
  }
  ctx.setDb(null);

  for (const suffix of ['', '-wal', '-shm']) {
    const target = dbPath + suffix;
    try { fs.unlinkSync(target); } catch { /* may not exist */ }
  }

  // Clearing the DB is a "wipe and start fresh" flow in both packaged and
  // dev runs. The confirmation copy promises a restart, so always relaunch.
  app.relaunch();
  app.quit();
}

/**
 * Reset the default admin account (`admin` / `gentrification`) in-place:
 * useful when the operator can't log into the web UI. Keeps the rest of the
 * library intact — this only touches the admin row and its credential row.
 */
async function resetAdminPassword(win: BrowserWindow, ctx: MenuContext): Promise<void> {
  const db = ctx.getDb();
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

export function buildApplicationMenu(win: BrowserWindow, ctx: MenuContext): Menu {
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
              ctx.openFile(result.filePaths[0]);
            }
          },
        },
        {
          label: 'Open Recent',
          submenu: buildRecentMenuItems(ctx),
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
            if (ctx.webServerRef.handle) {
              shell.openExternal(ctx.webServerRef.handle.url);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Reset Admin Password…',
          click: () => {
            resetAdminPassword(win, ctx).catch((err) => {
              console.error('[CB8] Reset admin password failed:', err);
            });
          },
        },
        {
          label: 'Clear Database…',
          click: () => {
            clearDatabaseAndRelaunch(win, ctx).catch((err) => {
              console.error('[CB8] Clear database failed:', err);
            });
          },
        },
      ],
    },
  ]);
}
