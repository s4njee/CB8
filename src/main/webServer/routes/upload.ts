import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { sendJson, sendError, readBody, isHostConnection } from '../middleware';
import { addSingleFile, ingestPathStreaming, COMIC_EXTS, BOOK_EXTS, type IngestEvent } from '../ingest';
import { requireAdmin, type RouteHandler } from '../context';
import { getRecentIngestErrors, countIngestErrors, clearIngestErrors } from '../../ingestErrorLog';

let uploadRootDir: string | null = null;

/**
 * Wire up where uploaded files land (typically `<userData>/web-uploads`).
 * When unset, falls back to a tmpdir-scoped path so tests / standalone
 * smoke tests don't crash.
 */
export function setUploadRoot(dir: string): void {
  uploadRootDir = dir;
}

function uploadRoot(): string {
  return path.join(uploadRootDir ?? path.join(os.tmpdir(), 'cb8'), 'web-uploads');
}

/**
 * Best-effort load of Electron's native dialog APIs. Returns null when
 * running outside Electron (standalone Node process), in which case the
 * pick-path route returns 503 — there's no host UI to drive a picker.
 */
function loadElectronDialog(): { dialog: typeof import('electron').dialog; BrowserWindow: typeof import('electron').BrowserWindow } | null {
  try {
    const electron = require('electron') as typeof import('electron');
    if (!electron?.dialog || !electron?.BrowserWindow) return null;
    return { dialog: electron.dialog, BrowserWindow: electron.BrowserWindow };
  } catch {
    return null;
  }
}

