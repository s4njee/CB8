import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { sendJson, sendError, readBody, isHostConnection } from '../middleware';
import { ingestPathStreaming, COMIC_EXTS, BOOK_EXTS, type IngestEvent } from '../ingest';
import { requireAdmin, type RouteHandler } from '../context';

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

  // Admin: add path (streaming NDJSON)
  if (method === 'POST' && pathname === '/api/admin/add-path') {
    if (!requireAdmin(ctx)) return true;
    const body = await readBody(req, 64 * 1024); // admin JSON: 64 KiB is plenty
    let parsed: { path?: string; folderName?: string; skipComicInfo?: boolean; skipThumbnails?: boolean };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    if (typeof parsed.path !== 'string' || !parsed.path.trim()) {
      sendError(res, 400, 'Provide "path" (string)'); return true;
    }

    // Resolve optional folder target. Implicit create-if-no-match: a name
    // that doesn't case-insensitively match an existing folder creates one.
    let folderId: number | undefined;
    const folderName = typeof parsed.folderName === 'string' ? parsed.folderName.trim() : '';
    if (folderName) {
      const existing = db.folders.getAllFolders().find(
        (f) => f.name.toLowerCase() === folderName.toLowerCase(),
      );
      folderId = existing ? existing.id : db.folders.createFolder(folderName, []).id;
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
      await ingestPathStreaming(db, parsed.path.trim(), emit, folderId, {
        skipComicInfo: parsed.skipComicInfo === true,
        skipThumbnails: parsed.skipThumbnails === true,
      });
    } catch (err) {
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      emit({ type: 'done', added: 0 });
    }
    res.end();
    return true;
  }

  return false;
};
