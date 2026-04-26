import { sendJson, sendError, readBody, parseQueryOptions } from '../middleware';
import { toWebRecord } from '../mapping';
import { requireAdmin, type RouteHandler } from '../context';
import type { QueryOptions } from '../../../shared/types';

export const handle: RouteHandler = async (ctx) => {
  const { req, res, db, pathname, method, query, currentUser } = ctx;

  // List folders
  if (method === 'GET' && pathname === '/api/folders') {
    const folders = db.getAllFolders();
    const safe = folders.map((f) => ({
      id: f.id,
      name: f.name,
      comicCount: f.comicCount,
      mediaType: f.mediaType,
      thumbnailUrl: f.coverThumbnail ? `/api/folders/${f.id}/thumbnail` : null,
    }));
    sendJson(res, 200, safe);
    return true;
  }

  // Create folder
  if (method === 'POST' && pathname === '/api/folders') {
    if (!requireAdmin(ctx)) return true;
    const body = await readBody(req);
    let parsed: { name?: string; comicIds?: number[] };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) { sendError(res, 400, 'Provide "name" (string)'); return true; }
    const ids = Array.isArray(parsed.comicIds) ? parsed.comicIds.map(Number) : [];
    sendJson(res, 201, db.createFolder(parsed.name.trim(), ids));
    return true;
  }

  const folderIdMatch = pathname.match(/^\/api\/folders\/(\d+)$/);
  // Rename folder
  if (method === 'PUT' && folderIdMatch) {
    if (!requireAdmin(ctx)) return true;
    const id = parseInt(folderIdMatch[1], 10);
    const body = await readBody(req);
    let parsed: { name?: string };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) { sendError(res, 400, 'Provide "name" (string)'); return true; }
    db.renameFolder(id, parsed.name.trim());
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Delete folder
  if (method === 'DELETE' && folderIdMatch) {
    if (!requireAdmin(ctx)) return true;
    const id = parseInt(folderIdMatch[1], 10);
    db.deleteFolder(id);
    sendJson(res, 200, { ok: true });
    return true;
  }

  const folderComicsMatch = pathname.match(/^\/api\/folders\/(\d+)\/comics$/);

  // Add/remove comics to folder
  if ((method === 'POST' || method === 'DELETE') && folderComicsMatch) {
    if (!requireAdmin(ctx)) return true;
    const folderId = parseInt(folderComicsMatch[1], 10);
    const body = await readBody(req);
    let parsed: { comicIds?: number[] };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (!Array.isArray(parsed.comicIds) || parsed.comicIds.length === 0) { sendError(res, 400, 'Provide "comicIds" (non-empty array)'); return true; }
    const ids = parsed.comicIds.map(Number);
    if (method === 'POST') db.addComicsToFolder(folderId, ids);
    else db.removeComicsFromFolder(folderId, ids);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Folder thumbnail
  const folderThumbMatch = pathname.match(/^\/api\/folders\/(\d+)\/thumbnail$/);
  if (method === 'GET' && folderThumbMatch) {
    const folderId = parseInt(folderThumbMatch[1], 10);
    const folders = db.getAllFolders();
    const folder = folders.find((f) => f.id === folderId);
    const thumb = folder?.coverThumbnail;
    if (!thumb || thumb.length === 0) {
      res.writeHead(404);
      res.end();
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
      'Content-Length': String(thumb.length),
    });
    res.end(thumb);
    return true;
  }

  // Query folder comics
  if (method === 'GET' && folderComicsMatch) {
    const folderId = parseInt(folderComicsMatch[1], 10);
    const opts = parseQueryOptions(query) as QueryOptions & { readStatus?: 'unread' | 'in-progress' | 'completed'; favorites?: boolean; folderId?: number };
    opts.folderId = folderId;
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
