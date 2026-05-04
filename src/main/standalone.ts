/**
 * standalone.ts — Electron-free entrypoint for the CB8 web server.
 *
 * Used by the slim Docker image: no Electron runtime, no IPC, no menu.
 * Just opens the SQLite library and starts the Fastify web server.
 *
 * Configuration (env vars):
 *   CB8_DATA_DIR  Directory for library.db and image cache.
 *                 Default: /var/lib/cb8.
 *   CB8_PORT      TCP port to listen on. Default: 8008.
 *   CB8_HOST      Bind address. Default: 0.0.0.0.
 */

import * as path from 'node:path';
import { LibraryDatabase } from './libraryDatabase';
import { setImageCacheRoot } from './imageResizer';
import { buildServer } from './webServer/server';

async function main(): Promise<void> {
  const dataDir = process.env.CB8_DATA_DIR ?? '/var/lib/cb8';
  const port = parseInt(process.env.CB8_PORT ?? '8008', 10);
  const host = process.env.CB8_HOST ?? '0.0.0.0';

  setImageCacheRoot(path.join(dataDir, 'image-cache'));

  const dbPath = path.join(dataDir, 'library.db');
  console.log(`[CB8] Standalone startup: opening database at ${dbPath}`);
  const db = new LibraryDatabase(dbPath);
  db.initialize();
  console.log('[CB8] Standalone startup: database ready');

  const fastify = await buildServer(db);
  await fastify.listen({ port, host });
  console.log(`[CB8] Web UI listening on http://${host}:${port}`);

  const shutdown = async (): Promise<void> => {
    console.log('[CB8] Shutting down…');
    try { await fastify.close(); } catch { /* ignore */ }
    try { db.raw.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

main().catch((err) => {
  console.error('[CB8] Standalone startup failed:', err);
  process.exit(1);
});
