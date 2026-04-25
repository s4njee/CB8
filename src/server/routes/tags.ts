import type { FastifyPluginAsync } from 'fastify';
import { sendJson, sendError } from '../reply';
import { requireAdmin } from '../guards';
import type { LibraryDatabase } from '../../main/libraryDatabase';

interface Options { db: LibraryDatabase }

const plugin: FastifyPluginAsync<Options> = async (app, opts) => {
  const { db } = opts;

  app.get('/api/tags', async (_req, reply) => {
    sendJson(reply, 200, db.getAllTags());
  });

  app.put<{ Params: { id: string }; Body: { tags?: string[] } }>(
    '/api/comics/:id/tags',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const id = parseInt(req.params.id, 10);
      const record = db.getComic(id);
      if (!record) { sendError(reply, 404, 'Comic not found'); return; }
      if (!Array.isArray(req.body?.tags)) {
        sendError(reply, 400, 'Provide "tags" (array)'); return;
      }
      const nextTags = req.body!.tags!
        .map((t) => (typeof t === 'string' ? t.trim() : ''))
        .filter((t) => t.length > 0);
      const current = new Set(record.tags);
      const next = new Set(nextTags);
      for (const t of current) if (!next.has(t)) db.removeTag(id, t);
      for (const t of next) if (!current.has(t)) db.addTag(id, t);
      sendJson(reply, 200, { ok: true, tags: Array.from(next) });
    },
  );

  app.put<{ Params: { name: string }; Body: { newName?: string } }>(
    '/api/tags/:name',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const oldName = req.params.name;
      const newName = req.body?.newName;
      if (typeof newName !== 'string' || !newName.trim()) {
        sendError(reply, 400, 'Provide "newName" (string)'); return;
      }
      db.renameTag(oldName, newName.trim());
      sendJson(reply, 200, { ok: true });
    },
  );

  app.delete<{ Params: { name: string } }>('/api/tags/:name', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    db.deleteTag(req.params.name);
    sendJson(reply, 200, { ok: true });
  });
};

export default plugin;
