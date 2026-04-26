import type { LibraryDatabase } from '../libraryDatabase';
import type { WebServerHandle } from '../webServer';
import { registerLibraryHandlers } from './libraryHandlers';
import { registerReadingHandlers } from './readingHandlers';
import { registerWebServerHandlers, type WebServerMode } from './webServerHandlers';
import { registerAppHandlers } from './appHandlers';

export function registerIpcHandlers(
  db: LibraryDatabase | null,
  webServerRef?: { handle: WebServerHandle | null },
  mode: WebServerMode = 'desktop',
): void {
  registerLibraryHandlers();
  registerReadingHandlers(db);
  if (webServerRef) registerWebServerHandlers(db, webServerRef, mode);
  registerAppHandlers();
}
