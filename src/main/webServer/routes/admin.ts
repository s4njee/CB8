import { sendJson } from '../middleware';
import { requireAdmin, type RouteHandler } from '../context';

export const handle: RouteHandler = async (ctx) => {
  const { res, db, pathname, method } = ctx;

  if (method === 'DELETE' && pathname === '/api/admin/library') {
    if (!requireAdmin(ctx)) return true;
    const removed = db.libraryMaintenance.clearLibrary();
    sendJson(res, 200, { ok: true, removed });
    return true;
  }

  return false;
};
