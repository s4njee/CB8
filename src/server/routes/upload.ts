import type { FastifyPluginAsync } from 'fastify';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { sendJson, sendError } from '../reply';
import { requireAdmin, isHostConnection } from '../guards';
import { addSingleFile, ingestPathStreaming, COMIC_EXTS, BOOK_EXTS, type IngestEvent } from '../../main/webServer/ingest';
import type { LibraryDatabase } from '../../main/libraryDatabase';
import type { RuntimeConfig } from '../config';

interface Options { db: LibraryDatabase; config: RuntimeConfig }

const plugin: FastifyPluginAsync<Options> = async (app, opts) => {
  const { db, config } = opts;

  // Skip body parsing for binary uploads — handler streams from req.raw.
  // Scoped to this plugin via Fastify's encapsulation.
  app.addContentTypeParser('application/octet-stream', (_req, _payload, done) => {
    done(null, undefined);
  });

  app.get('/api/admin/host-info', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    sendJson(reply, 200, { homePath: os.homedir() });
  });

  app.post<{ Body: { kind?: 'file' | 'directory' } }>(
    '/api/admin/pick-path',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      if (!isHostConnection(req)) { sendError(reply, 403, 'Host-only operation'); return; }
      if (!config.hostFilePicker) {
        sendError(reply, 501, 'Native file picker not available in this environment');
        return;
      }
      const kind = req.body?.kind === 'directory' ? 'directory' : 'file';
      try {
        const picked = await config.hostFilePicker(kind);
        sendJson(reply, 200, { path: picked });
      } catch (err) {
        sendError(reply, 500, err instanceof Error ? err.message : String(err));
      }
    },
  );

  app.post('/api/admin/upload', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const rawName = req.headers['x-cb8-filename'];
    const rawRel = req.headers['x-cb8-relpath'];
    if (typeof rawName !== 'string' || !rawName) {
      sendError(reply, 400, 'Missing X-CB8-Filename header'); return;
    }

    let filename: string;
    let relPath: string;
    try {
      filename = decodeURIComponent(rawName);
      relPath = typeof rawRel === 'string' && rawRel ? decodeURIComponent(rawRel) : filename;
    } catch {
      sendError(reply, 400, 'Headers are not valid percent-encoded UTF-8'); return;
    }

    const isBad = (s: string): boolean =>
      s.includes('\0') || s.startsWith('/') || s.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(s);
    if (isBad(filename) || isBad(relPath) || path.basename(filename) !== filename) {
      sendError(reply, 400, 'Invalid filename'); return;
    }
    const relParts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (relParts.length === 0 || relParts.some((p) => p === '..' || p === '.')) {
      sendError(reply, 400, 'Invalid relative path'); return;
    }

    const ext = path.extname(filename).toLowerCase();
    if (!COMIC_EXTS.has(ext) && !BOOK_EXTS.has(ext)) {
      sendError(reply, 415, 'Unsupported file type'); return;
    }

    const baseDir = path.join(config.dataDir, 'web-uploads');
    const destPath = path.resolve(baseDir, ...relParts);
    if (!destPath.startsWith(path.resolve(baseDir) + path.sep)) {
      sendError(reply, 400, 'Resolved path escapes upload directory'); return;
    }

    try {
      await fsp.mkdir(path.dirname(destPath), { recursive: true });
    } catch (err) {
      sendError(reply, 500, err instanceof Error ? err.message : String(err)); return;
    }

    if (db.comicExistsByPath(destPath)) {
      // Drain the inbound stream so the client doesn't see a connection reset.
      req.raw.resume();
      await new Promise<void>((resolve) => {
        req.raw.on('end', () => resolve());
        req.raw.on('error', () => resolve());
      });
      sendJson(reply, 200, { added: false, skipped: true, reason: 'Already in library', filePath: destPath });
      return;
    }

    const writeStream = fs.createWriteStream(destPath);
    try {
      await new Promise<void>((resolve, reject) => {
        req.raw.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', () => resolve());
        req.raw.pipe(writeStream);
      });
    } catch (err) {
      writeStream.destroy();
      await fsp.unlink(destPath).catch(() => {});
      sendError(reply, 500, `Upload failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const result = await addSingleFile(db, destPath);
    if (!result.added && result.error) {
      await fsp.unlink(destPath).catch(() => {});
      sendError(reply, 500, result.error);
      return;
    }
    sendJson(reply, 200, { added: result.added, filePath: destPath });
  });

  app.get<{ Querystring: { path?: string } }>(
    '/api/admin/list-dir',
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const raw = req.query.path ?? '';
      if (!raw) { sendJson(reply, 200, { dir: '', entries: [] }); return; }

      let dir: string;
      let prefix = '';
      try {
        const stat = fs.statSync(raw);
        if (stat.isDirectory()) dir = raw;
        else { dir = path.dirname(raw); prefix = path.basename(raw); }
      } catch {
        dir = path.dirname(raw); prefix = path.basename(raw);
      }

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const lowerPrefix = prefix.toLowerCase();
        const matches = entries
          .filter((e) => !e.name.startsWith('.') && e.name.toLowerCase().startsWith(lowerPrefix))
          .map((e) => {
            const isDir = e.isDirectory();
            const full = path.join(dir, e.name);
            return { name: e.name, path: isDir ? full + path.sep : full, isDir };
          })
          .filter((e) => {
            if (e.isDir) return true;
            const fext = path.extname(e.name).toLowerCase();
            return COMIC_EXTS.has(fext) || BOOK_EXTS.has(fext);
          })
          .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
          .slice(0, 50);
        sendJson(reply, 200, { dir, entries: matches });
      } catch (err) {
        sendError(reply, 400, err instanceof Error ? err.message : String(err));
      }
    },
  );

  app.post<{ Body: { path?: string } }>('/api/admin/add-path', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const target = req.body?.path;
    if (typeof target !== 'string' || !target.trim()) {
      sendError(reply, 400, 'Provide "path" (string)'); return;
    }

    // Stream NDJSON: take ownership of the underlying socket.
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    raw.socket?.setNoDelay(true);

    let lastEmit = 0;
    let lastProcessed = -1;
    const emit = (event: IngestEvent): void => {
      if (event.type === 'progress') {
        const now = Date.now();
        const isFirst = event.processed === 0;
        const isLast = event.processed === event.discovered && event.discovered > 0;
        if (!isFirst && !isLast && now - lastEmit < 100 && event.processed === lastProcessed) return;
        lastEmit = now;
        lastProcessed = event.processed;
      }
      raw.write(JSON.stringify(event) + '\n');
    };

    try {
      await ingestPathStreaming(db, target.trim(), emit);
    } catch (err) {
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      emit({ type: 'done', added: 0 });
    }
    raw.end();
  });
};

export default plugin;
