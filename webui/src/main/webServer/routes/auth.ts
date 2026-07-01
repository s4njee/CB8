import * as bcrypt from 'bcryptjs';
import { fromNodeHeaders } from 'better-auth/node';
import {
  GUEST_ACCESS_KEY,
  sendJson, sendError,
  isHostConnection,
  invalidateGuestAccessCache,
} from '../middleware';
import { getAuth } from '../auth';
import { requireAdmin, type RouteHandler } from '../context';
import type { InitialCredentialsResponse } from '../../../shared/apiTypes';
import { readJsonBody, requireString, requireTrimmedString } from './validation';
const AUTO_RESCAN_INTERVAL_KEY = 'auto_rescan_interval_min';

/**
 * @module
 * HTTP Route Handlers for Authentication and First-Run Setup
 *
 * Architecture overview for Junior Devs:
 * Serves the `/api/auth/*` and related endpoints that the SPA uses for the login
 * lifecycle: reporting session status, the initial-admin bootstrap, changing the
 * admin password, and toggling guest access. The heavy lifting of verifying
 * credentials and managing sessions is done by the `better-auth` instance
 * (`../auth`); this handler covers the pieces we own or expose ourselves.
 *
 * Like all route modules, the single exported `handle` is a `RouteHandler`: it
 * inspects `method`/`pathname`, serves the request via `sendJson`/`sendError`,
 * and returns `true` once it has claimed the request (or `false` to pass).
 */

export const handle: RouteHandler = async (ctx) => {
  const { req, res, db, pathname, method, currentUser, guestEnabled } = ctx;

  // Session status
  if (method === 'GET' && pathname === '/api/auth/session') {
    sendJson(res, 200, {
      authenticated: currentUser !== null,
      user: currentUser,
      host: isHostConnection(req),
      guestAccess: guestEnabled,
    });
    return true;
  }

  // Login — delegate credential verification and session creation to better-auth.
  if (method === 'POST' && pathname === '/api/auth/login') {
    const parsed = await readJsonBody<{ username?: string; password?: string }>(req, res);
    if (!parsed.ok) return true;
    const password = requireString(res, parsed.value.password, 'password');
    if (!password) return true;
    const username = typeof parsed.value.username === 'string' && parsed.value.username ? parsed.value.username : 'admin';
    try {
      const result = await getAuth().api.signInUsername({
        body: { username, password },
        headers: fromNodeHeaders(req.headers),
        returnHeaders: true,
      });
      const cookies = result.headers?.getSetCookie?.() ?? [];
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
      const user = result.response.user;
      sendJson(res, 200, {
        ok: true,
        user: { id: user.id, username: user.username ?? user.name, isAdmin: user.isAdmin === true },
      });
    } catch {
      sendError(res, 401, 'Invalid credentials');
    }
    return true;
  }

  // Register (admin only)
  if (method === 'POST' && pathname === '/api/auth/register') {
    if (!requireAdmin(ctx)) return true;
    const parsed = await readJsonBody<{ username?: string; password?: string; isAdmin?: boolean }>(req, res);
    if (!parsed.ok) return true;
    const username = requireTrimmedString(res, parsed.value.username, 'username');
    if (!username) return true;
    const password = requireString(res, parsed.value.password, 'password');
    if (!password) return true;
    if (await db.getUserByUsername(username)) { sendError(res, 409, 'Username already exists'); return true; }
    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser(username, hash, parsed.value.isAdmin === true);
    await db.upsertCredentialAccount(user.id, username, hash);
    sendJson(res, 201, user);
    return true;
  }

  // Public signup is disabled for public demos. Admin-created accounts use
  // /api/users or /api/auth/register after an admin session is established.
  if (method === 'POST' && (pathname === '/api/auth/sign-up/email' || pathname === '/api/auth/sign-up/username')) {
    sendError(res, 403, 'Public signup is disabled');
    return true;
  }

  // Logout — let better-auth clear its own session cookie.
  if (method === 'POST' && pathname === '/api/auth/logout') {
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

  // Initial credentials are admin-only; public demos must not disclose the
  // first-run admin password over HTTP.
  if (method === 'GET' && pathname === '/api/settings/initial-credentials') {
    if (!requireAdmin(ctx)) return true;
    const password = (await db.getAppMeta('initial_password')) || null;
    const body: InitialCredentialsResponse = { username: 'admin', password };
    sendJson(res, 200, body);
    return true;
  }

  // Clear initial password (admin only — called after the admin has set a real password)
  if (method === 'DELETE' && pathname === '/api/settings/initial-credentials') {
    if (!requireAdmin(ctx)) return true;
    await db.setAppMeta('initial_password', '');
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Settings: guest access toggle (admin only)
  if (method === 'PUT' && pathname === '/api/settings/guest-access') {
    if (!requireAdmin(ctx)) return true;
    const parsed = await readJsonBody<{ enabled?: boolean }>(req, res);
    if (!parsed.ok) return true;
    const enabled = parsed.value.enabled === true;
    await db.setAppMeta(GUEST_ACCESS_KEY, enabled ? 'true' : 'false');
    invalidateGuestAccessCache(db);
    sendJson(res, 200, { ok: true, enabled });
    return true;
  }

  // Settings: auto-rescan interval
  if (method === 'GET' && pathname === '/api/settings/auto-rescan-interval') {
    const raw = await db.getAppMeta(AUTO_RESCAN_INTERVAL_KEY);
    const minutes = raw ? parseInt(raw, 10) : 0;
    sendJson(res, 200, { minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 0 });
    return true;
  }

  if (method === 'PUT' && pathname === '/api/settings/auto-rescan-interval') {
    if (!requireAdmin(ctx)) return true;
    const parsed = await readJsonBody<{ minutes?: number }>(req, res);
    if (!parsed.ok) return true;
    const minutes = typeof parsed.value.minutes === 'number' ? Math.max(0, Math.round(parsed.value.minutes)) : 0;
    await db.setAppMeta(AUTO_RESCAN_INTERVAL_KEY, String(minutes));
    sendJson(res, 200, { ok: true, minutes });
    return true;
  }

  return false;
};
