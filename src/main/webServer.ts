/**
 * webServer.ts — CB8 embedded HTTP server (PLAN3)
 *
 * Serves:
 *   /api/*   — JSON REST API backed by LibraryDatabase
 *   /        — Static SPA files from src/web/
 *
 * Zero extra npm dependencies; uses only Node built-ins.
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as url from 'node:url';
import { LibraryDatabase } from './libraryDatabase';
import * as ArchiveLoader from './archiveLoader';
import type { ArchiveHandle } from './archiveLoader';
import type { QueryOptions } from '../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Safe comic record that does not expose the server file-system path. */
interface WebComicRecord {
  id: number;
  title: string;
  pageCount: number;
  fileSize: number;
  dateAdded: string;
  tags: string[];
  lastPage: number | null;
  lastLocation: string | null;
  lastRead: string | null;
  mediaType: 'comic' | 'book';
  thumbnailUrl: string;
  /** File extension without the dot: 'epub' | 'pdf' | 'mobi' | 'cbz' | 'cbr' */
  fileExt: string;
}

// ---------------------------------------------------------------------------
// Archive handle LRU cache (Phase 3)
// ---------------------------------------------------------------------------

const CACHE_CAPACITY = 5;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  handle: ArchiveHandle;
  filePath: string;
  lastUsed: number;
}

const handleCache = new Map<number, CacheEntry>();

async function getArchiveHandle(comicId: number, filePath: string): Promise<ArchiveHandle> {
  const now = Date.now();

  // Evict expired entries
  for (const [id, entry] of handleCache) {
    if (now - entry.lastUsed > CACHE_TTL_MS) {
      await ArchiveLoader.close(entry.handle).catch(() => {});
      handleCache.delete(id);
    }
  }

  // Evict oldest entry if at capacity
  if (!handleCache.has(comicId) && handleCache.size >= CACHE_CAPACITY) {
    let oldestId = -1;
    let oldestTime = Infinity;
    for (const [id, entry] of handleCache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestId = id;
      }
    }
    if (oldestId !== -1) {
      const evicted = handleCache.get(oldestId)!;
      await ArchiveLoader.close(evicted.handle).catch(() => {});
      handleCache.delete(oldestId);
    }
  }

  if (handleCache.has(comicId)) {
    const entry = handleCache.get(comicId)!;
    entry.lastUsed = now;
    return entry.handle;
  }

  const handle = await ArchiveLoader.open(filePath);
  handleCache.set(comicId, { handle, filePath, lastUsed: now });
  return handle;
}

