import { ipcMain } from 'electron';
import type { LibraryDatabase } from '../libraryDatabase';
import { startWebServer, closeAllHandles } from '../webServer';
import type { WebServerHandle } from '../webServer';

const WEB_ENABLED_KEY = 'web_server_enabled';
const WEB_PORT_KEY = 'web_server_port';
const DEFAULT_PORT = 8008;

export function registerWebServerHandlers(
  db: LibraryDatabase | null,
  webServerRef: { handle: WebServerHandle | null },
): void {
  // Auto-start web server on boot if previously enabled
  if (db && db.getAppMeta(WEB_ENABLED_KEY) === 'true' && !webServerRef.handle) {
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
    const handle = webServerRef.handle ?? null;
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
