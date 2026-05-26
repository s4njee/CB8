/**
 * routes/series.ts — HTTP endpoints for the v7 hierarchy. Implements
 * R-9, R-12, R-14 (deprecation shims), and the cover endpoints from
 * design.md §6.1 and §7.
 *
 *   GET  /api/libraries/:libId/series           list series in a library
 *   GET  /api/series/:id                        series detail
 *   GET  /api/series/:id/volumes                volumes of a series
 *   GET  /api/series/:id/chapters               chapters across volumes
 *   GET  /api/volumes/:id/chapters              chapters of one volume
 *   GET  /api/series/lookup?libraryId=&name=   name → id (deprecation shim)
 *   GET  /api/series/:id/cover                  series cover bytes
 *   GET  /api/volumes/:id/cover                 volume cover bytes
 *
 * Soft-deleted rows are excluded by default; admin reveal is gated on
 * `?include_deleted=1` AND a logged-in admin (R-18).
 */
import { sendJson, sendError } from '../middleware';
import { toWebRecord, overlayUserState } from '../mapping';
import type { RouteHandler } from '../context';
import type { ComicDetail } from '../../../shared/types';

function clampLimit(raw: string | undefined, dflt = 50, max = 200): number {
  const n = raw ? parseInt(raw, 10) : dflt;
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(n, max);
}

function parseInclude(query: Record<string, string>, isAdmin: boolean): { includeDeleted: boolean; includeImplicit: boolean } {
  return {
    includeDeleted: isAdmin && (query.include_deleted === '1' || query.include_deleted === 'true'),
    includeImplicit: query.include_implicit !== 'false',
  };
}

