import type { FastifyPluginAsync } from 'fastify';
import { sendJson, sendError } from '../reply';
import { requireUser } from '../guards';
import { toWebRecord, overlayUserState } from '../../main/webServer/mapping';
import type { LibraryDatabase } from '../../main/libraryDatabase';

interface Options { db: LibraryDatabase }

const plugin: FastifyPluginAsync<Options> = async (app, opts) => {
  const { db } = opts;

  app.put<{ Params: { id: string }; Body: { page?: number; location?: string; completed?: boolean } }>(
    '/api/comics/:id/progress',
    async (req, reply) => {
      if (!requireUser(req, reply)) return;
      const id = parseInt(req.params.id, 10);
      const parsed = req.body ?? {};
      const updates: { page?: number | null; location?: string | null; completed?: boolean } = {};
      if (typeof parsed.page === 'number') updates.page = parsed.page;
      if (typeof parsed.location === 'string') updates.location = parsed.location;
      if (typeof parsed.completed === 'boolean') updates.completed = parsed.completed;
      if (updates.page === undefined && updates.location === undefined && updates.completed === undefined) {
        sendError(reply, 400, 'Provide "page", "location", or "completed"'); return;
      }
      // Auto-complete on final page (0-indexed) unless the client said otherwise.
      if (typeof updates.page === 'number' && updates.completed === undefined) {
        const comic = db.getComic(id);
        if (comic && comic.pageCount > 0 && updates.page >= comic.pageCount - 1) {
          updates.completed = true;
        }
      }
      db.upsertUserProgress(req.user!.id, id, updates);
      if (typeof parsed.page === 'number') db.updateReadingProgress(id, parsed.page);
      else if (typeof parsed.location === 'string') db.updateReadingLocation(id, parsed.location);
      sendJson(reply, 200, { ok: true });
    },
  );

  app.delete<{ Params: { id: string } }>('/api/comics/:id/progress', async (req, reply) => {
    if (!requireUser(req, reply)) return;
    db.clearUserProgress(req.user!.id, parseInt(req.params.id, 10));
    sendJson(reply, 200, { ok: true });
  });

  app.post<{ Params: { id: string } }>('/api/comics/:id/favorite', async (req, reply) => {
    if (!requireUser(req, reply)) return;
    db.addFavorite(req.user!.id, parseInt(req.params.id, 10));
    sendJson(reply, 200, { ok: true });
  });
  app.delete<{ Params: { id: string } }>('/api/comics/:id/favorite', async (req, reply) => {
    if (!requireUser(req, reply)) return;
    db.removeFavorite(req.user!.id, parseInt(req.params.id, 10));
    sendJson(reply, 200, { ok: true });
  });

  app.get<{ Params: { id: string } }>('/api/comics/:id/bookmarks', async (req, reply) => {
    if (!requireUser(req, reply)) return;
    sendJson(reply, 200, db.listBookmarks(req.user!.id, parseInt(req.params.id, 10)));
  });
  app.post<{ Params: { id: string }; Body: { page?: number; note?: string | null } }>(
    '/api/comics/:id/bookmarks',
    async (req, reply) => {
      if (!requireUser(req, reply)) return;
      if (typeof req.body?.page !== 'number') {
        sendError(reply, 400, 'Provide "page" (number)'); return;
      }
      sendJson(
        reply,
        201,
        db.createBookmark(req.user!.id, parseInt(req.params.id, 10), req.body.page, req.body.note ?? null),
      );
    },
  );
  app.put<{ Params: { id: string; bookmarkId: string }; Body: { note?: string | null } }>(
    '/api/comics/:id/bookmarks/:bookmarkId',
    async (req, reply) => {
      if (!requireUser(req, reply)) return;
      db.updateBookmark(req.user!.id, parseInt(req.params.bookmarkId, 10), req.body?.note ?? null);
      sendJson(reply, 200, { ok: true });
    },
  );
  app.delete<{ Params: { id: string; bookmarkId: string } }>(
    '/api/comics/:id/bookmarks/:bookmarkId',
    async (req, reply) => {
      if (!requireUser(req, reply)) return;
      db.deleteBookmark(req.user!.id, parseInt(req.params.bookmarkId, 10));
      sendJson(reply, 200, { ok: true });
    },
  );

  app.post<{ Body: { comicId?: number; action?: string; page?: number | null } }>(
    '/api/history',
    async (req, reply) => {
      if (!requireUser(req, reply)) return;
      const parsed = req.body ?? {};
      if (typeof parsed.comicId !== 'number' || typeof parsed.action !== 'string') {
        sendError(reply, 400, 'Provide "comicId" and "action"'); return;
      }
      db.logHistory(req.user!.id, parsed.comicId, parsed.action, parsed.page ?? null);
      sendJson(reply, 200, { ok: true });
    },
  );
  app.get<{ Querystring: { offset?: string; limit?: string } }>(
    '/api/history',
    async (req, reply) => {
      if (!requireUser(req, reply)) return;
      const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit, 10), 200) : 50;
      sendJson(reply, 200, db.getHistory(req.user!.id, offset, limit));
    },
  );

  app.get('/api/series', async (_req, reply) => {
    const series = db.getAllSeries().map((s) => ({
      name: s.name,
      count: s.count,
      thumbnailUrl: s.coverComicId ? `/api/comics/${s.coverComicId}/thumbnail` : null,
    }));
    sendJson(reply, 200, series);
  });
  app.get<{ Params: { name: string } }>('/api/series/:name/comics', async (req, reply) => {
    const records = db.getSeriesComics(req.params.name);
    const uid = req.user?.id ?? null;
    sendJson(reply, 200, records.map((r) => overlayUserState(toWebRecord(r)!, db, uid)));
  });

  app.get<{ Querystring: { limit?: string; mediaType?: 'comic' | 'book' } }>(
    '/api/recently-read',
    async (req, reply) => {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
      const mediaType = req.query.mediaType;
      const records = req.user
        ? db.getRecentlyReadByUser(req.user.id, limit, mediaType)
        : db.getRecentlyRead(limit, mediaType);
      sendJson(reply, 200, records.map(toWebRecord));
    },
  );

  app.get<{ Querystring: { limit?: string; mediaType?: 'comic' | 'book' } }>(
    '/api/continue-reading',
    async (req, reply) => {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
      const mediaType = req.query.mediaType;
      const records = req.user
        ? db.getContinueReadingByUser(req.user.id, limit, mediaType)
        : db.getContinueReading(limit, mediaType);
      sendJson(reply, 200, records.map(toWebRecord));
    },
  );
};

export default plugin;
