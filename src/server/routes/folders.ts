import type { FastifyPluginAsync } from 'fastify';
import { sendJson, sendError, parseQueryOptions } from '../reply';
import { requireAdmin } from '../guards';
import { toWebRecord } from '../../main/webServer/mapping';
import type { LibraryDatabase } from '../../main/libraryDatabase';
import type { QueryOptions } from '../../shared/types';

interface Options { db: LibraryDatabase }

const plugin: FastifyPluginAsync<Options> = async (app, opts) => {
  const { db } = opts;

  app.get('/api/folders', async (_req, reply) => {
    const folders = db.getAllFolders();
    const safe = folders.map((f) => ({
      id: f.id,
      name: f.name,
      comicCount: f.comicCount,
      mediaType: f.mediaType,
      thumbnailUrl: f.coverThumbnail ? `/api/folders/${f.id}/thumbnail` : null,
    }));
    sendJson(reply, 200, safe);
  });

  app.post<{ Body: { name?: string; comicIds?: number[] } }>(
    '/api/folders',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      if (typeof req.body?.name !== 'string' || !req.body.name.trim()) {
        sendError(reply, 400, 'Provide "name" (string)'); return;
      }
      const ids = Array.isArray(req.body.comicIds) ? req.body.comicIds.map(Number) : [];
      sendJson(reply, 201, db.createFolder(req.body.name.trim(), ids));
    },
  );

  app.put<{ Params: { id: string }; Body: { name?: string } }>(
    '/api/folders/:id',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      if (typeof req.body?.name !== 'string' || !req.body.name.trim()) {
        sendError(reply, 400, 'Provide "name" (string)'); return;
      }
      db.renameFolder(parseInt(req.params.id, 10), req.body.name.trim());
      sendJson(reply, 200, { ok: true });
    },
  );

  app.delete<{ Params: { id: string } }>('/api/folders/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    db.deleteFolder(parseInt(req.params.id, 10));
    sendJson(reply, 200, { ok: true });
  });

  app.post<{ Params: { id: string }; Body: { comicIds?: number[] } }>(
    '/api/folders/:id/comics',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const ids = req.body?.comicIds;
      if (!Array.isArray(ids) || ids.length === 0) {
        sendError(reply, 400, 'Provide "comicIds" (non-empty array)'); return;
      }
      db.addComicsToFolder(parseInt(req.params.id, 10), ids.map(Number));
      sendJson(reply, 200, { ok: true });
    },
  );

  app.delete<{ Params: { id: string }; Body: { comicIds?: number[] } }>(
    '/api/folders/:id/comics',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const ids = req.body?.comicIds;
      if (!Array.isArray(ids) || ids.length === 0) {
        sendError(reply, 400, 'Provide "comicIds" (non-empty array)'); return;
      }
      db.removeComicsFromFolder(parseInt(req.params.id, 10), ids.map(Number));
      sendJson(reply, 200, { ok: true });
    },
  );

  app.get<{ Params: { id: string } }>('/api/folders/:id/thumbnail', async (req, reply) => {
    const folderId = parseInt(req.params.id, 10);
    const folder = db.getAllFolders().find((f) => f.id === folderId);
    const thumb = folder?.coverThumbnail;
    if (!thumb || thumb.length === 0) {
      reply.code(404).send();
      return;
    }
    reply
      .code(200)
      .header('Content-Type', 'image/jpeg')
      .header('Cache-Control', 'public, max-age=3600')
      .header('Content-Length', String(thumb.length))
      .send(thumb);
  });

  app.get<{
    Params: { id: string };
    Querystring: Record<string, string>;
  }>('/api/folders/:id/comics', async (req, reply) => {
    const folderId = parseInt(req.params.id, 10);
    const opts = parseQueryOptions(req.query) as QueryOptions & {
      readStatus?: 'unread' | 'in-progress' | 'completed';
      favorites?: boolean;
      folderId?: number;
    };
    opts.folderId = folderId;
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
