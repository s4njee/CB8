import * as http from 'node:http';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import type { LibraryDatabase } from '../libraryDatabase';
import type { QueryOptions } from '../../shared/types';

/** Legacy hardcoded admin password, migrated to the first users row on startup. */
const LEGACY_ADMIN_PASSWORD = 'gentrification';
export const SESSION_COOKIE = 'cb8_admin';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const GUEST_ACCESS_KEY = 'guest_access';

interface SessionData {
  userId: number;
  expiresAt: number;
}

const sessions = new Map<string, SessionData>();

// Path is set once the Electron app is ready (userData is available).
let sessionsFilePath = '';

export function setSessionsFilePath(p: string): void {
  sessionsFilePath = p;
}

export function loadSessions(): void {
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

export function persistSessions(): void {
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
export function isHostConnection(req: http.IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

export function parseCookies(header: string | undefined): Record<string, string> {
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

export interface ResolvedUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

export function resolveUser(req: http.IncomingMessage, db: LibraryDatabase): ResolvedUser | null {
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

export function isAuthenticated(req: http.IncomingMessage, db: LibraryDatabase): boolean {
  return resolveUser(req, db) !== null;
}

export function isAdmin(req: http.IncomingMessage, db: LibraryDatabase): boolean {
  return resolveUser(req, db)?.isAdmin === true;
}

export function isGuestAccessEnabled(db: LibraryDatabase): boolean {
  // Default: guests can read. Only disabled if an admin explicitly sets 'false'.
  const v = db.getAppMeta(GUEST_ACCESS_KEY);
  return v !== 'false';
}

export function setSessionCookie(res: http.ServerResponse, token: string): void {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}

export function clearSessionCookie(res: http.ServerResponse): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  persistSessions();
  return token;
}

export function deleteSession(token: string): void {
  sessions.delete(token);
  persistSessions();
}

export async function ensureInitialAdmin(db: LibraryDatabase): Promise<void> {
  if (db.countUsers() > 0) return;
  const hash = await bcrypt.hash(LEGACY_ADMIN_PASSWORD, 10);
  db.createUser('admin', hash, true);
  console.log('[CB8] Created initial admin user (username=admin, default password).');
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

export function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

export function parseQueryOptions(query: Record<string, string>): QueryOptions {
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

export async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