export const handle: RouteHandler = async (ctx) => {
  const { res, db, pathname, method, query, currentUser } = ctx;
  const isAdmin = !!currentUser?.isAdmin;

  // GET /api/libraries/:libId/series — paginated list scoped to one library.
  const libSeriesMatch = pathname.match(/^\/api\/libraries\/(\d+)\/series$/);
  if (method === 'GET' && libSeriesMatch) {
    const libId = parseInt(libSeriesMatch[1], 10);
    const limit = clampLimit(query.limit, 50, 200);
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const inc = parseInclude(query, isAdmin);
    const rows = db.series.listForLibrary(libId, {
      includeDeleted: inc.includeDeleted,
      limit, offset,
    });
    const totalCount = db.series.countForLibrary(libId, { includeDeleted: inc.includeDeleted });
    sendJson(res, 200, {
      totalCount,
      items: rows.map((r) => ({
        id: r.id,
        libraryId: r.libraryId,
        name: r.name,
        sortName: r.sortName,
        summary: r.summary,
        status: r.status,
        ageRating: r.ageRating,
        coverComicId: r.coverComicId ?? db.comics.defaultSeriesCover(r.id),
        chapterCount: r.chapterCount,
        lastChapterAddedAt: r.lastChapterAddedAt,
      })),
    });
    return true;
  }

  // GET /api/series/lookup?libraryId=&name=  — name → id (T-7.4 + R-14 shim).
  // Numeric id and lookup are split because /api/series/:id matches before this
  // regex in route order; the explicit `lookup` token is the disambiguator.
  if (method === 'GET' && pathname === '/api/series/lookup') {
    const libId = query.libraryId ? parseInt(query.libraryId, 10) : NaN;
    const name = query.name;
    if (!Number.isFinite(libId) || !name) {
      sendError(res, 400, 'Provide libraryId and name');
      return true;
    }
    const s = db.series.lookupByName(libId, name);
    if (!s) { sendError(res, 404, 'Not found'); return true; }
    sendJson(res, 200, { id: s.id });
    return true;
  }

  // GET /api/series/:id — detail.
  const seriesDetailMatch = pathname.match(/^\/api\/series\/(\d+)$/);
  if (method === 'GET' && seriesDetailMatch) {
    const id = parseInt(seriesDetailMatch[1], 10);
    const s = db.series.get(id);
    if (!s || (s.deletedAt && !isAdmin)) { sendError(res, 404, 'Not found'); return true; }
    const volumes = db.volume.listForSeries(id, { includeImplicit: true });
    const chapterCount = volumes.reduce((acc, v) => acc + v.chapterCount, 0);
    sendJson(res, 200, {
      id: s.id,
      libraryId: s.libraryId,
      name: s.name,
      sortName: s.sortName,
      localizedName: s.localizedName,
      summary: s.summary,
      status: s.status,
      ageRating: s.ageRating,
      coverComicId: s.coverComicId ?? db.comics.defaultSeriesCover(id),
      volumeCount: volumes.filter((v) => v.number !== null).length,
      hasImplicitVolume: volumes.some((v) => v.number === null),
      chapterCount,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      deletedAt: s.deletedAt,
    });
    return true;
  }

  // GET /api/series/:id/volumes
  const seriesVolumesMatch = pathname.match(/^\/api\/series\/(\d+)\/volumes$/);
  if (method === 'GET' && seriesVolumesMatch) {
    const id = parseInt(seriesVolumesMatch[1], 10);
    const inc = parseInclude(query, isAdmin);
    const volumes = db.volume.listForSeries(id, {
      includeImplicit: inc.includeImplicit,
      includeDeleted: inc.includeDeleted,
    });
    sendJson(res, 200, volumes.map((v) => ({
      id: v.id,
      seriesId: v.seriesId,
      number: v.number,
      name: v.name,
      coverComicId: v.coverComicId ?? db.comics.defaultVolumeCover(v.id),
      chapterCount: v.chapterCount,
      deletedAt: v.deletedAt,
    })));
    return true;
  }

  // GET /api/series/:id/chapters
  const seriesChaptersMatch = pathname.match(/^\/api\/series\/(\d+)\/chapters$/);
  if (method === 'GET' && seriesChaptersMatch) {
    const id = parseInt(seriesChaptersMatch[1], 10);
    const limit = clampLimit(query.limit, 50, 500);
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const inc = parseInclude(query, isAdmin);
    const records = db.comics.listForSeries(id, { includeDeleted: inc.includeDeleted, limit, offset });
    sendJson(res, 200, mapChapters(records, db, currentUser?.id ?? null));
    return true;
  }

  // GET /api/volumes/:id/chapters
  const volumeChaptersMatch = pathname.match(/^\/api\/volumes\/(\d+)\/chapters$/);
  if (method === 'GET' && volumeChaptersMatch) {
    const id = parseInt(volumeChaptersMatch[1], 10);
    const limit = clampLimit(query.limit, 50, 500);
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const inc = parseInclude(query, isAdmin);
    const records = db.comics.listForVolume(id, { includeDeleted: inc.includeDeleted, limit, offset });
    sendJson(res, 200, mapChapters(records, db, currentUser?.id ?? null));
    return true;
  }

  // GET /api/series/:id/cover  — resolves to a comic id, then 302's to the
  // existing comic-thumbnail endpoint so the underlying byte/cache path
  // stays unchanged. Cover override on the series row wins over default.
  const seriesCoverMatch = pathname.match(/^\/api\/series\/(\d+)\/cover$/);
  if (method === 'GET' && seriesCoverMatch) {
    const id = parseInt(seriesCoverMatch[1], 10);
    const s = db.series.get(id);
    if (!s) { sendError(res, 404, 'Not found'); return true; }
    const cid = s.coverComicId ?? db.comics.defaultSeriesCover(id);
    if (cid == null) { sendError(res, 404, 'No cover available'); return true; }
    res.writeHead(302, { Location: `/api/comics/${cid}/thumbnail` });
    res.end();
    return true;
  }

  // GET /api/volumes/:id/cover
  const volumeCoverMatch = pathname.match(/^\/api\/volumes\/(\d+)\/cover$/);
  if (method === 'GET' && volumeCoverMatch) {
    const id = parseInt(volumeCoverMatch[1], 10);
    const v = db.volume.get(id);
    if (!v) { sendError(res, 404, 'Not found'); return true; }
    const cid = v.coverComicId ?? db.comics.defaultVolumeCover(id);
    if (cid == null) { sendError(res, 404, 'No cover available'); return true; }
    res.writeHead(302, { Location: `/api/comics/${cid}/thumbnail` });
    res.end();
    return true;
  }

  return false;
};

function mapChapters(records: ComicDetail[], db: import('../../libraryDatabase').LibraryDatabase, uid: number | null): unknown[] {
  return records.map((r) => overlayUserState(toWebRecord(r)!, db, uid));
}
