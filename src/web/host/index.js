/**
 * host/index.js — Frontend boundary for desktop-only capabilities.
 *
 * The SPA is the same code in both contexts:
 *   - Browser: this module's predicates return false / falsy and
 *     subscriptions are no-ops returning a no-op unsubscribe.
 *   - Electron: subscriptions and invokers go through the preload
 *     `electronAPI` bridge.
 *
 * Domain operations (library queries, reading progress, auth, etc.)
 * MUST NOT be added here. Those use the HTTP API. This module is for
 * shell concerns only: OS-driven file opens, app-menu commands, and
 * native pickers that the browser cannot offer cleanly.
 *
 * See PLAN10.md.
 */

const NOOP = () => {};

function getBridge() {
  return typeof window !== 'undefined' ? window.electronAPI : undefined;
}

/** True when running inside the Electron BrowserWindow. */
export function isElectron() {
  return !!getBridge();
}

/**
 * Subscribe to OS-driven file-open events (double-click .cbz, File→Open
 * menu, `open-file` on macOS). The callback receives the absolute path.
 *
 * @param {(filePath: string) => void} callback
 * @returns {() => void} unsubscribe
 */
export function onFileOpened(callback) {
  const bridge = getBridge();
  if (!bridge) return NOOP;
  return bridge.on('file-opened', (filePath) => callback(filePath));
}

/**
 * Subscribe to "open comic by id" events. The main process resolves an
 * OS-supplied file path to a library comic id (ingesting if necessary)
 * and fires this so the SPA can navigate to the reader without having
 * to do a path→id lookup itself.
 *
 * @param {(comicId: number) => void} callback
 * @returns {() => void} unsubscribe
 */
export function onComicOpened(callback) {
  const bridge = getBridge();
  if (!bridge) return NOOP;
  return bridge.on('comic-opened', (comicId) => callback(comicId));
}

/**
 * Subscribe to the app-menu "Open Settings" command.
 *
 * @param {() => void} callback
 * @returns {() => void} unsubscribe
 */
export function onOpenSettings(callback) {
  const bridge = getBridge();
  if (!bridge) return NOOP;
  return bridge.on('open-settings', () => callback());
}

/**
 * Show the native file picker. Returns the chosen absolute path, or
 * null if the user cancelled. In the browser this returns null so
 * callers can fall back to a browser-native upload flow.
 *
 * @returns {Promise<string | null>}
 */
export async function pickFile() {
  const bridge = getBridge();
  if (!bridge) return null;
  return bridge.invoke('dialog:open-file');
}

/**
 * Show the native directory picker. See `pickFile`.
 *
 * @returns {Promise<string | null>}
 */
export async function pickDirectory() {
  const bridge = getBridge();
  if (!bridge) return null;
  return bridge.invoke('dialog:open-directory');
}

/**
 * Resolve a dropped/picked browser File to its absolute path on the
 * server host. Returns null in the browser, where path access is
 * blocked by the sandbox.
 *
 * @param {File} file
 * @returns {string | null}
 */
export function getPathForFile(file) {
  const bridge = getBridge();
  if (!bridge?.getPathForFile) return null;
  try {
    const p = bridge.getPathForFile(file);
    return typeof p === 'string' && p ? p : null;
  } catch {
    return null;
  }
}

/**
 * Open a filesystem path in the OS file manager / default app.
 * No-op in the browser.
 *
 * @param {string} filePath
 * @returns {Promise<string | undefined>} error message from the OS
 *   (Electron's shell.openPath returns an empty string on success), or
 *   undefined when called outside Electron.
 */
export async function openExternalPath(filePath) {
  const bridge = getBridge();
  if (!bridge) return undefined;
  return bridge.invoke('shell:open-path', filePath);
}

/**
 * @typedef {{
 *   enabled: boolean;
 *   port: number;
 *   url: string | null;
 *   lanUrl: string | null;
 * }} WebServerSettings
 */

/**
 * Read the current embedded-server config (LAN-exposure toggle, port,
 * advertised URLs). Browser callers get null — the server is the host
 * they're already connected to and they cannot reconfigure it.
 *
 * @returns {Promise<WebServerSettings | null>}
 */
export async function getWebServerSettings() {
  const bridge = getBridge();
  if (!bridge) return null;
  return bridge.invoke('webserver:get-settings');
}

/**
 * Update the embedded-server config. In desktop mode `enabled` controls
 * LAN exposure (bind 0.0.0.0 vs 127.0.0.1) rather than server existence.
 *
 * @param {boolean} enabled
 * @param {number} port
 * @returns {Promise<WebServerSettings | null>}
 */
export async function setWebServerSettings(enabled, port) {
  const bridge = getBridge();
  if (!bridge) return null;
  return bridge.invoke('webserver:set-settings', enabled, port);
}
