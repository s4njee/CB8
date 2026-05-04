/**
 * server.ts — Fastify-based web server for CB8.
 *
 * `buildServer(db)` returns a configured FastifyInstance. The instance:
 *   - serves the SPA from src/web/ via @fastify/static
 *   - mounts better-auth at /api/auth/* (for endpoints we don't override)
 *   - delegates /api/* requests to the existing RouteHandler modules via a
 *     thin adapter that hands them request.raw / reply.raw
 *   - applies the existing rate limiters as a preHandler hook
 *
 * The route modules under ./routes/ remain raw node:http handlers for now;
 * they will be migrated to native Fastify plugins incrementally. Until then
 * this server is a thin Fastify shell around the original dispatcher.
 */
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import type { LibraryDatabase } from '../libraryDatabase';
import {
  isGuestAccessEnabled,
  ensureInitialAdmin,
  sendError,
  BodyTooLargeError,
  type ResolvedUser,
} from './middleware';
import { createAuth, getAuth } from './auth';
import type { RequestContext, RouteHandler } from './context';
import * as authRoutes from './routes/auth';
import * as userRoutes from './routes/users';
import * as tagRoutes from './routes/tags';
import * as libraryRoutes from './routes/libraries';
import * as folderRoutes from './routes/folders';
import * as progressRoutes from './routes/progress';
import * as comicRoutes from './routes/comics';
import * as uploadRoutes from './routes/upload';
import * as seriesRoutes from './routes/series';
import * as searchRoutes from './routes/search';
import { serveStatic } from './routes/staticFiles';
import { loginLimiter, forgotPasswordLimiter } from './rateLimit';

const OWN_AUTH_ENDPOINTS = new Set([
  '/api/auth/session',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/admin/session',
  '/api/admin/login',
  '/api/admin/logout',
]);

const API_ROUTES: RouteHandler[] = [
  authRoutes.handle,
  userRoutes.handle,
  uploadRoutes.handle,
  comicRoutes.handle,
  // seriesRoutes is registered before progressRoutes so the new
  // /api/series/:id-style endpoints take precedence over the legacy
  // string-name shim (`/api/series/:name/comics`) still served from
  // progressRoutes during the R-14 deprecation window.
  seriesRoutes.handle,
  searchRoutes.handle,
  progressRoutes.handle,
  tagRoutes.handle,
  libraryRoutes.handle,
  folderRoutes.handle,
];

function resolveStaticRoot(): string {
  const candidates = [
    path.join(__dirname, '../../src/web'),
    // Packaged: main bundle lives at .vite/build/index.js inside app.asar,
    // src/web is copied to /web at the asar root (see forge.config packageAfterCopy).
    path.join(__dirname, '../../web'),
    path.join(__dirname, '../web'),
    path.join(process.resourcesPath ?? '', 'web'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

async function resolveCurrentUser(req: http.IncomingMessage): Promise<ResolvedUser | null> {
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
    /* no session */
  }
  return null;
}

/**
 * Adapter: dispatch an /api/* request to the legacy RouteHandler modules
 * using the raw IncomingMessage / ServerResponse pair.
 */
async function dispatchApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  db: LibraryDatabase,
  betterAuthHandler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
): Promise<void> {
  const parsed = url.parse(req.url ?? '/', true);
  const pathname = decodeURIComponent(parsed.pathname ?? '/');
  const query = parsed.query as Record<string, string>;
  const method = req.method ?? 'GET';

  if (pathname.startsWith('/api/auth/') && !OWN_AUTH_ENDPOINTS.has(pathname)) {
    try {
      await betterAuthHandler(req, res);
    } catch (err) {
      console.error(`[webServer] better-auth handler error at ${pathname}:`, err);
      if (!res.headersSent) {
        sendError(res, 500, err instanceof Error ? err.message : String(err));
      } else {
        res.destroy();
      }
    }
    return;
  }

  const currentUser = await resolveCurrentUser(req);
  const guestEnabled = isGuestAccessEnabled(db);

  const publicEndpoints = new Set([
    '/api/auth/session', '/api/auth/login', '/api/admin/session', '/api/admin/login',
    '/api/settings/initial-credentials',
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

export interface BuildServerOptions {
  /** Disable Fastify's request logger. Defaults to true (no logs). */
  silent?: boolean;
}

/**
 * Build a configured Fastify instance. The caller is responsible for calling
 * `.listen({ port, host })` on the returned instance.
 */
export async function buildServer(
  db: LibraryDatabase,
  opts: BuildServerOptions = {},
): Promise<FastifyInstance> {
  ensureInitialAdmin(db);
  const auth = createAuth(db.raw);
  const betterAuthHandler = toNodeHandler(auth);

  const fastify = Fastify({
    logger: opts.silent === false ? true : false,
    // The legacy handlers consume request bodies themselves via readBody().
    // Disable Fastify body parsing entirely so the raw stream is intact.
    bodyLimit: 50 * 1024 * 1024,
  });

  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser('*', (_req, _payload, done) => done(null, undefined));

  // CORS — match the existing wide-open policy. The web server is intended
  // for trusted local/LAN use only.
  fastify.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    return payload;
  });

  fastify.options('/*', async (_req, reply) => {
    reply.code(204).send();
  });

  // Rate-limit sensitive auth endpoints before any processing.
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST') return;
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const pathname = (request.url ?? '').split('?')[0];
    if (pathname === '/api/auth/login' || pathname === '/api/admin/login') {
      if (!loginLimiter.check(`${ip}:login`)) {
        reply.code(429).send({ error: 'Too many login attempts. Try again later.' });
      }
    } else if (pathname === '/api/auth/forget-password' || pathname === '/api/auth/forgot-password') {
      if (!forgotPasswordLimiter.check(`${ip}:forgot`)) {
        reply.code(429).send({ error: 'Too many password reset requests. Try again later.' });
      }
    }
  });

  // /api/* — adapter dispatch to legacy handlers. Hijack the reply so we can
  // write directly to the raw ServerResponse.
  fastify.all('/api/*', async (request, reply) => {
    reply.hijack();
    try {
      await dispatchApi(request.raw, reply.raw, db, betterAuthHandler);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        if (!reply.raw.headersSent) sendError(reply.raw, 413, err.message);
        else reply.raw.destroy();
        return;
      }
      console.error('[webServer] Unhandled error:', err);
      if (!reply.raw.headersSent) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(JSON.stringify({ error: message, stack }));
      }
    }
  });

  // Static SPA. Use serveStatic for the actual response so we keep MIME-type
  // handling and the index.html fallback identical to the legacy server.
  const staticRoot = resolveStaticRoot();
  fastify.setNotFoundHandler(async (request, reply) => {
    reply.hijack();
    const parsed = url.parse(request.raw.url ?? '/', true);
    const pathname = decodeURIComponent(parsed.pathname ?? '/');
    await serveStatic(reply.raw, pathname, staticRoot);
  });

  return fastify;
}
