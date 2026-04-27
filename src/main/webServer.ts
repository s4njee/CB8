/**
 * webServer.ts — public entry point for the CB8 web server.
 *
 * The server itself is a Fastify instance built by `./webServer/server.ts`.
 * This module wraps it in a `WebServerHandle` shape (with the underlying
 * `http.Server`) so the existing callers — Electron's IPC handlers and the
 * headless startup path — keep working without changes.
 */

import * as http from 'node:http';
import * as os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { LibraryDatabase } from './libraryDatabase';
import { buildServer } from './webServer/server';

export { closeAllHandles } from './webServer/archiveCache';

/** Returns the first routable IPv4 address for display to the user. */
export function getLanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family !== 'IPv4') continue;
      if (iface.internal) continue;
      const parts = iface.address.split('.').map(Number);
      // Skip entire 127.0.0.0/8 loopback block (some virtual adapters mark
      // themselves non-internal but still use a loopback address).
      if (parts[0] === 127) continue;
      // Skip link-local (169.254.x.x).
      if (parts[0] === 169 && parts[1] === 254) continue;
      return iface.address;
    }
  }
  return '127.0.0.1';
}

export interface WebServerHandle {
  server: http.Server;
  fastify: FastifyInstance;
  port: number;
  host: string;
  url: string;
  lanUrl: string;
}

/**
 * Start the web server.
 * @param db    The open LibraryDatabase instance.
 * @param port  TCP port to listen on. Default 8008.
 * @param host  Bind address. Default `0.0.0.0`. Pass `127.0.0.1` for local-only.
 *
 * Note: returns synchronously with a handle whose `server` is the underlying
 * `http.Server`. Listening happens asynchronously; callers that need to know
 * when the bind is complete should listen on `handle.server` events.
 */
export function startWebServer(db: LibraryDatabase, port = 8008, host = '0.0.0.0'): WebServerHandle {
  // Build and listen are async, but our public contract is sync. We expose
  // `server` as the raw http.Server immediately and let listen() resolve in
  // the background. Errors are logged.
  const lan = getLanIp();
  const handle: WebServerHandle = {
    // Placeholder until Fastify builds its underlying server. Replaced below.
    server: undefined as unknown as http.Server,
    fastify: undefined as unknown as FastifyInstance,
    port,
    host,
    url: `http://localhost:${port}`,
    lanUrl: `http://${lan}:${port}`,
  };

  void (async () => {
    try {
      const fastify = await buildServer(db);
      handle.fastify = fastify;
      // Trigger Fastify to materialise its underlying http.Server before
      // listening so callers can grab `handle.server` for shutdown.
      await fastify.ready();
      handle.server = fastify.server;

      await fastify.listen({ port, host });
      if (host === '0.0.0.0') {
        console.log(`[CB8] Web UI: http://localhost:${port}`);
        console.log(`[CB8] LAN:    http://${lan}:${port}`);
      } else {
        console.log(`[CB8] Web UI: http://${host}:${port} (local-only)`);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EADDRINUSE') {
        console.warn(`[CB8] Web server port ${port} already in use. Web UI disabled.`);
      } else {
        console.error('[CB8] Web server error:', err);
      }
    }
  })();

  return handle;
}