export async function closeAllHandles(): Promise<void> {
  for (const entry of handleCache.values()) {
    await ArchiveLoader.close(entry.handle).catch(() => {});
  }
  handleCache.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

function parseQueryOptions(query: Record<string, string>): QueryOptions {
  const options: QueryOptions = {};
  if (query.search) options.search = query.search;
  if (query.tag) options.tag = query.tag;
  if (query.sortBy) options.sortBy = query.sortBy as QueryOptions['sortBy'];
  if (query.sortOrder) options.sortOrder = query.sortOrder as 'asc' | 'desc';
  if (query.offset) options.offset = parseInt(query.offset, 10);
  if (query.limit) options.limit = Math.min(parseInt(query.limit, 10), 200);
  if (query.mediaType) options.mediaType = query.mediaType as 'comic' | 'book';
  if (query.excludeFoldered) options.excludeFoldered = query.excludeFoldered === 'true';
  return options;
}

function toWebRecord(record: ReturnType<LibraryDatabase['getComic']>): WebComicRecord | null {
  if (!record) return null;
  return {
    id: record.id,
    title: record.title,
    pageCount: record.pageCount,
    fileSize: record.fileSize,
    dateAdded: record.dateAdded,
    tags: record.tags,
    lastPage: record.lastPage,
    lastLocation: record.lastLocation ?? null,
    lastRead: record.lastRead,
    mediaType: record.mediaType,
    thumbnailUrl: `/api/comics/${record.id}/thumbnail`,
    fileExt: path.extname(record.filePath).toLowerCase().replace(/^\./,''),
  };
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// MIME tables
// ---------------------------------------------------------------------------

const PAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  avif: 'image/avif', jxl: 'image/png',
};

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

// ---------------------------------------------------------------------------
// Static file root resolution (Phase 6)
// ---------------------------------------------------------------------------

function resolveStaticRoot(): string {
  // In production (packaged), __dirname is inside the ASAR/app directory.
  // The web static files are copied to <resources>/web/.
  // In dev, serve directly from src/web/.
  const candidates = [
    path.join(__dirname, '../../src/web'),   // dev: src/main -> project root -> src/web
    path.join(__dirname, '../web'),          // packaged: .vite/build -> web
    path.join(process.resourcesPath ?? '', 'web'), // packaged Electron resources
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  // Return the first candidate even if it doesn't exist; directory structure error
  // will be reported at request time.
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  db: LibraryDatabase,
  staticRoot: string,
): Promise<void> {
  const parsed = url.parse(req.url ?? '/', true);
  const pathname = decodeURIComponent(parsed.pathname ?? '/');
  const query = parsed.query as Record<string, string>;
  const method = req.method ?? 'GET';

  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // -------------------------------------------------------------------------
  // API routes
  // -------------------------------------------------------------------------

  if (pathname.startsWith('/api/')) {
    // --- GET /api/comics ----------------------------------------------------
    if (method === 'GET' && pathname === '/api/comics') {
      const opts = parseQueryOptions(query);
      if (!opts.limit) opts.limit = 50;
      const result = db.queryComics(opts);
      return sendJson(res, 200, {
        records: result.records.map(toWebRecord),
        totalCount: result.totalCount,
      });
    }

    // --- GET /api/comics/:id ------------------------------------------------
    const comicMatch = pathname.match(/^\/api\/comics\/(\d+)$/);
    if (method === 'GET' && comicMatch) {
      const id = parseInt(comicMatch[1], 10);
      const record = db.getComic(id);
      if (!record) return sendError(res, 404, 'Comic not found');
      return sendJson(res, 200, toWebRecord(record));
    }

    // --- GET /api/comics/:id/thumbnail --------------------------------------
    const thumbMatch = pathname.match(/^\/api\/comics\/(\d+)\/thumbnail$/);
    if (method === 'GET' && thumbMatch) {
      const id = parseInt(thumbMatch[1], 10);
      const record = db.getComic(id);
      if (!record) return sendError(res, 404, 'Comic not found');
      const thumb = record.coverThumbnail;
      if (!thumb || thumb.length === 0) {
        // Return a 1x1 transparent PNG as placeholder
        const placeholder = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64',
        );
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' });
        res.end(placeholder);
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': String(thumb.length),
      });
      res.end(thumb);
      return;
    }

    // --- GET /api/comics/:id/pages/:page ------------------------------------
    const pageMatch = pathname.match(/^\/api\/comics\/(\d+)\/pages\/(\d+)$/);
    if (method === 'GET' && pageMatch) {
      const comicId = parseInt(pageMatch[1], 10);
      const pageIndex = parseInt(pageMatch[2], 10);
      const record = db.getComic(comicId);
      if (!record) return sendError(res, 404, 'Comic not found');
      if (record.mediaType !== 'comic') return sendError(res, 400, 'Not a comic archive');
      try {
        const handle = await getArchiveHandle(comicId, record.filePath);
        if (pageIndex < 0 || pageIndex >= handle.pageCount) {
          return sendError(res, 400, `Page ${pageIndex} out of range`);
        }
        const buf = await ArchiveLoader.getPage(handle, pageIndex);
        const ext = handle.entries[pageIndex]?.filename.split('.').pop()?.toLowerCase() ?? '';
        const mime = PAGE_MIME[ext] ?? 'image/png';
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=86400',
          'Content-Length': String(buf.length),
        });
        res.end(buf);
      } catch (err) {
        console.error(`[webServer] Page read error comic=${comicId} page=${pageIndex}:`, err);
        return sendError(res, 500, 'Failed to read page');
      }
      return;
    }

    // --- GET /api/comics/:id/file (EPUB / PDF) ------------------------------
    const fileMatch = pathname.match(/^\/api\/comics\/(\d+)\/file$/);
    if (method === 'GET' && fileMatch) {
      const id = parseInt(fileMatch[1], 10);
      const record = db.getComic(id);
      if (!record) return sendError(res, 404, 'Comic not found');
      if (record.mediaType !== 'book') return sendError(res, 400, 'Not a book');
      const ext = path.extname(record.filePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.epub': 'application/epub+zip',
        '.pdf': 'application/pdf',
        '.mobi': 'application/x-mobipocket-ebook',
      };
      const mime = mimeMap[ext] ?? 'application/octet-stream';
      try {
        const stat = fs.statSync(record.filePath);
        const stream = fs.createReadStream(record.filePath);
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': String(stat.size),
          'Cache-Control': 'public, max-age=3600',
        });
        stream.pipe(res);
      } catch (err) {
        console.error(`[webServer] File read error id=${id}:`, err);
        return sendError(res, 500, 'Failed to read file');
      }
      return;
    }

    // --- PUT /api/comics/:id/progress ---------------------------------------
    const progressMatch = pathname.match(/^\/api\/comics\/(\d+)\/progress$/);
    if (method === 'PUT' && progressMatch) {
      const id = parseInt(progressMatch[1], 10);
      const body = await readBody(req);
      let parsed: { page?: number; location?: string };
      try {
        parsed = JSON.parse(body);
      } catch {
        return sendError(res, 400, 'Invalid JSON');
      }
      if (typeof parsed.location === 'string') {
        db.updateReadingLocation(id, parsed.location);
      } else if (typeof parsed.page === 'number') {
        db.updateReadingProgress(id, parsed.page);
      } else {
        return sendError(res, 400, 'Provide "page" (number) or "location" (string)');
      }
      return sendJson(res, 200, { ok: true });
    }

    // --- GET /api/libraries -------------------------------------------------
    if (method === 'GET' && pathname === '/api/libraries') {
      const mediaType = query.mediaType as 'comic' | 'book' | undefined;
      const libs = db.getAllLibraries(mediaType);
      return sendJson(res, 200, libs);
    }

    // --- GET /api/libraries/:id/comics --------------------------------------
    const libComicsMatch = pathname.match(/^\/api\/libraries\/(\d+)\/comics$/);
    if (method === 'GET' && libComicsMatch) {
      const libId = parseInt(libComicsMatch[1], 10);
      const opts = parseQueryOptions(query);
      if (!opts.limit) opts.limit = 50;
      const result = db.queryComicsByLibrary(libId, opts);
      return sendJson(res, 200, {
        records: result.records.map(toWebRecord),
        totalCount: result.totalCount,
      });
    }

    // --- GET /api/folders ---------------------------------------------------
    if (method === 'GET' && pathname === '/api/folders') {
      const folders = db.getAllFolders();
      // Strip binary coverThumbnail; supply a URL instead
      const safe = folders.map((f) => ({
        id: f.id,
        name: f.name,
        comicCount: f.comicCount,
        thumbnailUrl: f.coverThumbnail ? `/api/folders/${f.id}/thumbnail` : null,
      }));
      return sendJson(res, 200, safe);
    }

    // --- GET /api/folders/:id/thumbnail -------------------------------------
    const folderThumbMatch = pathname.match(/^\/api\/folders\/(\d+)\/thumbnail$/);
    if (method === 'GET' && folderThumbMatch) {
      const folderId = parseInt(folderThumbMatch[1], 10);
      const folders = db.getAllFolders();
      const folder = folders.find((f) => f.id === folderId);
      const thumb = folder?.coverThumbnail;
      if (!thumb || thumb.length === 0) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': String(thumb.length),
      });
      res.end(thumb);
      return;
    }

    // --- GET /api/folders/:id/comics ----------------------------------------
    const folderComicsMatch = pathname.match(/^\/api\/folders\/(\d+)\/comics$/);
    if (method === 'GET' && folderComicsMatch) {
      const folderId = parseInt(folderComicsMatch[1], 10);
      const opts = parseQueryOptions(query);
      if (!opts.limit) opts.limit = 50;
      const result = db.getFolderComics(folderId, opts);
      return sendJson(res, 200, {
        records: result.records.map(toWebRecord),
        totalCount: result.totalCount,
      });
    }

    // --- GET /api/tags ------------------------------------------------------
    if (method === 'GET' && pathname === '/api/tags') {
      return sendJson(res, 200, db.getAllTags());
    }

    // --- GET /api/recently-read ---------------------------------------------
    if (method === 'GET' && pathname === '/api/recently-read') {
      const limit = query.limit ? parseInt(query.limit, 10) : 20;
      const mediaType = query.mediaType as 'comic' | 'book' | undefined;
      const records = db.getRecentlyRead(limit, mediaType);
      return sendJson(res, 200, records.map(toWebRecord));
    }

    return sendError(res, 404, 'API endpoint not found');
  }

  // -------------------------------------------------------------------------
  // Static file serving (Phase 6)
  // -------------------------------------------------------------------------

  // Sanitize path: reject traversal attempts
  const relPath = pathname === '/' ? '/index.html' : pathname;
  const safe = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const absPath = path.join(staticRoot, safe);

  if (!absPath.startsWith(staticRoot)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stat = await fsp.stat(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime = STATIC_MIME[ext] ?? 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': String(stat.size),
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    fs.createReadStream(absPath).pipe(res);
  } catch {
    // Fall back to index.html for SPA deep links
    try {
      const indexPath = path.join(staticRoot, 'index.html');
      const indexStat = await fsp.stat(indexPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': String(indexStat.size),
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(indexPath).pipe(res);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the first non-loopback IPv4 address for display to the user. */
export function getLanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

export interface WebServerHandle {
  server: http.Server;
  port: number;
  url: string;
  lanUrl: string;
}

/**
 * Start the embedded HTTP server.
 * @param db    The open LibraryDatabase instance.
 * @param port  TCP port to listen on. Default 8008.
 */
export function startWebServer(db: LibraryDatabase, port = 8008): WebServerHandle {
  const staticRoot = resolveStaticRoot();

  const server = http.createServer((req, res) => {
    handleRequest(req, res, db, staticRoot).catch((err) => {
      console.error('[webServer] Unhandled error:', err);
      try {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      } catch { /* ignore */ }
    });
  });

  server.listen(port, '0.0.0.0', () => {
    const lan = getLanIp();
    console.log(`[CB8] Web UI: http://localhost:${port}`);
    console.log(`[CB8] LAN:    http://${lan}:${port}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[CB8] Web server port ${port} already in use. Web UI disabled.`);
    } else {
      console.error('[CB8] Web server error:', err);
    }
  });

  const lan = getLanIp();
  return {
    server,
    port,
    url: `http://localhost:${port}`,
    lanUrl: `http://${lan}:${port}`,
  };
}
