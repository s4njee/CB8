/**
 * Bootstraps the Fastify app, binds it to a port, and returns a handle that
 * exposes the underlying `http.Server` plus the resolved URLs.
 */
import * as os from 'node:os';
import type * as http from 'node:http';
import type { LibraryDatabase } from '../main/libraryDatabase';
import type { RuntimeConfig } from './config';
import { buildFastifyApp } from './app';

export interface ServerHandle {
  server: http.Server;
  port: number;
  url: string;
  lanUrl: string;
  close: () => Promise<void>;
}

export function getLanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

export async function startServer(
  db: LibraryDatabase,
  config: RuntimeConfig,
  port: number,
  host = '0.0.0.0',
): Promise<ServerHandle> {
  const app = await buildFastifyApp({ db, config });
  await app.listen({ port, host });

  const lan = getLanIp();
  const url = `http://localhost:${port}`;
  const lanUrl = `http://${lan}:${port}`;
  console.log(`[CB8] Web UI: ${url}`);
  console.log(`[CB8] LAN:    ${lanUrl}`);

  return {
    server: app.server,
    port,
    url,
    lanUrl,
    close: async () => { await app.close(); },
  };
}
