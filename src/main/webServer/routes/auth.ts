import * as bcrypt from 'bcryptjs';
import {
  SESSION_COOKIE, GUEST_ACCESS_KEY,
  sendJson, sendError, readBody,
  parseCookies, isHostConnection,
  createSession, deleteSession, setSessionCookie, clearSessionCookie,
} from '../middleware';
import { requireAdmin, type RouteHandler } from '../context';

export const handle: RouteHandler = async (ctx) => {
  const { req, res, db, pathname, method, currentUser, guestEnabled } = ctx;

  // Session status
  if (method === 'GET' && (pathname === '/api/auth/session' || pathname === '/api/admin/session')) {
    sendJson(res, 200, {
      authenticated: currentUser !== null,
      user: currentUser,
      host: isHostConnection(req),
      guestAccess: guestEnabled,
    });
    return true;
  }

  // Login
  if (method === 'POST' && (pathname === '/api/auth/login' || pathname === '/api/admin/login')) {
    const body = await readBody(req);
    let parsed: { username?: string; password?: string };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (typeof parsed.password !== 'string') { sendError(res, 400, 'Provide "password"'); return true; }
    const username = typeof parsed.username === 'string' && parsed.username ? parsed.username : 'admin';
    const user = db.getUserByUsername(username);
    if (!user) { sendError(res, 401, 'Invalid credentials'); return true; }
    const ok = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!ok) { sendError(res, 401, 'Invalid credentials'); return true; }
    const token = createSession(user.id);
    setSessionCookie(res, token);
    sendJson(res, 200, { ok: true, user: { id: user.id, username: user.username, isAdmin: user.isAdmin } });
    return true;
  }

  // Register (admin only)
  if (method === 'POST' && pathname === '/api/auth/register') {
    if (!requireAdmin(ctx)) return true;
    const body = await readBody(req);
    let parsed: { username?: string; password?: string; isAdmin?: boolean };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (typeof parsed.username !== 'string' || !parsed.username.trim()) { sendError(res, 400, 'Provide "username" (string)'); return true; }
    if (typeof parsed.password !== 'string' || parsed.password.length < 1) { sendError(res, 400, 'Provide "password" (string)'); return true; }
    if (db.getUserByUsername(parsed.username.trim())) { sendError(res, 409, 'Username already exists'); return true; }
    const hash = await bcrypt.hash(parsed.password, 10);
    const user = db.createUser(parsed.username.trim(), hash, parsed.isAdmin === true);
    sendJson(res, 201, user);
    return true;
  }

  // Logout
  if (method === 'POST' && (pathname === '/api/auth/logout' || pathname === '/api/admin/logout')) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) deleteSession(token);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Settings: guest access toggle (admin only)
  if (method === 'PUT' && pathname === '/api/settings/guest-access') {
    if (!requireAdmin(ctx)) return true;
    const body = await readBody(req);
    let parsed: { enabled?: boolean };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    db.setAppMeta(GUEST_ACCESS_KEY, parsed.enabled === true ? 'true' : 'false');
    sendJson(res, 200, { ok: true, enabled: parsed.enabled === true });
    return true;
  }

  return false;
};
