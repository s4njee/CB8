import type { FastifyPluginAsync } from 'fastify';
import { sendJson, sendError, parseQueryOptions } from '../reply';
import { requireAdmin } from '../guards';
import { toWebRecord } from '../../main/webServer/mapping';
import type { LibraryDatabase } from '../../main/libraryDatabase';
import type { QueryOptions } from '../../shared/types';

interface Options { db: LibraryDatabase }

const plugin: FastifyPluginAsync<Options> = async (app, opts) => {
  const { db } = opts;

  app.get<{ Querystring: { mediaType?: 'comic' | 'book' } }>(
    '/api/libraries',
    async (req, reply) => {
      sendJson(reply, 200, db.getAllLibraries(req.query.mediaType));
    },
  );

  app.post<{ Body: { name?: string; mediaType?: string } }>(
    '/api/libraries',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      if (typeof req.body?.name !== 'string' || !req.body.name.trim()) {
        sendError(reply, 400, 'Provide "name" (string)'); return;
      }
      const mediaType = req.body.mediaType === 'book' ? 'book' : 'comic';
      try {
        sendJson(reply, 201, db.createLibrary(req.body.name.trim(), mediaType));
      } catch {
        sendError(reply, 409, 'A collection with that name already exists');
      }
    },
  );

  app.put<{ Params: { id: string }; Body: { name?: string } }>(
    '/api/libraries/:id',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const id = parseInt(req.params.id, 10);
      if (typeof req.body?.name !== 'string' || !req.body.name.trim()) {
        sendError(reply, 400, 'Provide "name" (string)'); return;
      }
      try {
        db.renameLibrary(id, req.body.name.trim());
        sendJson(reply, 200, { ok: true });
      } catch {
        sendError(reply, 409, 'A collection with that name already exists');
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/api/libraries/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    db.deleteLibrary(parseInt(req.params.id, 10));
    sendJson(reply, 200, { ok: true });
  });

  app.delete<{ Params: { id: string }; Body: { comicIds?: number[] } }>(
    '/api/libraries/:id/comics',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const ids = req.body?.comicIds;
      if (!Array.isArray(ids) || ids.length === 0) {
        sendError(reply, 400, 'Provide "comicIds" (non-empty array)'); return;
      }
      db.removeComicsFromLibrary(parseInt(req.params.id, 10), ids.map(Number));
      sendJson(reply, 200, { ok: true });
    },
  );

  app.post<{ Params: { id: string }; Body: { comicIds?: number[] } }>(
    '/api/libraries/:id/comics',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const ids = req.body?.comicIds;
      if (!Array.isArray(ids) || ids.length === 0) {
        sendError(reply, 400, 'Provide "comicIds" (non-empty array)'); return;
      }
      db.addComicsToLibrary(parseInt(req.params.id, 10), ids.map(Number));
      sendJson(reply, 200, { ok: true });
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: Record<string, string>;
  }>('/api/libraries/:id/comics', async (req, reply) => {
    const libId = parseInt(req.params.id, 10);
    const opts = parseQueryOptions(req.query) as QueryOptions & {
      readStatus?: 'unread' | 'in-progress' | 'completed';
      favorites?: boolean;
      libraryId?: number;
    };
    opts.libraryId = libId;
    if (!opts.limit) opts.limit = 50;
    const rs = req.query.readStatus;
    if (rs === 'unread' || rs === 'in-progress' || rs === 'completed') opts.readStatus = rs;
    if (req.query.favorites === 'true') opts.favorites = true;
    const result = db.queryComicsForUser(req.user?.id ?? null, opts);
    sendJson(reply, 200, {
      records: result.records.map((r) => ({ ...toWebRecord(r)!, favorited: r.favorited ?? false })),
      totalCount: result.totalCount,
    });
  });
};

export default plugin;