export const handle: RouteHandler = async (ctx) => {
  const { req, res, db, pathname, method, query } = ctx;

  // Admin: host info
  if (method === 'GET' && pathname === '/api/admin/host-info') {
    if (!requireAdmin(ctx)) return true;
    sendJson(res, 200, { homePath: os.homedir() });
    return true;
  }

  // Admin: native pick-path
  if (method === 'POST' && pathname === '/api/admin/pick-path') {
    if (!requireAdmin(ctx)) return true;
    if (!isHostConnection(req)) { sendError(res, 403, 'Host-only operation'); return true; }
    const body = await readBody(req, 64 * 1024); // admin JSON: 64 KiB is plenty
    let parsed: { kind?: 'file' | 'directory' };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    const kind = parsed.kind === 'directory' ? 'directory' : 'file';

    const electron = loadElectronDialog();
    if (!electron) {
      sendError(res, 503, 'Native file picker is unavailable in this server build');
      return true;
    }
    const win = electron.BrowserWindow.getFocusedWindow() ?? electron.BrowserWindow.getAllWindows()[0] ?? null;
    const properties: ('openFile' | 'openDirectory')[] = kind === 'directory' ? ['openDirectory'] : ['openFile'];
    const filters = kind === 'file'
      ? [{ name: 'Comics & Books', extensions: ['cbz', 'cbr', 'epub', 'pdf', 'mobi'] }]
      : undefined;

    try {
      const result = win
        ? await electron.dialog.showOpenDialog(win, { properties, filters })
        : await electron.dialog.showOpenDialog({ properties, filters });
      if (result.canceled || result.filePaths.length === 0) {
        sendJson(res, 200, { path: null });
      } else {
        sendJson(res, 200, { path: result.filePaths[0] });
      }
    } catch (err) {
      sendError(res, 500, err instanceof Error ? err.message : String(err));
    }
    return true;
  }

  // Admin: upload file (streaming raw body)
  if (method === 'POST' && pathname === '/api/admin/upload') {
    if (!requireAdmin(ctx)) return true;

    const rawName = req.headers['x-cb8-filename'];
    const rawRel = req.headers['x-cb8-relpath'];
    if (typeof rawName !== 'string' || !rawName) {
      sendError(res, 400, 'Missing X-CB8-Filename header'); return true;
    }

    let filename: string;
    let relPath: string;
    try {
      filename = decodeURIComponent(rawName);
      relPath = typeof rawRel === 'string' && rawRel ? decodeURIComponent(rawRel) : filename;
    } catch {
      sendError(res, 400, 'Headers are not valid percent-encoded UTF-8'); return true;
    }

    const isBad = (s: string): boolean =>
      s.includes('\0') || s.startsWith('/') || s.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(s);
    if (isBad(filename) || isBad(relPath) || path.basename(filename) !== filename) {
      sendError(res, 400, 'Invalid filename'); return true;
    }
    const relParts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (relParts.length === 0 || relParts.some((p) => p === '..' || p === '.')) {
      sendError(res, 400, 'Invalid relative path'); return true;
    }

    const ext = path.extname(filename).toLowerCase();
    if (!COMIC_EXTS.has(ext) && !BOOK_EXTS.has(ext)) {
      sendError(res, 415, 'Unsupported file type'); return true;
    }

    const baseDir = uploadRoot();
    const destPath = path.resolve(baseDir, ...relParts);
    if (!destPath.startsWith(path.resolve(baseDir) + path.sep)) {
      sendError(res, 400, 'Resolved path escapes upload directory'); return true;
    }

    try {
      await fsp.mkdir(path.dirname(destPath), { recursive: true });
    } catch (err) {
      sendError(res, 500, err instanceof Error ? err.message : String(err)); return true;
    }

    if (db.comicExistsByPath(destPath)) {
      req.resume();
      await new Promise<void>((resolve) => req.on('end', () => resolve()).on('error', () => resolve()));
      sendJson(res, 200, { added: false, skipped: true, reason: 'Already in library', filePath: destPath });
      return true;
    }

    const writeStream = fs.createWriteStream(destPath);
    try {
      await new Promise<void>((resolve, reject) => {
        req.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', () => resolve());
        req.pipe(writeStream);
      });
    } catch (err) {
      writeStream.destroy();
      await fsp.unlink(destPath).catch(() => {});
      sendError(res, 500, `Upload failed: ${err instanceof Error ? err.message : String(err)}`);
      return true;
    }

    const result = await addSingleFile(db, destPath);
    if (!result.added && result.error) {
      await fsp.unlink(destPath).catch(() => {});
      sendError(res, 500, result.error);
      return true;
    }
    sendJson(res, 200, { added: result.added, filePath: destPath });
    return true;
  }

  // Admin: list directory
  if (method === 'GET' && pathname === '/api/admin/list-dir') {
    if (!requireAdmin(ctx)) return true;
    const raw = typeof query.path === 'string' ? query.path : '';
    if (!raw) { sendJson(res, 200, { dir: '', entries: [] }); return true; }

    let dir: string;
    let prefix = '';
    try {
      const stat = fs.statSync(raw);
      if (stat.isDirectory()) {
        dir = raw;
      } else {
        dir = path.dirname(raw);
        prefix = path.basename(raw);
      }
    } catch {
      dir = path.dirname(raw);
      prefix = path.basename(raw);
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
          const ext = path.extname(e.name).toLowerCase();
          return COMIC_EXTS.has(ext) || BOOK_EXTS.has(ext);
        })
        .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
        .slice(0, 50);
      sendJson(res, 200, { dir, entries: matches });
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : String(err));
    }
    return true;
  }

  // Admin: read ingest-error log. Returns the total count plus the N most
  // recent records (newest first). Backing store is the JSONL file under
  // userData written by recordIngestError().
  if (method === 'GET' && pathname === '/api/admin/ingest-errors') {
    if (!requireAdmin(ctx)) return true;
    const limitParam = ctx.query.limit ? parseInt(ctx.query.limit, 10) : NaN;
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(500, limitParam)) : 50;
    sendJson(res, 200, {
      count: countIngestErrors(),
      recent: getRecentIngestErrors(limit),
    });
    return true;
  }

  // Admin: truncate the ingest-error log.
  if (method === 'DELETE' && pathname === '/api/admin/ingest-errors') {
    if (!requireAdmin(ctx)) return true;
    clearIngestErrors();
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Admin: wipe the library catalog. Users, sessions, and app settings
  // are preserved; only media-related rows (comics, tags, libraries,
  // folders, per-user state, dismissed paths) are removed. Files on
  // disk are not touched.
  if (method === 'DELETE' && pathname === '/api/admin/library') {
    if (!requireAdmin(ctx)) return true;
    const removed = db.clearLibrary();
    sendJson(res, 200, { ok: true, removed });
    return true;
  }

  // Admin: add path (streaming NDJSON)
  if (method === 'POST' && pathname === '/api/admin/add-path') {
    if (!requireAdmin(ctx)) return true;
    const body = await readBody(req, 64 * 1024); // admin JSON: 64 KiB is plenty
    let parsed: { path?: string; folderName?: string };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (typeof parsed.path !== 'string' || !parsed.path.trim()) {
      sendError(res, 400, 'Provide "path" (string)'); return true;
    }

    // Resolve optional folder target. Implicit create-if-no-match: a name
    // that doesn't case-insensitively match an existing folder creates one.
    let folderId: number | undefined;
    const folderName = typeof parsed.folderName === 'string' ? parsed.folderName.trim() : '';
    if (folderName) {
      const existing = db.getAllFolders().find(
        (f) => f.name.toLowerCase() === folderName.toLowerCase(),
      );
      folderId = existing ? existing.id : db.createFolder(folderName, []).id;
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.socket?.setNoDelay(true);

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
      res.write(JSON.stringify(event) + '\n');
    };

    try {
      await ingestPathStreaming(db, parsed.path.trim(), emit, folderId);
    } catch (err) {
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      emit({ type: 'done', added: 0 });
    }
    res.end();
    return true;
  }

  return false;
};
