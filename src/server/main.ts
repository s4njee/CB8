/**
 * Server entrypoint. Reads config from env, opens the sqlite DB under
 * `CB8_DATA_DIR`, builds the Fastify app, and listens. No host file picker is
 * wired, so /api/admin/pick-path returns 501.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { LibraryDatabase } from '../main/libraryDatabase';
import { setImageCacheRoot } from '../main/imageResizer';
import { startServer, getLanIp } from './start';
import { loadDataDirFromEnv, loadServerOptionsFromEnv, type RuntimeConfig } from './config';
import { closeAllHandles } from '../main/webServer/archiveCache';

function resolveStaticRoot(): string {
  const candidates = [
    path.join(__dirname, '../web'),
    path.join(__dirname, '../../src/web'),
    path.resolve(process.cwd(), 'src/web'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

async function main(): Promise<void> {
  const dataDir = loadDataDirFromEnv();
  const { port, host } = loadServerOptionsFromEnv();

  fs.mkdirSync(dataDir, { recursive: true });
  setImageCacheRoot(path.join(dataDir, 'image-cache'));

  const dbPath = path.join(dataDir, 'library.db');
  const db = await LibraryDatabase.open(dbPath);
  db.initialize();

  const config: RuntimeConfig = {
    dataDir,
    staticRoot: resolveStaticRoot(),
    // hostFilePicker omitted — /api/admin/pick-path returns 501 in this mode.
  };

  const handle = await startServer(db, config, port, host);
  console.log(`[CB8] Standalone server listening on ${host}:${port} (LAN ${getLanIp()})`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[CB8] Received ${signal}, shutting down…`);
    try { await handle.close(); } catch (err) { console.warn('[CB8] server close failed:', err); }
    try { await closeAllHandles(); } catch { /* ignore */ }
    try { db.raw.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', () => { shutdown('SIGINT').catch(() => process.exit(1)); });
  process.on('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)); });
}

main().catch((err) => {
  console.error('[CB8] Standalone startup failed:', err);
  process.exit(1);
});
