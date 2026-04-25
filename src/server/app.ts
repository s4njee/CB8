/**
 * Fastify app builder.
 *
 * Returns a configured Fastify instance with:
 *   - CORS headers + OPTIONS preflight
 *   - Cookie + rate-limit plugins
 *   - Session-based auth (see auth-bridge.ts) and login/logout routes
 *   - User-resolution + guest-access gate as a preHandler hook
 *   - All API route plugins
 *   - Static SPA fallback for non-/api requests
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import * as path from 'node:path';
import type { LibraryDatabase } from '../main/libraryDatabase';
import type { RuntimeConfig } from './config';
import { isGuestAccessEnabled, ensureInitialAdmin } from '../main/webServer/middleware';
import { initAuthWithDb, resolveCurrentUser } from './auth-bridge';
import { sendError } from './reply';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import tagRoutes from './routes/tags';
import libraryRoutes from './routes/libraries';
import folderRoutes from './routes/folders';
import progressRoutes from './routes/progress';
import comicRoutes from './routes/comics';
import uploadRoutes from './routes/upload';

// Endpoints we handle ourselves; everything else under /api/auth/* is forwarded
// to better-auth's built-in node handler.
export const OWN_AUTH_ENDPOINTS = new Set([
  '/api/auth/session',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/admin/session',
  '/api/admin/login',
  '/api/admin/logout',
]);

const PUBLIC_ENDPOINTS = new Set([
  '/api/auth/session',
  '/api/auth/login',
  '/api/admin/session',
  '/api/admin/login',
]);

export interface BuildAppOptions {
  db: LibraryDatabase;
  config: RuntimeConfig;
  /** Soft body size limit for non-streaming JSON routes. Default 1 MiB. */
  bodyLimit?: number;
}

export async function buildFastifyApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { db, config } = options;

  const app = Fastify({
    logger: { level: process.env.CB8_LOG_LEVEL ?? 'info' },
    bodyLimit: options.bodyLimit ?? 1_048_576,
    disableRequestLogging: true,
    trustProxy: true,
  });

  await ensureInitialAdmin(db).catch((err) => {
    app.log.error({ err }, 'Failed to create initial admin user');
  });

  initAuthWithDb(db);

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: '1 minute',
  });

  // CORS — same wildcard policy the legacy server applied. The web UI is
  // expected to be served from the same origin, so this is mostly defensive
  // for development tooling.
  app.addHook('onSend', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
  });
  app.options('/*', async (_req, reply) => {
    reply.code(204).send();
  });

  // User resolution + guest-access gate. Runs before any /api/* route handler.
  app.addHook('preHandler', async (req, reply) => {
    req.user = null;
    req.guestEnabled = isGuestAccessEnabled(db);

    const url = req.raw.url ?? '/';
    const pathname = decodeURIComponent(url.split('?')[0] ?? '/');
    if (!pathname.startsWith('/api/')) return;

    req.user = await resolveCurrentUser(req);

    // Always allow public endpoints through.
    if (PUBLIC_ENDPOINTS.has(pathname)) return;

    if (!req.user) {
      const isReadOnly = req.method === 'GET';
      if (!req.guestEnabled || !isReadOnly) {
        sendError(reply, 401, 'Unauthorized');
      }
    }
  });

  // Route plugins. Each receives `db` and `config` via the options arg.
  await app.register(authRoutes, { db });
  await app.register(userRoutes, { db });
  await app.register(tagRoutes, { db });
  await app.register(libraryRoutes, { db });
  await app.register(folderRoutes, { db });
  await app.register(progressRoutes, { db });
  await app.register(comicRoutes, { db, config });
  await app.register(uploadRoutes, { db, config });

  // SPA static fallback. Wildcard so deep links serve index.html.
  await app.register(fastifyStatic, {
    root: path.resolve(config.staticRoot),
    prefix: '/',
    wildcard: false,
    cacheControl: true,
    maxAge: 0,
  });
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      sendError(reply, 404, 'API endpoint not found');
      return;
    }
    return reply.sendFile('index.html');
  });

  return app;
}
