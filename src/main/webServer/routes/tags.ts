import { sendJson, sendError, readBody } from '../middleware';
import { requireAdmin, type RouteHandler } from '../context';

export const handle: RouteHandler = async (ctx) => {
  const { req, res, db, pathname, method } = ctx;

  // List all tags
  if (method === 'GET' && pathname === '/api/tags') {
    sendJson(res, 200, db.getAllTags());
    return true;
  }

  // Set tags on comic
  const comicTagsMatch = pathname.match(/^\/api\/comics\/(\d+)\/tags$/);
  if (method === 'PUT' && comicTagsMatch) {
    if (!requireAdmin(ctx)) return true;
    const id = parseInt(comicTagsMatch[1], 10);
    const record = db.getComic(id);
    if (!record) { sendError(res, 404, 'Comic not found'); return true; }
    const body = await readBody(req);
    let parsed: { tags?: string[] };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (!Array.isArray(parsed.tags)) { sendError(res, 400, 'Provide "tags" (array)'); return true; }
    const nextTags = parsed.tags
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter((t) => t.length > 0);
    const current = new Set(record.tags);
    const next = new Set(nextTags);
    for (const t of current) if (!next.has(t)) db.removeTag(id, t);
    for (const t of next) if (!current.has(t)) db.addTag(id, t);
    sendJson(res, 200, { ok: true, tags: Array.from(next) });
    return true;
  }

  // Rename tag
  const tagNameMatch = pathname.match(/^\/api\/tags\/(.+)$/);
  if (method === 'PUT' && tagNameMatch) {
    if (!requireAdmin(ctx)) return true;
    const oldName = decodeURIComponent(tagNameMatch[1]);
    const body = await readBody(req);
    let parsed: { newName?: string };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (typeof parsed.newName !== 'string' || !parsed.newName.trim()) { sendError(res, 400, 'Provide "newName" (string)'); return true; }
    db.renameTag(oldName, parsed.newName.trim());
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Delete tag
  if (method === 'DELETE' && tagNameMatch) {
    if (!requireAdmin(ctx)) return true;
    const name = decodeURIComponent(tagNameMatch[1]);
    db.deleteTag(name);
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
};
