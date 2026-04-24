import type { LibraryDatabase } from '../libraryDatabase';
import type { WebServerHandle } from '../webServer';
import { registerArchiveHandlers } from './archiveHandlers';
import { registerLibraryHandlers } from './libraryHandlers';
import { registerReadingHandlers } from './readingHandlers';
import { registerWebServerHandlers } from './webServerHandlers';
import { registerAppHandlers } from './appHandlers';

export function registerIpcHandlers(
  db: LibraryDatabase | null,
  webServerRef?: { handle: WebServerHandle | null },
  onRecentFilesChanged?: (filePath?: string) => void,
): void {
  registerArchiveHandlers();
  registerLibraryHandlers(db, onRecentFilesChanged);
  registerReadingHandlers(db, onRecentFilesChanged);
  if (webServerRef) registerWebServerHandlers(db, webServerRef);
  registerAppHandlers(db);
}
