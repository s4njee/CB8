import { sendJson, sendError, readBody } from '../middleware';
import { toWebRecord } from '../mapping';
import type { RouteHandler } from '../context';

export const handle: RouteHandler = async (ctx) => {
  const { req, res, db, pathname, method, query, currentUser } = ctx;

  // Update progress
  const progressMatch = pathname.match(/^\/api\/comics\/(\d+)\/progress$/);
  if (method === 'PUT' && progressMatch) {
    if (!currentUser) { sendError(res, 401, 'Unauthorized'); return true; }
    const id = parseInt(progressMatch[1], 10);
    const body = await readBody(req);
    let parsed: { page?: number; location?: string; completed?: boolean };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    const opts: { page?: number | null; location?: string | null; completed?: boolean } = {};
    if (typeof parsed.page === 'number') opts.page = parsed.page;
    if (typeof parsed.location === 'string') opts.location = parsed.location;
    if (typeof parsed.completed === 'boolean') opts.completed = parsed.completed;
    if (opts.page === undefined && opts.location === undefined && opts.completed === undefined) {
      sendError(res, 400, 'Provide "page", "location", or "completed"');
      return true;
    }
    // Auto-complete on final page (0-indexed), unless the client explicitly
    // said otherwise.
    if (typeof opts.page === 'number' && opts.completed === undefined) {
      const comic = db.getComic(id);
      if (comic && comic.pageCount > 0 && opts.page >= comic.pageCount - 1) {
        opts.completed = true;
      }
    }
    db.upsertUserProgress(currentUser.id, id, opts);
    if (typeof parsed.page === 'number') db.updateReadingProgress(id, parsed.page);
    else if (typeof parsed.location === 'string') db.updateReadingLocation(id, parsed.location);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Clear progress
  if (method === 'DELETE' && progressMatch) {
    if (!currentUser) { sendError(res, 401, 'Unauthorized'); return true; }
    const id = parseInt(progressMatch[1], 10);
    db.clearUserProgress(currentUser.id, id);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Favorite toggle
  const favMatch = pathname.match(/^\/api\/comics\/(\d+)\/favorite$/);
  if (favMatch && (method === 'POST' || method === 'DELETE')) {
    if (!currentUser) { sendError(res, 401, 'Unauthorized'); return true; }
    const id = parseInt(favMatch[1], 10);
    if (method === 'POST') db.addFavorite(currentUser.id, id);
    else db.removeFavorite(currentUser.id, id);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Bookmarks
  const bookmarksMatch = pathname.match(/^\/api\/comics\/(\d+)\/bookmarks$/);
  if (method === 'GET' && bookmarksMatch) {
    if (!currentUser) { sendError(res, 401, 'Unauthorized'); return true; }
    const id = parseInt(bookmarksMatch[1], 10);
    sendJson(res, 200, db.listBookmarks(currentUser.id, id));
    return true;
  }
  if (method === 'POST' && bookmarksMatch) {
    if (!currentUser) { sendError(res, 401, 'Unauthorized'); return true; }
    const id = parseInt(bookmarksMatch[1], 10);
    const body = await readBody(req);
    let parsed: { page?: number; note?: string | null };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (typeof parsed.page !== 'number') { sendError(res, 400, 'Provide "page" (number)'); return true; }
    sendJson(res, 201, db.createBookmark(currentUser.id, id, parsed.page, parsed.note ?? null));
    return true;
  }
  const bookmarkItemMatch = pathname.match(/^\/api\/comics\/(\d+)\/bookmarks\/(\d+)$/);
  if (method === 'PUT' && bookmarkItemMatch) {
    if (!currentUser) { sendError(res, 401, 'Unauthorized'); return true; }
    const bookmarkId = parseInt(bookmarkItemMatch[2], 10);
    const body = await readBody(req);
    let parsed: { note?: string | null };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    db.updateBookmark(currentUser.id, bookmarkId, parsed.note ?? null);
    sendJson(res, 200, { ok: true });
    return true;
  }
  if (method === 'DELETE' && bookmarkItemMatch) {
    if (!currentUser) { sendError(res, 401, 'Unauthorized'); return true; }
    const bookmarkId = parseInt(bookmarkItemMatch[2], 10);
    db.deleteBookmark(currentUser.id, bookmarkId);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // History
  if (method === 'POST' && pathname === '/api/history') {
    if (!currentUser) { sendError(res, 401, 'Unauthorized'); return true; }
    const body = await readBody(req);
    let parsed: { comicId?: number; action?: string; page?: number | null };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (typeof parsed.comicId !== 'number' || typeof parsed.action !== 'string') {
      sendError(res, 400, 'Provide "comicId" and "action"'); return true;
    }
    db.logHistory(currentUser.id, parsed.comicId, parsed.action, parsed.page ?? null);
    sendJson(res, 200, { ok: true });
    return true;
  }
  if (method === 'GET' && pathname === '/api/history') {
    if (!currentUser) { sendError(res, 401, 'Unauthorized'); return true; }
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const limit = query.limit ? Math.min(parseInt(query.limit, 10), 200) : 50;
    sendJson(res, 200, db.getHistory(currentUser.id, offset, limit));
    return true;
  }

  // Legacy /api/series and /api/series/:name/comics routes were removed in v8.
  // ID-based replacements live in routes/series.ts:
  //   GET /api/libraries/:libId/series
  //   GET /api/series/:id/chapters

  // Recently read
  if (method === 'GET' && pathname === '/api/recently-read') {
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const mediaType = query.mediaType as 'comic' | 'book' | undefined;
    const records = currentUser
      ? db.getRecentlyReadByUser(currentUser.id, limit, mediaType)
      : db.getRecentlyRead(limit, mediaType);
    sendJson(res, 200, records.map(toWebRecord));
    return true;
  }

  // Continue reading — recently read, filtered to in-progress only.
  if (method === 'GET' && pathname === '/api/continue-reading') {
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const mediaType = query.mediaType as 'comic' | 'book' | undefined;
    const records = currentUser
      ? db.getContinueReadingByUser(currentUser.id, limit, mediaType)
      : db.getContinueReading(limit, mediaType);
    sendJson(res, 200, records.map(toWebRecord));
    return true;
  }

  return false;
};
