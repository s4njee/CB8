import * as bcrypt from 'bcryptjs';
import { sendJson, sendError, readBody } from '../middleware';
import { requireAdmin, type RouteHandler } from '../context';

export const handle: RouteHandler = async (ctx) => {
  const { req, res, db, pathname, method, currentUser } = ctx;

  // List users
  if (method === 'GET' && pathname === '/api/users') {
    if (!requireAdmin(ctx)) return true;
    sendJson(res, 200, db.listUsers());
    return true;
  }

  // Create user
  if (method === 'POST' && pathname === '/api/users') {
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

  // Delete user
  const userIdMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (method === 'DELETE' && userIdMatch) {
    if (!requireAdmin(ctx)) return true;
    const id = parseInt(userIdMatch[1], 10);
    if (currentUser && id === currentUser.id) { sendError(res, 400, 'Cannot delete yourself'); return true; }
    const target = db.getUserById(id);
    if (!target) { sendError(res, 404, 'User not found'); return true; }
    if (target.isAdmin && db.countAdmins() <= 1) { sendError(res, 400, 'Cannot delete last admin'); return true; }
    db.deleteUser(id);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Set role
  const userRoleMatch = pathname.match(/^\/api\/users\/(\d+)\/role$/);
  if (method === 'PUT' && userRoleMatch) {
    if (!requireAdmin(ctx)) return true;
    const id = parseInt(userRoleMatch[1], 10);
    const body = await readBody(req);
    let parsed: { isAdmin?: boolean };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    const target = db.getUserById(id);
    if (!target) { sendError(res, 404, 'User not found'); return true; }
    if (target.isAdmin && parsed.isAdmin === false && db.countAdmins() <= 1) { sendError(res, 400, 'Cannot demote last admin'); return true; }
    db.setUserAdmin(id, parsed.isAdmin === true);
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
};
