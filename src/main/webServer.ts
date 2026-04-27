/**
 * webServer.ts — CB8 embedded HTTP server
 *
 * Serves:
 *   /api/*   — JSON REST API backed by LibraryDatabase
 *   /        — Static SPA files from src/web/
 *
 * Request handling is split into route modules under src/main/webServer/routes/.
 * This file is the orchestrator: it builds a RequestContext and dispatches to
 * each route module in a fixed order. The static fallback runs last.
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as url from 'node:url';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { LibraryDatabase } from './libraryDatabase';
import {
  isGuestAccessEnabled,
  sendError, ensureInitialAdmin,
  BodyTooLargeError,
} from './webServer/middleware';
import { createAuth, getAuth } from './webServer/auth';
import type { ResolvedUser } from './webServer/middleware';
import type { RequestContext, RouteHandler } from './webServer/context';
import * as authRoutes from './webServer/routes/auth';
import * as userRoutes from './webServer/routes/users';
import * as tagRoutes from './webServer/routes/tags';
import * as libraryRoutes from './webServer/routes/libraries';
import * as folderRoutes from './webServer/routes/folders';
import * as progressRoutes from './webServer/routes/progress';
import * as comicRoutes from './webServer/routes/comics';
import * as uploadRoutes from './webServer/routes/upload';
import { serveStatic } from './webServer/routes/staticFiles';
import { loginLimiter, forgotPasswordLimiter } from './webServer/rateLimit';

export { closeAllHandles } from './webServer/archiveCache';

// Our own custom auth endpoints — handled by authRoutes rather than forwarded
// to better-auth's built-in handler.
const OWN_AUTH_ENDPOINTS = new Set([
  '/api/auth/session',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/admin/session',
  '/api/admin/login',
  '/api/admin/logout',
]);

let betterAuthHandler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> = async () => {
  // Replaced by startWebServer once the auth instance is built.
  throw new Error('better-auth handler not initialized');
};

async function resolveCurrentUser(
  req: http.IncomingMessage,
): Promise<ResolvedUser | null> {
  try {
    const session = await getAuth().api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (session?.user) {
      const id = typeof session.user.id === 'number' ? session.user.id : parseInt(String(session.user.id), 10);
      if (Number.isFinite(id)) {
        return {
          id,
          username: session.user.username ?? session.user.email,
          isAdmin: session.user.isAdmin === true,
        };
      }
    }
  } catch {
    // No valid better-auth session.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Static file root resolution
// ---------------------------------------------------------------------------

function resolveStaticRoot(): string {
  const candidates = [
    path.join(__dirname, '../../src/web'),   // dev: src/main -> project root -> src/web
    path.join(__dirname, '../web'),          // packaged: .vite/build -> web
    path.join(process.resourcesPath ?? '', 'web'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Request dispatcher
// ---------------------------------------------------------------------------

/**
 * Ordered list of API route handlers. Each handler returns `true` when it has
 * taken responsibility for the response. Order matters only insofar as a more
 * specific path must be listed before any handler whose regex is a prefix of it
 * — currently none of the groups overlap, so the ordering here is by topical
 * grouping rather than by constraint.
 */
