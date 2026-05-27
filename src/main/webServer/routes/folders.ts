import { sendJson, sendError, readBody, parseQueryOptions } from '../middleware';
import { toWebRecord } from '../mapping';
import { requireAdmin, type RouteHandler } from '../context';
import type { QueryOptions } from '../../../shared/types';

type FolderRouteOptions = QueryOptions & {
  readStatus?: 'unread' | 'in-progress' | 'completed';
  favorites?: boolean;
};

function parseFolderRouteOptions(query: Record<string, string>): FolderRouteOptions {
  const opts = parseQueryOptions(query) as FolderRouteOptions;
  if (query.readStatus === 'unread' || query.readStatus === 'in-progress' || query.readStatus === 'completed') {
    opts.readStatus = query.readStatus;
  }
  if (query.favorites === 'true') opts.favorites = true;
  return opts;
}

function thumbnailFor(coverComicId: number | null): string | null {
  return coverComicId ? `/api/comics/${coverComicId}/thumbnail` : null;
}

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

  const folderSeriesMatch = pathname.match(/^\/api\/folders\/(\d+)\/series$/);
  if (method === 'GET' && folderSeriesMatch) {
    const folderId = parseInt(folderSeriesMatch[1], 10);
    const opts = parseFolderRouteOptions(query);
    const groups = db.getFolderSeriesGroups(currentUser?.id ?? null, folderId, opts).map((group) => ({
      ...group,
      thumbnailUrl: thumbnailFor(group.coverComicId),
    }));
    sendJson(res, 200, { groups, totalCount: groups.length });
    return true;
  }

  const folderVolumesMatch = pathname.match(/^\/api\/folders\/(\d+)\/series\/([^/]+)\/volumes$/);
  if (method === 'GET' && folderVolumesMatch) {
    const folderId = parseInt(folderVolumesMatch[1], 10);
    const seriesKey = decodeURIComponent(folderVolumesMatch[2]);
    const opts = parseFolderRouteOptions(query);
    const groups = db.getFolderVolumeGroups(currentUser?.id ?? null, folderId, seriesKey, opts).map((group) => ({
      ...group,
      thumbnailUrl: thumbnailFor(group.coverComicId),
    }));
    sendJson(res, 200, { groups, totalCount: groups.length });
    return true;
  }

  const folderChaptersMatch = pathname.match(/^\/api\/folders\/(\d+)\/series\/([^/]+)\/volumes\/([^/]+)\/chapters$/);
  if (method === 'GET' && folderChaptersMatch) {
    const folderId = parseInt(folderChaptersMatch[1], 10);
    const seriesKey = decodeURIComponent(folderChaptersMatch[2]);
    const volumeKey = decodeURIComponent(folderChaptersMatch[3]);
    const opts = parseFolderRouteOptions(query);
    const groups = db.getFolderChapterGroups(currentUser?.id ?? null, folderId, seriesKey, volumeKey, opts).map((group) => ({
      ...group,
      thumbnailUrl: thumbnailFor(group.coverComicId),
    }));
    sendJson(res, 200, { groups, totalCount: groups.length });
    return true;
  }

  const folderVolumeComicsMatch = pathname.match(/^\/api\/folders\/(\d+)\/series\/([^/]+)\/volumes\/([^/]+)\/comics$/);
  if (method === 'GET' && folderVolumeComicsMatch) {
    const folderId = parseInt(folderVolumeComicsMatch[1], 10);
    const seriesKey = decodeURIComponent(folderVolumeComicsMatch[2]);
    const volumeKey = decodeURIComponent(folderVolumeComicsMatch[3]);
    const opts = parseFolderRouteOptions(query);
    if (!opts.limit) opts.limit = 50;
    const result = db.getFolderVolumeComicsForUser(currentUser?.id ?? null, folderId, seriesKey, volumeKey, null, opts);
    sendJson(res, 200, {
      records: result.records.map((r) => ({ ...toWebRecord(r)!, favorited: r.favorited ?? false })),
      totalCount: result.totalCount,
    });
    return true;
  }

  const folderChapterComicsMatch = pathname.match(/^\/api\/folders\/(\d+)\/series\/([^/]+)\/volumes\/([^/]+)\/chapters\/([^/]+)\/comics$/);
  if (method === 'GET' && folderChapterComicsMatch) {
    const folderId = parseInt(folderChapterComicsMatch[1], 10);
    const seriesKey = decodeURIComponent(folderChapterComicsMatch[2]);
    const volumeKey = decodeURIComponent(folderChapterComicsMatch[3]);
    const chapterKey = decodeURIComponent(folderChapterComicsMatch[4]);
    const opts = parseFolderRouteOptions(query);
    if (!opts.limit) opts.limit = 50;
    const result = db.getFolderVolumeComicsForUser(currentUser?.id ?? null, folderId, seriesKey, volumeKey, chapterKey, opts);
    sendJson(res, 200, {
      records: result.records.map((r) => ({ ...toWebRecord(r)!, favorited: r.favorited ?? false })),
      totalCount: result.totalCount,
    });
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

  // ---------------------------------------------------------------------------
  // Global browse/search hierarchy — mirrors folder series/volumes/chapters
  // but without a folder scope. Used when the search view drills into series.
  // ---------------------------------------------------------------------------

  // GET /api/browse/series
  if (method === 'GET' && pathname === '/api/browse/series') {
    const opts = parseFolderRouteOptions(query);
    const groups = db.getGlobalSeriesGroups(currentUser?.id ?? null, opts).map((group) => ({
      ...group,
      thumbnailUrl: thumbnailFor(group.coverComicId),
    }));
    sendJson(res, 200, { groups, totalCount: groups.length });
    return true;
  }

  // GET /api/browse/series/:key/volumes
  const browseVolumesMatch = pathname.match(/^\/api\/browse\/series\/([^/]+)\/volumes$/);
  if (method === 'GET' && browseVolumesMatch) {
    const seriesKey = decodeURIComponent(browseVolumesMatch[1]);
    const opts = parseFolderRouteOptions(query);
    const groups = db.getGlobalVolumeGroups(currentUser?.id ?? null, seriesKey, opts).map((group) => ({
      ...group,
      thumbnailUrl: thumbnailFor(group.coverComicId),
    }));
    sendJson(res, 200, { groups, totalCount: groups.length });
    return true;
  }

  // GET /api/browse/series/:key/volumes/:vol/chapters
  const browseChaptersMatch = pathname.match(/^\/api\/browse\/series\/([^/]+)\/volumes\/([^/]+)\/chapters$/);
  if (method === 'GET' && browseChaptersMatch) {
    const seriesKey = decodeURIComponent(browseChaptersMatch[1]);
    const volumeKey = decodeURIComponent(browseChaptersMatch[2]);
    const opts = parseFolderRouteOptions(query);
    const groups = db.getGlobalChapterGroups(currentUser?.id ?? null, seriesKey, volumeKey, opts).map((group) => ({
      ...group,
      thumbnailUrl: thumbnailFor(group.coverComicId),
    }));
    sendJson(res, 200, { groups, totalCount: groups.length });
    return true;
  }

  // GET /api/browse/series/:key/volumes/:vol/comics
  const browseVolumeComicsMatch = pathname.match(/^\/api\/browse\/series\/([^/]+)\/volumes\/([^/]+)\/comics$/);
  if (method === 'GET' && browseVolumeComicsMatch) {
    const seriesKey = decodeURIComponent(browseVolumeComicsMatch[1]);
    const volumeKey = decodeURIComponent(browseVolumeComicsMatch[2]);
    const opts = parseFolderRouteOptions(query);
    if (!opts.limit) opts.limit = 50;
    const result = db.getGlobalVolumeComicsForUser(currentUser?.id ?? null, seriesKey, volumeKey, null, opts);
    sendJson(res, 200, {
      records: result.records.map((r) => ({ ...toWebRecord(r)!, favorited: r.favorited ?? false })),
      totalCount: result.totalCount,
    });
    return true;
  }

  // GET /api/browse/series/:key/volumes/:vol/chapters/:ch/comics
  const browseChapterComicsMatch = pathname.match(/^\/api\/browse\/series\/([^/]+)\/volumes\/([^/]+)\/chapters\/([^/]+)\/comics$/);
  if (method === 'GET' && browseChapterComicsMatch) {
    const seriesKey = decodeURIComponent(browseChapterComicsMatch[1]);
    const volumeKey = decodeURIComponent(browseChapterComicsMatch[2]);
    const chapterKey = decodeURIComponent(browseChapterComicsMatch[3]);
    const opts = parseFolderRouteOptions(query);
    if (!opts.limit) opts.limit = 50;
    const result = db.getGlobalVolumeComicsForUser(currentUser?.id ?? null, seriesKey, volumeKey, chapterKey, opts);
    sendJson(res, 200, {
      records: result.records.map((r) => ({ ...toWebRecord(r)!, favorited: r.favorited ?? false })),
      totalCount: result.totalCount,
    });
    return true;
  }

  return false;
};
