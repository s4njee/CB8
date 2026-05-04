/**
 * routes/search.ts — cross-kind search endpoint for the v7 hierarchy
 * (R-11).
 *
 *   GET /api/search?q=&libraryId=&limit=
 *
 * Returns a flat array of `{ kind: 'series' | 'chapter', id, title, … }`
 * objects, with series hits ranked above chapter hits when both match.
 */
import { sendJson } from '../middleware';
import type { RouteHandler } from '../context';

export const handle: RouteHandler = async (ctx) => {
  const { res, db, pathname, method, query } = ctx;
  if (method !== 'GET' || pathname !== '/api/search') return false;

  const q = query.q ?? '';
  const limitRaw = query.limit ? parseInt(query.limit, 10) : NaN;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
  const libraryId = query.libraryId ? parseInt(query.libraryId, 10) : undefined;

  const hits = db.unionSearch(q, { limit, libraryId: Number.isFinite(libraryId) ? libraryId : undefined });
  sendJson(res, 200, hits);
  return true;
};
