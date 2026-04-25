import type { FastifyPluginAsync } from 'fastify';
import * as bcrypt from 'bcryptjs';
import { sendJson, sendError } from '../reply';
import { requireAdmin, isHostConnection } from '../guards';
import {
  verifyCredentials,
  createSession,
  destroySession,
  getSessionToken,
  setSessionCookie,
  clearSessionCookie,
} from '../auth-bridge';
import { GUEST_ACCESS_KEY } from '../../main/webServer/middleware';
import type { LibraryDatabase } from '../../main/libraryDatabase';

interface Options { db: LibraryDatabase }

const plugin: FastifyPluginAsync<Options> = async (app, opts) => {
  const { db } = opts;

  const loginConfig = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.get('/api/auth/session', async (req, reply) => {
    sendJson(reply, 200, {
      authenticated: req.user !== null,
      user: req.user,
      host: isHostConnection(req),
      guestAccess: req.guestEnabled,
    });
  });

  app.get('/api/admin/session', async (req, reply) => {
    sendJson(reply, 200, {
      authenticated: req.user !== null,
      user: req.user,
      host: isHostConnection(req),
      guestAccess: req.guestEnabled,
    });
  });

  const loginHandler = async (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    const parsed = req.body as { username?: string; password?: string } | undefined;
    if (!parsed || typeof parsed.password !== 'string') {
      sendError(reply, 400, 'Provide "password"'); return;
    }
    const username = typeof parsed.username === 'string' && parsed.username ? parsed.username : 'admin';
    const user = await verifyCredentials(db, username, parsed.password);
    if (!user) {
      sendError(reply, 401, 'Invalid credentials'); return;
    }
    const token = createSession(user.id);
    setSessionCookie(reply, token);
    sendJson(reply, 200, { ok: true, user });
  };

  app.post('/api/auth/login', loginConfig, loginHandler);
  app.post('/api/admin/login', loginConfig, loginHandler);

  app.post('/api/auth/register', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = req.body as { username?: string; password?: string; isAdmin?: boolean } | undefined;
    if (!parsed || typeof parsed.username !== 'string' || !parsed.username.trim()) {
      sendError(reply, 400, 'Provide "username" (string)'); return;
    }
    if (typeof parsed.password !== 'string' || parsed.password.length < 1) {
      sendError(reply, 400, 'Provide "password" (string)'); return;
    }
    if (db.getUserByUsername(parsed.username.trim())) {
      sendError(reply, 409, 'Username already exists'); return;
    }
    const hash = await bcrypt.hash(parsed.password, 10);
    const user = db.createUser(parsed.username.trim(), hash, parsed.isAdmin === true);
    sendJson(reply, 201, user);
  });

  const logoutHandler = async (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    const token = getSessionToken(req);
    if (token) destroySession(token);
    clearSessionCookie(reply);
    sendJson(reply, 200, { ok: true });
  };

  app.post('/api/auth/logout', logoutHandler);
  app.post('/api/admin/logout', logoutHandler);

  app.put('/api/settings/guest-access', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = req.body as { enabled?: boolean } | undefined;
    db.setAppMeta(GUEST_ACCESS_KEY, parsed?.enabled === true ? 'true' : 'false');
    sendJson(reply, 200, { ok: true, enabled: parsed?.enabled === true });
  });
};

export default plugin;
