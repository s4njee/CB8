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
import * as crypto from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { app, dialog, BrowserWindow } from 'electron';
import { LibraryDatabase } from './libraryDatabase';
import * as ArchiveLoader from './archiveLoader';
import type { ArchiveHandle } from './archiveLoader';
import { FileScannerImpl } from './fileScanner';
import { extractEpubCover } from './epubCoverExtractor';
import { getPdfPageCount, renderPdfFirstPageCover } from './pdfCoverExtractor';
import { generateThumbnail } from './thumbnailGenerator';
import { parseSeriesFromFilename } from './seriesParser';
import { getCachedOrResize, invalidateCacheForComic } from './imageResizer';
import { searchMetadata } from './metadataScraper';
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
  handle: Promise<ArchiveHandle>;
  filePath: string;
  lastUsed: number;
}

const handleCache = new Map<number, CacheEntry>();

/**
 * The cache stores the open *promise* (not the resolved handle) so that two
 * concurrent requests for the same uncached comic share a single open() call.
 * Storing the resolved handle would let both callers invoke ArchiveLoader.open
 * in parallel; one handle would end up in the map, the other would leak.
 */
async function getArchiveHandle(comicId: number, filePath: string): Promise<ArchiveHandle> {
  const now = Date.now();

  // Evict expired entries
  for (const [id, entry] of handleCache) {
    if (now - entry.lastUsed > CACHE_TTL_MS) {
      entry.handle.then((h) => ArchiveLoader.close(h)).catch(() => {});
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
      evicted.handle.then((h) => ArchiveLoader.close(h)).catch(() => {});
      handleCache.delete(oldestId);
    }
  }

  const existing = handleCache.get(comicId);
  if (existing) {
    existing.lastUsed = now;
    return existing.handle;
  }

  const handlePromise = ArchiveLoader.open(filePath);
  handleCache.set(comicId, { handle: handlePromise, filePath, lastUsed: now });
  // If the open fails, drop the cache entry so the next call retries.
  handlePromise.catch(() => {
    const entry = handleCache.get(comicId);
    if (entry && entry.handle === handlePromise) handleCache.delete(comicId);
  });
  return handlePromise;
}

