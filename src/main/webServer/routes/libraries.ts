import { sendJson, sendError, readBody, parseQueryOptions } from '../middleware';
import { toWebRecord } from '../mapping';
import { requireAdmin, type RouteHandler } from '../context';
import type { QueryOptions } from '../../../shared/types';

export const handle: RouteHandler = async (ctx) => {
  const { req, res, db, pathname, method, query, currentUser } = ctx;

  // List libraries
  if (method === 'GET' && pathname === '/api/libraries') {
    const mediaType = query.mediaType as 'comic' | 'book' | undefined;
    sendJson(res, 200, db.getAllLibraries(mediaType));
    return true;
  }

  // Create library
  if (method === 'POST' && pathname === '/api/libraries') {
    if (!requireAdmin(ctx)) return true;
    const body = await readBody(req);
    let parsed: { name?: string; mediaType?: string };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) { sendError(res, 400, 'Provide "name" (string)'); return true; }
    const mediaType = parsed.mediaType === 'book' ? 'book' : 'comic';
    try {
      sendJson(res, 201, db.createLibrary(parsed.name.trim(), mediaType));
    } catch {
      sendError(res, 409, 'A collection with that name already exists');
    }
    return true;
  }

  const libRenameMatch = pathname.match(/^\/api\/libraries\/(\d+)$/);
  // Rename library
  if (method === 'PUT' && libRenameMatch) {
    if (!requireAdmin(ctx)) return true;
    const id = parseInt(libRenameMatch[1], 10);
    const body = await readBody(req);
    let parsed: { name?: string };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) { sendError(res, 400, 'Provide "name" (string)'); return true; }
    try {
      db.renameLibrary(id, parsed.name.trim());
      sendJson(res, 200, { ok: true });
    } catch {
      sendError(res, 409, 'A collection with that name already exists');
    }
    return true;
  }

  // Delete library
  if (method === 'DELETE' && libRenameMatch) {
    if (!requireAdmin(ctx)) return true;
    const id = parseInt(libRenameMatch[1], 10);
    db.deleteLibrary(id);
    sendJson(res, 200, { ok: true });
    return true;
  }

  const libComicsMatch = pathname.match(/^\/api\/libraries\/(\d+)\/comics$/);

  // Remove comics from library
  if (method === 'DELETE' && libComicsMatch) {
    if (!requireAdmin(ctx)) return true;
    const libId = parseInt(libComicsMatch[1], 10);
    const body = await readBody(req);
    let parsed: { comicIds?: number[] };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (!Array.isArray(parsed.comicIds) || parsed.comicIds.length === 0) { sendError(res, 400, 'Provide "comicIds" (non-empty array)'); return true; }
    db.removeComicsFromLibrary(libId, parsed.comicIds.map(Number));
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Add comics to library
  if (method === 'POST' && libComicsMatch) {
    if (!requireAdmin(ctx)) return true;
    const libId = parseInt(libComicsMatch[1], 10);
    const body = await readBody(req);
    let parsed: { comicIds?: number[] };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (!Array.isArray(parsed.comicIds) || parsed.comicIds.length === 0) { sendError(res, 400, 'Provide "comicIds" (non-empty array)'); return true; }
    db.addComicsToLibrary(libId, parsed.comicIds.map(Number));
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Add folders (whole-folder import) to library
  const libFoldersMatch = pathname.match(/^\/api\/libraries\/(\d+)\/folders$/);
  if (method === 'POST' && libFoldersMatch) {
    if (!requireAdmin(ctx)) return true;
    const libId = parseInt(libFoldersMatch[1], 10);
    const body = await readBody(req);
    let parsed: { folderIds?: number[] };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (!Array.isArray(parsed.folderIds) || parsed.folderIds.length === 0) {
      sendError(res, 400, 'Provide "folderIds" (non-empty array)'); return true;
    }
    db.addFoldersToLibrary(libId, parsed.folderIds.map(Number));
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Query comics in library
  if (method === 'GET' && libComicsMatch) {
    const libId = parseInt(libComicsMatch[1], 10);
    const opts = parseQueryOptions(query) as QueryOptions & { readStatus?: 'unread' | 'in-progress' | 'completed'; favorites?: boolean; libraryId?: number };
    opts.libraryId = libId;
    if (!opts.limit) opts.limit = 50;
    if (query.readStatus === 'unread' || query.readStatus === 'in-progress' || query.readStatus === 'completed') {
      opts.readStatus = query.readStatus;
    }
    if (query.favorites === 'true') opts.favorites = true;
    const result = db.queryComicsForUser(currentUser?.id ?? null, opts);
    sendJson(res, 200, {
      records: result.records.map((r) => ({ ...toWebRecord(r)!, favorited: r.favorited ?? false })),
      totalCount: result.totalCount,
    });
    return true;
  }

  return false;
};
