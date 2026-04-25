import type { FastifyPluginAsync } from 'fastify';
import * as bcrypt from 'bcryptjs';
import { sendJson, sendError } from '../reply';
import { requireAdmin } from '../guards';
import type { LibraryDatabase } from '../../main/libraryDatabase';

interface Options { db: LibraryDatabase }

const plugin: FastifyPluginAsync<Options> = async (app, opts) => {
  const { db } = opts;

  app.get('/api/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    sendJson(reply, 200, db.listUsers());
  });

  app.post('/api/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = req.body as { username?: string; password?: string; isAdmin?: boolean } | undefined;
    if (!parsed || typeof parsed.username !== 'string' || !parsed.username.trim()) {
      sendError(reply, 400, 'Provide "username" (string)'); return;
    }
    if (typeof parsed.password !== 'string' || parsed.password.length < 1) {
      sendError(reply, 400, 'Provide "password" (string)'); return;
    }
    if (db.getUserByUsername(parsed.username.trim())) {
      sendError(reply, 409, 'Username already exists'); return;
    }
    const hash = await bcrypt.hash(parsed.password, 10);
    const user = db.createUser(parsed.username.trim(), hash, parsed.isAdmin === true);
    sendJson(reply, 201, user);
  });

  app.delete<{ Params: { id: string } }>('/api/users/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const id = parseInt(req.params.id, 10);
    if (req.user && id === req.user.id) {
      sendError(reply, 400, 'Cannot delete yourself'); return;
    }
    const target = db.getUserById(id);
    if (!target) { sendError(reply, 404, 'User not found'); return; }
    if (target.isAdmin && db.countAdmins() <= 1) {
      sendError(reply, 400, 'Cannot delete last admin'); return;
    }
    db.deleteUser(id);
    sendJson(reply, 200, { ok: true });
  });

  app.put<{ Params: { id: string }; Body: { isAdmin?: boolean } }>(
    '/api/users/:id/role',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const id = parseInt(req.params.id, 10);
      const target = db.getUserById(id);
      if (!target) { sendError(reply, 404, 'User not found'); return; }
      if (target.isAdmin && req.body?.isAdmin === false && db.countAdmins() <= 1) {
        sendError(reply, 400, 'Cannot demote last admin'); return;
      }
      db.setUserAdmin(id, req.body?.isAdmin === true);
      sendJson(reply, 200, { ok: true });
    },
  );
};

export default plugin;