export async function closeAllHandles(): Promise<void> {
  const entries = Array.from(handleCache.values());
  handleCache.clear();
  for (const entry of entries) {
    await entry.handle.then((h) => ArchiveLoader.close(h)).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Auth (session cookie, multi-user)
// ---------------------------------------------------------------------------

/** Legacy hardcoded admin password, migrated to the first users row on startup. */
const LEGACY_ADMIN_PASSWORD = 'gentrification';
const SESSION_COOKIE = 'cb8_admin';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const GUEST_ACCESS_KEY = 'guest_access';

interface SessionData {
  userId: number;
  expiresAt: number;
}

const sessions = new Map<string, SessionData>();

// Path is set once the Electron app is ready (userData is available).
let sessionsFilePath = '';

function loadSessions(): void {
  if (!sessionsFilePath) return;
  try {
    const raw = fs.readFileSync(sessionsFilePath, 'utf8');
    const parsed: Record<string, SessionData> = JSON.parse(raw);
    const now = Date.now();
    for (const [token, data] of Object.entries(parsed)) {
      if (data.expiresAt > now && typeof data.userId === 'number') {
        sessions.set(token, data);
      }
    }
  } catch {
    // File doesn't exist yet or is corrupt — start fresh.
  }
}

function persistSessions(): void {
  if (!sessionsFilePath) return;
  const now = Date.now();
  const out: Record<string, SessionData> = {};
  for (const [token, data] of sessions) {
    if (data.expiresAt > now) out[token] = data;
  }
  try {
    fs.writeFileSync(sessionsFilePath, JSON.stringify(out), 'utf8');
  } catch (err) {
    console.error('[CB8] Failed to persist sessions:', err);
  }
}

/**
 * "Superadmin" = authenticated admin whose connection originates from the
 * host machine itself (loopback). Host-path features require this because
 * paths only make sense for someone sitting at the server.
 */
function isHostConnection(req: http.IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

interface ResolvedUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

function resolveUser(req: http.IncomingMessage, db: LibraryDatabase): ResolvedUser | null {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = db.getUserById(session.userId);
  if (!user) {
    sessions.delete(token);
    return null;
  }
  return { id: user.id, username: user.username, isAdmin: user.isAdmin };
}

function isAuthenticated(req: http.IncomingMessage, db: LibraryDatabase): boolean {
  return resolveUser(req, db) !== null;
}

function isAdmin(req: http.IncomingMessage, db: LibraryDatabase): boolean {
  return resolveUser(req, db)?.isAdmin === true;
}

function isGuestAccessEnabled(db: LibraryDatabase): boolean {
  // Default: guests can read. Only disabled if an admin explicitly sets 'false'.
  const v = db.getAppMeta(GUEST_ACCESS_KEY);
  return v !== 'false';
}

function setSessionCookie(res: http.ServerResponse, token: string): void {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}

function clearSessionCookie(res: http.ServerResponse): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  persistSessions();
  return token;
}

async function ensureInitialAdmin(db: LibraryDatabase): Promise<void> {
  if (db.countUsers() > 0) return;
  const hash = await bcrypt.hash(LEGACY_ADMIN_PASSWORD, 10);
  db.createUser('admin', hash, true);
  console.log('[CB8] Created initial admin user (username=admin, default password).');
}

// ---------------------------------------------------------------------------
// Admin helpers: ingest a file or directory in-place
// ---------------------------------------------------------------------------

const COMIC_EXTS = new Set(['.cbz', '.cbr']);
const BOOK_EXTS = new Set(['.pdf', '.epub', '.mobi']);
const COVER_EXTRACTION_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function addSingleFile(db: LibraryDatabase, filePath: string): Promise<{ added: boolean; error?: string }> {
  const ext = path.extname(filePath).toLowerCase();
  if (!COMIC_EXTS.has(ext) && !BOOK_EXTS.has(ext)) {
    return { added: false, error: 'Unsupported file type' };
  }
  if (db.comicExistsByPath(filePath)) return { added: false };
  try {
    const stats = fs.statSync(filePath);
    const title = path.basename(filePath, ext);
    const seriesInfo = parseSeriesFromFilename(path.basename(filePath));

    if (BOOK_EXTS.has(ext)) {
      let pageCount = 0;
      if (ext === '.pdf') {
        try { pageCount = await withTimeout(getPdfPageCount(filePath), COVER_EXTRACTION_TIMEOUT_MS); } catch { /* ignore */ }
      }
      const record = db.addComic({
        filePath, title, pageCount, fileSize: stats.size,
        coverThumbnail: null, tags: [], mediaType: 'book',
        lastPage: null, lastLocation: null, lastRead: null,
      });
      if (seriesInfo.seriesName) {
        db.setComicSeries(record.id, seriesInfo.seriesName, seriesInfo.volumeNumber, seriesInfo.chapterNumber);
      }
      if (ext === '.epub' || ext === '.pdf') {
        try {
          const coverThumbnail = ext === '.epub'
            ? generateThumbnail(await withTimeout(extractEpubCover(filePath), COVER_EXTRACTION_TIMEOUT_MS))
            : await withTimeout(renderPdfFirstPageCover(filePath), COVER_EXTRACTION_TIMEOUT_MS);
          if (coverThumbnail) db.updateCoverThumbnailByPath(record.filePath, coverThumbnail);
        } catch { /* placeholder thumbnail */ }
      }
      return { added: true };
    }

    const handle = await ArchiveLoader.open(filePath);
    try {
      let coverImage: Buffer | null = null;
      try { coverImage = await ArchiveLoader.getCoverImage(handle); } catch { /* placeholder */ }
      const coverThumbnail = generateThumbnail(coverImage);
      const record = db.addComic({
        filePath, title, pageCount: handle.pageCount, fileSize: stats.size,
        coverThumbnail, tags: [], mediaType: 'comic',
        lastPage: null, lastLocation: null, lastRead: null,
      });
      if (seriesInfo.seriesName) {
        db.setComicSeries(record.id, seriesInfo.seriesName, seriesInfo.volumeNumber, seriesInfo.chapterNumber);
      }
    } finally {
      await ArchiveLoader.close(handle);
    }
    return { added: true };
  } catch (err) {
    return { added: false, error: err instanceof Error ? err.message : String(err) };
  }
}

type IngestEvent =
  | { type: 'progress'; phase: 'comics' | 'books' | 'file'; discovered: number; processed: number; currentFile: string }
  | { type: 'error'; message: string }
  | { type: 'done'; added: number };

async function ingestPathStreaming(
  db: LibraryDatabase,
  targetPath: string,
  emit: (event: IngestEvent) => void,
): Promise<void> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(targetPath);
  } catch (err) {
    emit({ type: 'error', message: `Cannot access path: ${err instanceof Error ? err.message : String(err)}` });
    emit({ type: 'done', added: 0 });
    return;
  }

  if (stat.isDirectory()) {
    const scanner = new FileScannerImpl(db);
    let added = 0;
    try {
      added += await scanner.scan(targetPath, (p) => {
        emit({ type: 'progress', phase: 'comics', discovered: p.discovered, processed: p.processed, currentFile: path.basename(p.currentFile) });
      });
    } catch (err) {
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    try {
      added += await scanner.scanBooks(targetPath, (p) => {
        emit({ type: 'progress', phase: 'books', discovered: p.discovered, processed: p.processed, currentFile: path.basename(p.currentFile) });
      });
    } catch (err) {
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    emit({ type: 'done', added });
    return;
  }

  if (stat.isFile()) {
    emit({ type: 'progress', phase: 'file', discovered: 1, processed: 0, currentFile: path.basename(targetPath) });
    const result = await addSingleFile(db, targetPath);
    emit({ type: 'progress', phase: 'file', discovered: 1, processed: 1, currentFile: path.basename(targetPath) });
    if (result.error) emit({ type: 'error', message: `${targetPath}: ${result.error}` });
    emit({ type: 'done', added: result.added ? 1 : 0 });
    return;
  }

  emit({ type: 'error', message: 'Path is not a regular file or directory' });
  emit({ type: 'done', added: 0 });
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
  if (query.fileExt) options.fileExt = String(query.fileExt).toLowerCase().replace(/^\./, '');
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

/**
 * Overlay per-user progress and favorited onto a base web record. For guests
 * (userId == null), blank out progress fields — the shared row's values
 * reflect the admin's reading and leak their position across users.
 */
function overlayUserState(
  base: WebComicRecord,
  db: LibraryDatabase,
  userId: number | null,
): WebComicRecord & { favorited: boolean } {
  if (userId == null) {
    return { ...base, lastPage: null, lastLocation: null, lastRead: null, favorited: false };
  }
  const up = db.getUserProgress(userId, base.id);
  return {
    ...base,
    lastPage: up?.lastPage ?? null,
    lastLocation: up?.lastLocation ?? null,
    lastRead: up?.lastRead ?? null,
    favorited: db.isFavorite(userId, base.id),
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
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
    const currentUser = resolveUser(req, db);
    const guestEnabled = isGuestAccessEnabled(db);

    // --- Guest access middleware ------------------------------------------
    // Endpoints accessible without auth at all (login, session lookup)
    const publicEndpoints = new Set([
      '/api/auth/session', '/api/auth/login', '/api/admin/session', '/api/admin/login',
    ]);
    const isPublic = publicEndpoints.has(pathname);
    // GET is "read-only"; mutations require auth even when guest is enabled
    const isReadOnly = method === 'GET';
    if (!currentUser && !isPublic) {
      if (!guestEnabled) return sendError(res, 401, 'Unauthorized');
      if (!isReadOnly) return sendError(res, 401, 'Unauthorized');
    }

    // --- Auth: session status ---------------------------------------------
    if (method === 'GET' && (pathname === '/api/auth/session' || pathname === '/api/admin/session')) {
      return sendJson(res, 200, {
        authenticated: currentUser !== null,
        user: currentUser,
        host: isHostConnection(req),
        guestAccess: guestEnabled,
      });
    }

    // --- Admin: host info (home dir for path pre-fill) --------------------
    if (method === 'GET' && pathname === '/api/admin/host-info') {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      return sendJson(res, 200, { homePath: os.homedir() });
    }

    // --- Auth: login ------------------------------------------------------
    if (method === 'POST' && (pathname === '/api/auth/login' || pathname === '/api/admin/login')) {
      const body = await readBody(req);
      let parsed: { username?: string; password?: string };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (typeof parsed.password !== 'string') {
        return sendError(res, 400, 'Provide "password"');
      }
      // Legacy admin endpoint has no username field; default to 'admin'
      const username = typeof parsed.username === 'string' && parsed.username ? parsed.username : 'admin';
      const user = db.getUserByUsername(username);
      if (!user) return sendError(res, 401, 'Invalid credentials');
      const ok = await bcrypt.compare(parsed.password, user.passwordHash);
      if (!ok) return sendError(res, 401, 'Invalid credentials');
      const token = createSession(user.id);
      setSessionCookie(res, token);
      return sendJson(res, 200, {
        ok: true,
        user: { id: user.id, username: user.username, isAdmin: user.isAdmin },
      });
    }

    // --- Auth: register (admin only) --------------------------------------
    if (method === 'POST' && pathname === '/api/auth/register') {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const body = await readBody(req);
      let parsed: { username?: string; password?: string; isAdmin?: boolean };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (typeof parsed.username !== 'string' || !parsed.username.trim()) {
        return sendError(res, 400, 'Provide "username" (string)');
      }
      if (typeof parsed.password !== 'string' || parsed.password.length < 1) {
        return sendError(res, 400, 'Provide "password" (string)');
      }
      if (db.getUserByUsername(parsed.username.trim())) {
        return sendError(res, 409, 'Username already exists');
      }
      const hash = await bcrypt.hash(parsed.password, 10);
      const user = db.createUser(parsed.username.trim(), hash, parsed.isAdmin === true);
      return sendJson(res, 201, user);
    }

    // --- Auth / Admin: logout ---------------------------------------------
    if (method === 'POST' && (pathname === '/api/auth/logout' || pathname === '/api/admin/logout')) {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (token) { sessions.delete(token); persistSessions(); }
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    // --- Settings: guest access toggle (admin only) -----------------------
    if (method === 'PUT' && pathname === '/api/settings/guest-access') {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const body = await readBody(req);
      let parsed: { enabled?: boolean };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      db.setAppMeta(GUEST_ACCESS_KEY, parsed.enabled === true ? 'true' : 'false');
      return sendJson(res, 200, { ok: true, enabled: parsed.enabled === true });
    }

    // --- Users: list (admin only) -----------------------------------------
    if (method === 'GET' && pathname === '/api/users') {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      return sendJson(res, 200, db.listUsers());
    }

    // --- Users: create (admin only) ---------------------------------------
    if (method === 'POST' && pathname === '/api/users') {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const body = await readBody(req);
      let parsed: { username?: string; password?: string; isAdmin?: boolean };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (typeof parsed.username !== 'string' || !parsed.username.trim()) {
        return sendError(res, 400, 'Provide "username" (string)');
      }
      if (typeof parsed.password !== 'string' || parsed.password.length < 1) {
        return sendError(res, 400, 'Provide "password" (string)');
      }
      if (db.getUserByUsername(parsed.username.trim())) {
        return sendError(res, 409, 'Username already exists');
      }
      const hash = await bcrypt.hash(parsed.password, 10);
      const user = db.createUser(parsed.username.trim(), hash, parsed.isAdmin === true);
      return sendJson(res, 201, user);
    }

    // --- Users: delete (admin only, cannot delete self) -------------------
    const userIdMatch = pathname.match(/^\/api\/users\/(\d+)$/);
    if (method === 'DELETE' && userIdMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const id = parseInt(userIdMatch[1], 10);
      if (currentUser && id === currentUser.id) {
        return sendError(res, 400, 'Cannot delete yourself');
      }
      const target = db.getUserById(id);
      if (!target) return sendError(res, 404, 'User not found');
      if (target.isAdmin && db.countAdmins() <= 1) {
        return sendError(res, 400, 'Cannot delete last admin');
      }
      db.deleteUser(id);
      return sendJson(res, 200, { ok: true });
    }

    // --- Users: set role (admin only, cannot demote last admin) -----------
    const userRoleMatch = pathname.match(/^\/api\/users\/(\d+)\/role$/);
    if (method === 'PUT' && userRoleMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const id = parseInt(userRoleMatch[1], 10);
      const body = await readBody(req);
      let parsed: { isAdmin?: boolean };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      const target = db.getUserById(id);
      if (!target) return sendError(res, 404, 'User not found');
      if (target.isAdmin && parsed.isAdmin === false && db.countAdmins() <= 1) {
        return sendError(res, 400, 'Cannot demote last admin');
      }
      db.setUserAdmin(id, parsed.isAdmin === true);
      return sendJson(res, 200, { ok: true });
    }

    // --- Admin: native file / folder picker --------------------------------
    // Pops the OS dialog on the Electron host. Only useful when the admin is
    // sitting at the machine running the app.
    if (method === 'POST' && pathname === '/api/admin/pick-path') {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      // Pops a native dialog on the host; only meaningful from the host itself.
      if (!isHostConnection(req)) return sendError(res, 403, 'Host-only operation');
      const body = await readBody(req);
      let parsed: { kind?: 'file' | 'directory' };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      const kind = parsed.kind === 'directory' ? 'directory' : 'file';

      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
      const properties: ('openFile' | 'openDirectory')[] = kind === 'directory' ? ['openDirectory'] : ['openFile'];
      const filters = kind === 'file'
        ? [{ name: 'Comics & Books', extensions: ['cbz', 'cbr', 'epub', 'pdf', 'mobi'] }]
        : undefined;

      try {
        const result = win
          ? await dialog.showOpenDialog(win, { properties, filters })
          : await dialog.showOpenDialog({ properties, filters });
        if (result.canceled || result.filePaths.length === 0) {
          return sendJson(res, 200, { path: null });
        }
        return sendJson(res, 200, { path: result.filePaths[0] });
      } catch (err) {
        return sendError(res, 500, err instanceof Error ? err.message : String(err));
      }
    }

    // --- Admin: upload a single file (streaming raw body) ------------------
    // Client sends one POST per file with `X-CB8-Filename` (required) and
    // `X-CB8-Relpath` (optional, for folder-drops — forward slashes only).
    // Both headers are percent-encoded to carry non-ASCII names safely.
    if (method === 'POST' && pathname === '/api/admin/upload') {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');

      const rawName = req.headers['x-cb8-filename'];
      const rawRel = req.headers['x-cb8-relpath'];
      if (typeof rawName !== 'string' || !rawName) {
        return sendError(res, 400, 'Missing X-CB8-Filename header');
      }

      let filename: string;
      let relPath: string;
      try {
        filename = decodeURIComponent(rawName);
        relPath = typeof rawRel === 'string' && rawRel ? decodeURIComponent(rawRel) : filename;
      } catch {
        return sendError(res, 400, 'Headers are not valid percent-encoded UTF-8');
      }

      // Reject null bytes, absolute paths, and any traversal component.
      const isBad = (s: string): boolean =>
        s.includes('\0') || s.startsWith('/') || s.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(s);
      if (isBad(filename) || isBad(relPath) || path.basename(filename) !== filename) {
        return sendError(res, 400, 'Invalid filename');
      }
      const relParts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
      if (relParts.length === 0 || relParts.some((p) => p === '..' || p === '.')) {
        return sendError(res, 400, 'Invalid relative path');
      }

      const ext = path.extname(filename).toLowerCase();
      if (!COMIC_EXTS.has(ext) && !BOOK_EXTS.has(ext)) {
        return sendError(res, 415, 'Unsupported file type');
      }

      const baseDir = path.join(app.getPath('userData'), 'web-uploads');
      const destPath = path.resolve(baseDir, ...relParts);
      if (!destPath.startsWith(path.resolve(baseDir) + path.sep)) {
        return sendError(res, 400, 'Resolved path escapes upload directory');
      }

      try {
        await fsp.mkdir(path.dirname(destPath), { recursive: true });
      } catch (err) {
        return sendError(res, 500, err instanceof Error ? err.message : String(err));
      }

      // If the file already exists in the library, skip the write entirely.
      if (db.comicExistsByPath(destPath)) {
        // Drain the request body so the client can finish its upload cleanly.
        req.resume();
        await new Promise<void>((resolve) => req.on('end', () => resolve()).on('error', () => resolve()));
        return sendJson(res, 200, { added: false, skipped: true, reason: 'Already in library', filePath: destPath });
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
        return sendError(res, 500, `Upload failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      const result = await addSingleFile(db, destPath);
      if (!result.added && result.error) {
        await fsp.unlink(destPath).catch(() => {});
        return sendError(res, 500, result.error);
      }
      return sendJson(res, 200, { added: result.added, filePath: destPath });
    }

    // --- Admin: list directory (path autocomplete) -------------------------
    // Returns entries for the given partial path. If the path ends with `/`
    // (or is a directory), list its children; otherwise list the parent's
    // children filtered by basename prefix.
    if (method === 'GET' && pathname === '/api/admin/list-dir') {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const raw = typeof query.path === 'string' ? query.path : '';
      if (!raw) return sendJson(res, 200, { dir: '', entries: [] });

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
        return sendJson(res, 200, { dir, entries: matches });
      } catch (err) {
        return sendError(res, 400, err instanceof Error ? err.message : String(err));
      }
    }

    // --- Admin: add path (scan) — streaming NDJSON -------------------------
    if (method === 'POST' && pathname === '/api/admin/add-path') {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const body = await readBody(req);
      let parsed: { path?: string };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (typeof parsed.path !== 'string' || !parsed.path.trim()) {
        return sendError(res, 400, 'Provide "path" (string)');
      }

      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      });
      // Disable Nagle's algorithm so each write() flushes immediately to the browser.
      res.socket?.setNoDelay(true);

      // Throttle progress emissions so 10k-file scans don't flood the socket.
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
        await ingestPathStreaming(db, parsed.path.trim(), emit);
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        emit({ type: 'done', added: 0 });
      }
      res.end();
      return;
    }

    // --- DELETE /api/comics/:id (admin-only) -------------------------------
    const deleteMatch = pathname.match(/^\/api\/comics\/(\d+)$/);
    if (method === 'DELETE' && deleteMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const id = parseInt(deleteMatch[1], 10);
      if (!db.getComic(id)) return sendError(res, 404, 'Comic not found');
      // Evict from archive handle cache before removing the DB row
      const entry = handleCache.get(id);
      if (entry) {
        handleCache.delete(id);
        await entry.handle.then((h) => ArchiveLoader.close(h)).catch(() => {});
      }
      db.removeComics([id]);
      return sendJson(res, 200, { ok: true });
    }

    // --- GET /api/comics ----------------------------------------------------
    if (method === 'GET' && pathname === '/api/comics') {
      const opts = parseQueryOptions(query) as QueryOptions & { readStatus?: 'unread' | 'in-progress' | 'completed'; favorites?: boolean };
      if (!opts.limit) opts.limit = 50;
      if (query.readStatus === 'unread' || query.readStatus === 'in-progress' || query.readStatus === 'completed') {
        opts.readStatus = query.readStatus;
      }
      if (query.favorites === 'true') opts.favorites = true;
      const result = db.queryComicsForUser(currentUser?.id ?? null, opts);
      return sendJson(res, 200, {
        records: result.records.map((r) => ({ ...toWebRecord(r)!, favorited: r.favorited ?? false })),
        totalCount: result.totalCount,
      });
    }

    // --- GET /api/comics/:id ------------------------------------------------
    const comicMatch = pathname.match(/^\/api\/comics\/(\d+)$/);
    if (method === 'GET' && comicMatch) {
      const id = parseInt(comicMatch[1], 10);
      const record = db.getComic(id);
      if (!record) return sendError(res, 404, 'Comic not found');
      return sendJson(res, 200, overlayUserState(toWebRecord(record)!, db, currentUser?.id ?? null));
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
      // Optional resize via ?width=NNN
      const widthParam = query.width ? parseInt(query.width, 10) : NaN;
      if (Number.isFinite(widthParam) && widthParam > 0) {
        try {
          const out = await getCachedOrResize(id, -1, widthParam, async () => ({ buffer: thumb, ext: 'jpg' }));
          res.writeHead(200, {
            'Content-Type': `image/${out.ext}`,
            'Cache-Control': 'public, max-age=3600',
            'Content-Length': String(out.buffer.length),
          });
          res.end(out.buffer);
          return;
        } catch (err) {
          console.warn('[webServer] Thumbnail resize failed, falling back:', err);
        }
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
        const ext = handle.entries[pageIndex]?.filename.split('.').pop()?.toLowerCase() ?? '';
        const mime = PAGE_MIME[ext] ?? 'image/png';

        // Optional resize via ?width=NNN
        const widthParam = query.width ? parseInt(query.width, 10) : NaN;
        if (Number.isFinite(widthParam) && widthParam > 0) {
          try {
            const out = await getCachedOrResize(comicId, pageIndex, widthParam, async () => {
              const buf = await ArchiveLoader.getPage(handle, pageIndex);
              return { buffer: buf, ext };
            });
            res.writeHead(200, {
              'Content-Type': `image/${out.ext}`,
              'Cache-Control': 'public, max-age=86400',
              'Content-Length': String(out.buffer.length),
            });
            res.end(out.buffer);
            return;
          } catch (err) {
            console.warn('[webServer] Page resize failed, falling back:', err);
          }
        }

        const buf = await ArchiveLoader.getPage(handle, pageIndex);
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
        stream.on('error', (streamErr) => {
          console.error(`[webServer] File stream error id=${id}:`, streamErr);
          // Headers may already be sent — just tear down.
          stream.destroy();
          res.destroy();
        });
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

    // --- PUT /api/comics/:id/progress (per-user) ----------------------------
    const progressMatch = pathname.match(/^\/api\/comics\/(\d+)\/progress$/);
    if (method === 'PUT' && progressMatch) {
      if (!currentUser) return sendError(res, 401, 'Unauthorized');
      const id = parseInt(progressMatch[1], 10);
      const body = await readBody(req);
      let parsed: { page?: number; location?: string; completed?: boolean };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      const opts: { page?: number | null; location?: string | null; completed?: boolean } = {};
      if (typeof parsed.page === 'number') opts.page = parsed.page;
      if (typeof parsed.location === 'string') opts.location = parsed.location;
      if (typeof parsed.completed === 'boolean') opts.completed = parsed.completed;
      if (opts.page === undefined && opts.location === undefined && opts.completed === undefined) {
        return sendError(res, 400, 'Provide "page", "location", or "completed"');
      }
      db.upsertUserProgress(currentUser.id, id, opts);
      // Maintain the shared last_read on the comic for admin sorting/UI
      if (typeof parsed.page === 'number') db.updateReadingProgress(id, parsed.page);
      else if (typeof parsed.location === 'string') db.updateReadingLocation(id, parsed.location);
      return sendJson(res, 200, { ok: true });
    }

    // --- DELETE /api/comics/:id/progress (mark as unread) -------------------
    if (method === 'DELETE' && progressMatch) {
      if (!currentUser) return sendError(res, 401, 'Unauthorized');
      const id = parseInt(progressMatch[1], 10);
      db.clearUserProgress(currentUser.id, id);
      return sendJson(res, 200, { ok: true });
    }

    // --- POST/DELETE /api/comics/:id/favorite -------------------------------
    const favMatch = pathname.match(/^\/api\/comics\/(\d+)\/favorite$/);
    if (favMatch && (method === 'POST' || method === 'DELETE')) {
      if (!currentUser) return sendError(res, 401, 'Unauthorized');
      const id = parseInt(favMatch[1], 10);
      if (method === 'POST') db.addFavorite(currentUser.id, id);
      else db.removeFavorite(currentUser.id, id);
      return sendJson(res, 200, { ok: true });
    }

    // --- Bookmarks ---------------------------------------------------------
    const bookmarksMatch = pathname.match(/^\/api\/comics\/(\d+)\/bookmarks$/);
    if (method === 'GET' && bookmarksMatch) {
      if (!currentUser) return sendError(res, 401, 'Unauthorized');
      const id = parseInt(bookmarksMatch[1], 10);
      return sendJson(res, 200, db.listBookmarks(currentUser.id, id));
    }
    if (method === 'POST' && bookmarksMatch) {
      if (!currentUser) return sendError(res, 401, 'Unauthorized');
      const id = parseInt(bookmarksMatch[1], 10);
      const body = await readBody(req);
      let parsed: { page?: number; note?: string | null };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (typeof parsed.page !== 'number') return sendError(res, 400, 'Provide "page" (number)');
      const bm = db.createBookmark(currentUser.id, id, parsed.page, parsed.note ?? null);
      return sendJson(res, 201, bm);
    }
    const bookmarkItemMatch = pathname.match(/^\/api\/comics\/(\d+)\/bookmarks\/(\d+)$/);
    if (method === 'PUT' && bookmarkItemMatch) {
      if (!currentUser) return sendError(res, 401, 'Unauthorized');
      const bookmarkId = parseInt(bookmarkItemMatch[2], 10);
      const body = await readBody(req);
      let parsed: { note?: string | null };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      db.updateBookmark(currentUser.id, bookmarkId, parsed.note ?? null);
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'DELETE' && bookmarkItemMatch) {
      if (!currentUser) return sendError(res, 401, 'Unauthorized');
      const bookmarkId = parseInt(bookmarkItemMatch[2], 10);
      db.deleteBookmark(currentUser.id, bookmarkId);
      return sendJson(res, 200, { ok: true });
    }

    // --- Reading history --------------------------------------------------
    if (method === 'POST' && pathname === '/api/history') {
      if (!currentUser) return sendError(res, 401, 'Unauthorized');
      const body = await readBody(req);
      let parsed: { comicId?: number; action?: string; page?: number | null };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (typeof parsed.comicId !== 'number' || typeof parsed.action !== 'string') {
        return sendError(res, 400, 'Provide "comicId" and "action"');
      }
      db.logHistory(currentUser.id, parsed.comicId, parsed.action, parsed.page ?? null);
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'GET' && pathname === '/api/history') {
      if (!currentUser) return sendError(res, 401, 'Unauthorized');
      const offset = query.offset ? parseInt(query.offset, 10) : 0;
      const limit = query.limit ? Math.min(parseInt(query.limit, 10), 200) : 50;
      return sendJson(res, 200, db.getHistory(currentUser.id, offset, limit));
    }

    // --- Series -----------------------------------------------------------
    if (method === 'GET' && pathname === '/api/series') {
      const series = db.getAllSeries().map((s) => ({
        name: s.name,
        count: s.count,
        thumbnailUrl: s.coverComicId ? `/api/comics/${s.coverComicId}/thumbnail` : null,
      }));
      return sendJson(res, 200, series);
    }
    const seriesComicsMatch = pathname.match(/^\/api\/series\/([^/]+)\/comics$/);
    if (method === 'GET' && seriesComicsMatch) {
      const name = decodeURIComponent(seriesComicsMatch[1]);
      const records = db.getSeriesComics(name);
      const uid = currentUser?.id ?? null;
      return sendJson(res, 200, records.map((r) => overlayUserState(toWebRecord(r)!, db, uid)));
    }

    // --- Metadata search (admin only) -------------------------------------
    const metadataSearchMatch = pathname.match(/^\/api\/comics\/(\d+)\/metadata-search$/);
    if (method === 'GET' && metadataSearchMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const q = typeof query.q === 'string' ? query.q : '';
      const srcsRaw = typeof query.sources === 'string' ? query.sources : '';
      const allowed = new Set(['comicvine', 'anilist', 'mangadex']);
      const srcs = srcsRaw
        .split(',').map((s) => s.trim()).filter((s) => allowed.has(s)) as Array<'comicvine' | 'anilist' | 'mangadex'>;
      const result = await searchMetadata(q, srcs.length ? srcs : undefined);
      return sendJson(res, 200, result);
    }

    // --- Metadata apply (admin only) --------------------------------------
    const metadataPutMatch = pathname.match(/^\/api\/comics\/(\d+)\/metadata$/);
    if (method === 'PUT' && metadataPutMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const id = parseInt(metadataPutMatch[1], 10);
      if (!db.getComic(id)) return sendError(res, 404, 'Comic not found');
      const body = await readBody(req);
      let parsed: {
        title?: string; author?: string | null; artist?: string | null;
        genre?: string | string[] | null; year?: number | null; summary?: string | null;
        externalId?: string | null; externalSource?: string | null;
        seriesName?: string | null; volumeNumber?: number | null; chapterNumber?: number | null;
        coverUrl?: string | null;
      };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      // Validate genre as JSON array of strings if provided as array
      let genreStr: string | null | undefined;
      if (parsed.genre !== undefined) {
        if (parsed.genre === null) genreStr = null;
        else if (Array.isArray(parsed.genre)) {
          if (!parsed.genre.every((g) => typeof g === 'string')) {
            return sendError(res, 400, '"genre" array must contain strings only');
          }
          genreStr = JSON.stringify(parsed.genre);
        } else if (typeof parsed.genre === 'string') {
          genreStr = parsed.genre;
        } else {
          return sendError(res, 400, '"genre" must be string, array, or null');
        }
      }
      db.updateComicMetadata(id, {
        title: parsed.title,
        author: parsed.author,
        artist: parsed.artist,
        genre: genreStr,
        year: parsed.year,
        summary: parsed.summary,
        externalId: parsed.externalId,
        externalSource: parsed.externalSource,
        seriesName: parsed.seriesName,
        volumeNumber: parsed.volumeNumber,
        chapterNumber: parsed.chapterNumber,
      });
      // Optionally fetch cover thumbnail from URL
      if (typeof parsed.coverUrl === 'string' && parsed.coverUrl) {
        try {
          const resp = await fetch(parsed.coverUrl);
          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            const thumb = generateThumbnail(buf);
            const record = db.getComic(id);
            if (record && thumb) db.updateCoverThumbnailByPath(record.filePath, thumb);
            invalidateCacheForComic(id);
          }
        } catch { /* ignore cover fetch failure */ }
      }
      return sendJson(res, 200, { ok: true });
    }

    // --- GET /api/libraries -------------------------------------------------
    if (method === 'GET' && pathname === '/api/libraries') {
      const mediaType = query.mediaType as 'comic' | 'book' | undefined;
      const libs = db.getAllLibraries(mediaType);
      return sendJson(res, 200, libs);
    }

    // --- POST /api/libraries ------------------------------------------------
    if (method === 'POST' && pathname === '/api/libraries') {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const body = await readBody(req);
      let parsed: { name?: string; mediaType?: string };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
        return sendError(res, 400, 'Provide "name" (string)');
      }
      const mediaType = parsed.mediaType === 'book' ? 'book' : 'comic';
      try {
        const lib = db.createLibrary(parsed.name.trim(), mediaType);
        return sendJson(res, 201, lib);
      } catch {
        return sendError(res, 409, 'A collection with that name already exists');
      }
    }

    // --- PUT /api/libraries/:id (rename) ------------------------------------
    const libRenameMatch = pathname.match(/^\/api\/libraries\/(\d+)$/);
    if (method === 'PUT' && libRenameMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const id = parseInt(libRenameMatch[1], 10);
      const body = await readBody(req);
      let parsed: { name?: string };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
        return sendError(res, 400, 'Provide "name" (string)');
      }
      try {
        db.renameLibrary(id, parsed.name.trim());
        return sendJson(res, 200, { ok: true });
      } catch {
        return sendError(res, 409, 'A collection with that name already exists');
      }
    }

    // --- DELETE /api/libraries/:id ------------------------------------------
    if (method === 'DELETE' && libRenameMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const id = parseInt(libRenameMatch[1], 10);
      db.deleteLibrary(id);
      return sendJson(res, 200, { ok: true });
    }

    // --- DELETE /api/libraries/:id/comics (remove comics from library) ------
    const libRemoveComicsMatch = pathname.match(/^\/api\/libraries\/(\d+)\/comics$/);
    if (method === 'DELETE' && libRemoveComicsMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const libId = parseInt(libRemoveComicsMatch[1], 10);
      const body = await readBody(req);
      let parsed: { comicIds?: number[] };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (!Array.isArray(parsed.comicIds) || parsed.comicIds.length === 0) {
        return sendError(res, 400, 'Provide "comicIds" (non-empty array)');
      }
      db.removeComicsFromLibrary(libId, parsed.comicIds.map(Number));
      return sendJson(res, 200, { ok: true });
    }

    // --- POST /api/libraries/:id/comics -------------------------------------
    const libAddComicsMatch = pathname.match(/^\/api\/libraries\/(\d+)\/comics$/);
    if (method === 'POST' && libAddComicsMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const libId = parseInt(libAddComicsMatch[1], 10);
      const body = await readBody(req);
      let parsed: { comicIds?: number[] };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (!Array.isArray(parsed.comicIds) || parsed.comicIds.length === 0) {
        return sendError(res, 400, 'Provide "comicIds" (non-empty array)');
      }
      db.addComicsToLibrary(libId, parsed.comicIds.map(Number));
      return sendJson(res, 200, { ok: true });
    }

    // --- GET /api/libraries/:id/comics --------------------------------------
    const libComicsMatch = pathname.match(/^\/api\/libraries\/(\d+)\/comics$/);
    if (method === 'GET' && libComicsMatch) {
      const libId = parseInt(libComicsMatch[1], 10);
      const opts = parseQueryOptions(query) as QueryOptions & { readStatus?: 'unread' | 'in-progress' | 'completed'; favorites?: boolean; libraryId?: number };
      opts.libraryId = libId;
      if (!opts.limit) opts.limit = 50;
      if (query.readStatus === 'unread' || query.readStatus === 'in-progress' || query.readStatus === 'completed') {
        opts.readStatus = query.readStatus;
      }
      if (query.favorites === 'true') opts.favorites = true;
      const result = db.queryComicsForUser(currentUser?.id ?? null, opts);
      return sendJson(res, 200, {
        records: result.records.map((r) => ({ ...toWebRecord(r)!, favorited: r.favorited ?? false })),
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

    // --- POST /api/folders (create) -----------------------------------------
    if (method === 'POST' && pathname === '/api/folders') {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const body = await readBody(req);
      let parsed: { name?: string; comicIds?: number[] };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
        return sendError(res, 400, 'Provide "name" (string)');
      }
      const ids = Array.isArray(parsed.comicIds) ? parsed.comicIds.map(Number) : [];
      const folder = db.createFolder(parsed.name.trim(), ids);
      return sendJson(res, 201, folder);
    }

    // --- PUT /api/folders/:id (rename) --------------------------------------
    const folderIdMatch = pathname.match(/^\/api\/folders\/(\d+)$/);
    if (method === 'PUT' && folderIdMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const id = parseInt(folderIdMatch[1], 10);
      const body = await readBody(req);
      let parsed: { name?: string };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
        return sendError(res, 400, 'Provide "name" (string)');
      }
      db.renameFolder(id, parsed.name.trim());
      return sendJson(res, 200, { ok: true });
    }

    // --- DELETE /api/folders/:id --------------------------------------------
    if (method === 'DELETE' && folderIdMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const id = parseInt(folderIdMatch[1], 10);
      db.deleteFolder(id);
      return sendJson(res, 200, { ok: true });
    }

    // --- POST/DELETE /api/folders/:id/comics --------------------------------
    const folderComicsMutMatch = pathname.match(/^\/api\/folders\/(\d+)\/comics$/);
    if ((method === 'POST' || method === 'DELETE') && folderComicsMutMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const folderId = parseInt(folderComicsMutMatch[1], 10);
      const body = await readBody(req);
      let parsed: { comicIds?: number[] };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (!Array.isArray(parsed.comicIds) || parsed.comicIds.length === 0) {
        return sendError(res, 400, 'Provide "comicIds" (non-empty array)');
      }
      const ids = parsed.comicIds.map(Number);
      if (method === 'POST') db.addComicsToFolder(folderId, ids);
      else db.removeComicsFromFolder(folderId, ids);
      return sendJson(res, 200, { ok: true });
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
      const opts = parseQueryOptions(query) as QueryOptions & { readStatus?: 'unread' | 'in-progress' | 'completed'; favorites?: boolean; folderId?: number };
      opts.folderId = folderId;
      if (!opts.limit) opts.limit = 50;
      if (query.readStatus === 'unread' || query.readStatus === 'in-progress' || query.readStatus === 'completed') {
        opts.readStatus = query.readStatus;
      }
      if (query.favorites === 'true') opts.favorites = true;
      const result = db.queryComicsForUser(currentUser?.id ?? null, opts);
      return sendJson(res, 200, {
        records: result.records.map((r) => ({ ...toWebRecord(r)!, favorited: r.favorited ?? false })),
        totalCount: result.totalCount,
      });
    }

    // --- GET /api/tags ------------------------------------------------------
    if (method === 'GET' && pathname === '/api/tags') {
      return sendJson(res, 200, db.getAllTags());
    }

    // --- PUT /api/comics/:id/tags (set tags) --------------------------------
    const comicTagsMatch = pathname.match(/^\/api\/comics\/(\d+)\/tags$/);
    if (method === 'PUT' && comicTagsMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const id = parseInt(comicTagsMatch[1], 10);
      const record = db.getComic(id);
      if (!record) return sendError(res, 404, 'Comic not found');
      const body = await readBody(req);
      let parsed: { tags?: string[] };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (!Array.isArray(parsed.tags)) return sendError(res, 400, 'Provide "tags" (array)');
      const nextTags = parsed.tags
        .map((t) => (typeof t === 'string' ? t.trim() : ''))
        .filter((t) => t.length > 0);
      const current = new Set(record.tags);
      const next = new Set(nextTags);
      for (const t of current) if (!next.has(t)) db.removeTag(id, t);
      for (const t of next) if (!current.has(t)) db.addTag(id, t);
      return sendJson(res, 200, { ok: true, tags: Array.from(next) });
    }

    // --- PUT /api/tags/:name (rename) ---------------------------------------
    const tagNameMatch = pathname.match(/^\/api\/tags\/(.+)$/);
    if (method === 'PUT' && tagNameMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const oldName = decodeURIComponent(tagNameMatch[1]);
      const body = await readBody(req);
      let parsed: { newName?: string };
      try { parsed = JSON.parse(body); } catch { return sendError(res, 400, 'Invalid JSON'); }
      if (typeof parsed.newName !== 'string' || !parsed.newName.trim()) {
        return sendError(res, 400, 'Provide "newName" (string)');
      }
      db.renameTag(oldName, parsed.newName.trim());
      return sendJson(res, 200, { ok: true });
    }

    // --- DELETE /api/tags/:name ---------------------------------------------
    if (method === 'DELETE' && tagNameMatch) {
      if (!isAdmin(req, db)) return sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
      const name = decodeURIComponent(tagNameMatch[1]);
      db.deleteTag(name);
      return sendJson(res, 200, { ok: true });
    }

    // --- GET /api/recently-read ---------------------------------------------
    if (method === 'GET' && pathname === '/api/recently-read') {
      const limit = query.limit ? parseInt(query.limit, 10) : 20;
      const mediaType = query.mediaType as 'comic' | 'book' | undefined;
      const records = currentUser
        ? db.getRecentlyReadByUser(currentUser.id, limit, mediaType)
        : db.getRecentlyRead(limit, mediaType);
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
      'Cache-Control': 'no-cache',
    });
    const staticStream = fs.createReadStream(absPath);
    staticStream.on('error', (err) => {
      console.error(`[webServer] Static stream error ${absPath}:`, err);
      staticStream.destroy();
      res.destroy();
    });
    staticStream.pipe(res);
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
      const indexStream = fs.createReadStream(indexPath);
      indexStream.on('error', (err) => {
        console.error(`[webServer] Index stream error ${indexPath}:`, err);
        indexStream.destroy();
        res.destroy();
      });
      indexStream.pipe(res);
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
  sessionsFilePath = path.join(app.getPath('userData'), 'cb8-sessions.json');
  loadSessions();

  // Create initial admin user on first startup (uses legacy password).
  ensureInitialAdmin(db).catch((err) => {
    console.error('[CB8] Failed to create initial admin user:', err);
  });

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
