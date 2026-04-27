import * as bcrypt from 'bcryptjs';
import { fromNodeHeaders } from 'better-auth/node';
import {
  GUEST_ACCESS_KEY,
  sendJson, sendError, readBody,
  isHostConnection,
} from '../middleware';
import { getAuth } from '../auth';
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

  // Login — delegate credential verification and session creation to better-auth.
  if (method === 'POST' && (pathname === '/api/auth/login' || pathname === '/api/admin/login')) {
    const body = await readBody(req);
    let parsed: { username?: string; password?: string };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (typeof parsed.password !== 'string') { sendError(res, 400, 'Provide "password"'); return true; }
    const username = typeof parsed.username === 'string' && parsed.username ? parsed.username : 'admin';
    try {
      const result = await getAuth().api.signInUsername({
        body: { username, password: parsed.password },
        headers: fromNodeHeaders(req.headers),
        returnHeaders: true,
      });
      const cookies = result.headers?.getSetCookie?.() ?? [];
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
      sendJson(res, 200, {
        ok: true,
        user: { id: result.user.id, username: result.user.username ?? result.user.name, isAdmin: result.user.isAdmin === true },
      });
    } catch {
      sendError(res, 401, 'Invalid credentials');
    }
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
    db.upsertCredentialAccount(user.id, parsed.username.trim(), hash);
    sendJson(res, 201, user);
    return true;
  }

  // Logout — let better-auth clear its own session cookie.
  if (method === 'POST' && (pathname === '/api/auth/logout' || pathname === '/api/admin/logout')) {
    try {
      const result = await getAuth().api.signOut({
        headers: fromNodeHeaders(req.headers),
        returnHeaders: true,
      });
      const cookies = result.headers?.getSetCookie?.() ?? [];
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
    } catch {
      // best-effort; always succeed
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Initial credentials — public, used for first-boot auto-login and settings display.
  if (method === 'GET' && pathname === '/api/settings/initial-credentials') {
    const password = db.getAppMeta('initial_password') || null;
    sendJson(res, 200, { username: 'admin', password });
    return true;
  }

  // Clear initial password (admin only — called after the admin has set a real password)
  if (method === 'DELETE' && pathname === '/api/settings/initial-credentials') {
    if (!requireAdmin(ctx)) return true;
    db.setAppMeta('initial_password', '');
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
