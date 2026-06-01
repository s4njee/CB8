export interface WebServerSettings {
  enabled: boolean;
  port: number;
  url: string | null;
  lanUrl: string | null;
}

const NOOP = () => {};

// Declare electronAPI on the window object
declare global {
  interface Window {
    electronAPI?: {
      on: (channel: string, callback: (...args: any[]) => void) => () => void;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
  }
}

function getBridge() {
  return typeof window !== 'undefined' ? window.electronAPI : undefined;
}

/** True when running inside the Electron BrowserWindow. */
export function isElectron(): boolean {
  return !!getBridge();
}

/**
 * Subscribe to OS-driven file-open events.
 * Returns unsubscribe function.
 */
export function onFileOpened(callback: (filePath: string) => void): () => void {
  const bridge = getBridge();
  if (!bridge) return NOOP;
  return bridge.on('file-opened', (filePath) => callback(filePath));
}

/**
 * Subscribe to "open comic by id" events.
 * Returns unsubscribe function.
 */
export function onComicOpened(callback: (comicId: number) => void): () => void {
  const bridge = getBridge();
  if (!bridge) return NOOP;
  return bridge.on('comic-opened', (comicId) => callback(comicId));
}

/**
 * Subscribe to the app-menu "Open Settings" command.
 * Returns unsubscribe function.
 */
export function onOpenSettings(callback: () => void): () => void {
  const bridge = getBridge();
  if (!bridge) return NOOP;
  return bridge.on('open-settings', () => callback());
}

/**
 * Show the native file picker.
 */
export async function pickFile(): Promise<string | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  return bridge.invoke('dialog:open-file');
}

/**
 * Show the native directory picker.
 */
export async function pickDirectory(): Promise<string | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  return bridge.invoke('dialog:open-directory');
}

/**
 * Open a filesystem path in the OS file manager / default app.
 */
export async function openExternalPath(filePath: string): Promise<string | undefined> {
  const bridge = getBridge();
  if (!bridge) return undefined;
  return bridge.invoke('shell:open-path', filePath);
}

/**
 * Read the current embedded-server config.
 */
export async function getWebServerSettings(): Promise<WebServerSettings | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  return bridge.invoke('webserver:get-settings');
}

/**
 * Update the embedded-server config.
 */
export async function setWebServerSettings(enabled: boolean, port: number): Promise<WebServerSettings | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  return bridge.invoke('webserver:set-settings', enabled, port);
}
