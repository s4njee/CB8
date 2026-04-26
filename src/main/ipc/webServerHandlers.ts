import { ipcMain } from 'electron';
import type { LibraryDatabase } from '../libraryDatabase';
import { startWebServer, closeAllHandles } from '../webServer';
import type { WebServerHandle } from '../webServer';

const WEB_ENABLED_KEY = 'web_server_enabled';
const WEB_PORT_KEY = 'web_server_port';
const DEFAULT_PORT = 8008;

/**
 * Mode the IPC handlers run in. `desktop` keeps the embedded server alive at
 * all times so the BrowserWindow can load the SPA from `http://127.0.0.1`;
 * the `enabled` toggle then controls LAN exposure (bind 0.0.0.0 vs 127.0.0.1)
 * rather than server existence. `headless` mode lets the user fully stop the
 * server because there is no window depending on it.
 */
export type WebServerMode = 'desktop' | 'headless';

function bindHostFor(mode: WebServerMode, enabled: boolean): string {
  if (mode === 'desktop') return enabled ? '0.0.0.0' : '127.0.0.1';
  return '0.0.0.0';
}

function readPort(db: LibraryDatabase | null): number {
  const raw = db ? db.getAppMeta(WEB_PORT_KEY) : null;
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_PORT;
  const safe = isNaN(parsed) ? DEFAULT_PORT : parsed;
  return Math.max(1024, Math.min(65535, safe));
}

function readEnabled(db: LibraryDatabase | null): boolean {
  return db?.getAppMeta(WEB_ENABLED_KEY) === 'true';
}

/**
 * Ensure the embedded HTTP server is running. Always returns the live handle
 * in desktop mode (the SPA needs it). In headless mode, only starts when the
 * user has it enabled, mirroring legacy behavior.
 */
export function ensureWebServer(
  db: LibraryDatabase | null,
  ref: { handle: WebServerHandle | null },
  mode: WebServerMode,
): WebServerHandle | null {
  if (!db || ref.handle) return ref.handle;
  const enabled = readEnabled(db);
  if (mode === 'headless' && !enabled) return null;
  const port = readPort(db);
  const host = bindHostFor(mode, enabled);
  try {
    ref.handle = startWebServer(db, port, host);
  } catch (err) {
    console.error('[CB8] Failed to start web server:', err);
  }
  return ref.handle;
}

async function stopHandle(handle: WebServerHandle): Promise<void> {
  await new Promise<void>((resolve) => {
    handle.server.close(() => resolve());
    setTimeout(resolve, 1000);
  });
  await closeAllHandles();
}

export function registerWebServerHandlers(
  db: LibraryDatabase | null,
  webServerRef: { handle: WebServerHandle | null },
  mode: WebServerMode = 'desktop',
): void {
  // Best-effort autostart on registration. Desktop mode always runs so the
  // BrowserWindow can load the SPA. Headless follows the saved preference.
  ensureWebServer(db, webServerRef, mode);

  function getWebSettings() {
    const enabled = readEnabled(db);
    const port = readPort(db);
    const handle = webServerRef.handle ?? null;
    return {
      enabled,
      port,
      url: handle ? handle.url : null,
      lanUrl: handle ? handle.lanUrl : null,
    };
  }

  ipcMain.handle('webserver:get-settings', () => getWebSettings());

  ipcMain.handle('webserver:set-settings', async (_e, enabled: boolean, port: number) => {
    if (!db) return getWebSettings();

    const safePort = Math.max(1024, Math.min(65535, Math.floor(port)));
    db.setAppMeta(WEB_ENABLED_KEY, String(enabled));
    db.setAppMeta(WEB_PORT_KEY, String(safePort));

    const current = webServerRef.handle;
    const desiredHost = bindHostFor(mode, enabled);
    const portChanged = current?.port !== safePort;
    const hostChanged = current?.lanUrl
      ? (desiredHost !== '0.0.0.0')
      : (desiredHost === '0.0.0.0');

    if (mode === 'desktop') {
      // The window depends on the server. Always end with a live handle.
      if (!current) {
        try {
          webServerRef.handle = startWebServer(db, safePort, desiredHost);
        } catch (err) {
          console.error('[CB8] Failed to start web server:', err);
        }
      } else if (portChanged || hostChanged) {
        await stopHandle(current);
        webServerRef.handle = null;
        try {
          webServerRef.handle = startWebServer(db, safePort, desiredHost);
        } catch (err) {
          console.error('[CB8] Failed to restart web server:', err);
        }
      }
      return getWebSettings();
    }

    // Headless: enabled controls existence.
    if (!enabled && current) {
      await stopHandle(current);
      webServerRef.handle = null;
    } else if (enabled && !current) {
      try {
        webServerRef.handle = startWebServer(db, safePort, desiredHost);
      } catch (err) {
        console.error('[CB8] Failed to start web server:', err);
      }
    } else if (enabled && current && (portChanged || hostChanged)) {
      await stopHandle(current);
      webServerRef.handle = null;
      try {
        webServerRef.handle = startWebServer(db, safePort, desiredHost);
      } catch (err) {
        console.error('[CB8] Failed to restart web server:', err);
      }
    }

    return getWebSettings();
  });
}