const API_ROUTES: RouteHandler[] = [
  authRoutes.handle,
  userRoutes.handle,
  uploadRoutes.handle,
  comicRoutes.handle,
  progressRoutes.handle,
  tagRoutes.handle,
  libraryRoutes.handle,
  folderRoutes.handle,
];

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  db: LibraryDatabase,
  staticRoot: string,
): Promise<void> {
  const parsed = url.parse(req.url ?? '/', true);
  const pathname = decodeURIComponent(parsed.pathname ?? '/');
  const query = parsed.query as Record<string, string>;
  const method = req.method ?? 'GET';

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Rate-limit sensitive auth endpoints before any processing.
  if (method === 'POST') {
    const ip = req.socket.remoteAddress ?? 'unknown';
    if (pathname === '/api/auth/login' || pathname === '/api/admin/login') {
      if (!loginLimiter.check(`${ip}:login`)) {
        return sendError(res, 429, 'Too many login attempts. Try again later.');
      }
    } else if (pathname === '/api/auth/forget-password' || pathname === '/api/auth/forgot-password') {
      if (!forgotPasswordLimiter.check(`${ip}:forgot`)) {
        return sendError(res, 429, 'Too many password reset requests. Try again later.');
      }
    }
  }

  // Delegate /api/auth/* traffic not handled by our own routes to better-auth.
  if (pathname.startsWith('/api/auth/') && !OWN_AUTH_ENDPOINTS.has(pathname)) {
    try {
      await betterAuthHandler(req, res);
    } catch (err) {
      // Log the underlying error so the 500 isn't opaque; better-auth's
      // node adapter sometimes throws instead of writing a response body.
      console.error(`[webServer] better-auth handler error at ${pathname}:`, err);
      if (!res.headersSent) {
        sendError(res, 500, err instanceof Error ? err.message : String(err));
      } else {
        res.destroy();
      }
    }
    return;
  }

  if (pathname.startsWith('/api/')) {
    const currentUser = await resolveCurrentUser(req);
    const guestEnabled = isGuestAccessEnabled(db);

    // Guest-access gate: unauthenticated requests are limited to GETs on a
    // handful of public endpoints (session/login) unless guest reads are on.
    const publicEndpoints = new Set([
      '/api/auth/session', '/api/auth/login', '/api/admin/session', '/api/admin/login',
    ]);
    const isPublic = publicEndpoints.has(pathname);
    const isReadOnly = method === 'GET';
    if (!currentUser && !isPublic) {
      if (!guestEnabled || !isReadOnly) {
        return sendError(res, 401, 'Unauthorized');
      }
    }

    const ctx: RequestContext = { req, res, db, pathname, method, query, currentUser, guestEnabled };
    for (const route of API_ROUTES) {
      if (await route(ctx)) return;
    }
    return sendError(res, 404, 'API endpoint not found');
  }

  await serveStatic(res, pathname, staticRoot);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the first non-loopback IPv4 address for display to the user. */
export function getLanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

export interface WebServerHandle {
  server: http.Server;
  port: number;
  url: string;
  lanUrl: string;
}

/**
 * Start the embedded HTTP server.
 * @param db    The open LibraryDatabase instance.
 * @param port  TCP port to listen on. Default 8008.
 * @param host  Bind address. Default `0.0.0.0` (reachable from LAN). Pass
 *              `127.0.0.1` for local-only when LAN exposure is disabled —
 *              the desktop window still loads the SPA from the local URL.
 */
export function startWebServer(db: LibraryDatabase, port = 8008, host = '0.0.0.0'): WebServerHandle {
  try {
    ensureInitialAdmin(db);
  } catch (err) {
    console.error('[CB8] Failed to create initial admin user:', err);
  }

  // Initialize better-auth against the raw sqlite handle and wrap it as a
  // Node-style http handler so we can dispatch on URL prefix.
  const auth = createAuth(db.raw);
  betterAuthHandler = toNodeHandler(auth);

  const staticRoot = resolveStaticRoot();

  const server = http.createServer((req, res) => {
    handleRequest(req, res, db, staticRoot).catch((err) => {
      if (err instanceof BodyTooLargeError) {
        try {
          if (!res.headersSent) sendError(res, 413, err.message);
          else res.destroy();
        } catch { /* ignore */ }
        return;
      }
      console.error('[webServer] Unhandled error:', err);
      try {
        if (!res.headersSent) {
          // In development it's more useful to see the real error than
          // the sanitised "Internal server error" string. The embedded
          // web server is local-network only, so exposing the message
          // is acceptable — the entire app is trusted.
          const message = err instanceof Error ? err.message : String(err);
          const stack = err instanceof Error ? err.stack : undefined;
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: message, stack }));
        }
      } catch { /* ignore */ }
    });
  });

  server.listen(port, host, () => {
    if (host === '0.0.0.0') {
      const lan = getLanIp();
      console.log(`[CB8] Web UI: http://localhost:${port}`);
      console.log(`[CB8] LAN:    http://${lan}:${port}`);
    } else {
      console.log(`[CB8] Web UI: http://${host}:${port} (local-only)`);
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[CB8] Web server port ${port} already in use. Web UI disabled.`);
    } else {
      console.error('[CB8] Web server error:', err);
    }
  });

  const lan = getLanIp();
  return {
    server,
    port,
    url: `http://localhost:${port}`,
    lanUrl: `http://${lan}:${port}`,
  };
}
