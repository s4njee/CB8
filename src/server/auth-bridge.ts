/**
 * Simple session-based auth using bcrypt + cookie + in-memory session map.
 * Replaces better-auth with a minimal implementation.
 */
import * as crypto from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ResolvedUser } from '../main/webServer/middleware';
import type { LibraryDatabase } from '../main/libraryDatabase';

const SESSION_COOKIE = 'cb8_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface Session {
  userId: number;
  expiresAt: number;
}

const sessions = new Map<string, Session>();

let _db: LibraryDatabase | null = null;

export function initAuth(db: import('better-sqlite3').Database): void {
  // We receive the raw better-sqlite3 Database but we need the LibraryDatabase wrapper.
  // Store nothing here — we'll pass db through route options instead.
}

export function initAuthWithDb(db: LibraryDatabase): void {
  _db = db;
}

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

function getSessionToken(req: FastifyRequest): string | null {
  const cookieHeader = req.raw.headers.cookie;
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const k = pair.slice(0, eq).trim();
    if (k === SESSION_COOKIE) return decodeURIComponent(pair.slice(eq + 1).trim());
  }
  return null;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  reply.header('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export async function resolveCurrentUser(req: FastifyRequest): Promise<ResolvedUser | null> {
  const token = getSessionToken(req);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  if (!_db) return null;
  const user = _db.getUserById(session.userId);
  if (!user) {
    sessions.delete(token);
    return null;
  }
  return { id: user.id, username: user.username, isAdmin: user.isAdmin };
}

export async function verifyCredentials(db: LibraryDatabase, username: string, password: string): Promise<ResolvedUser | null> {
  const user = db.getUserByUsername(username);
  if (!user || !user.passwordHash) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return { id: user.id, username: user.username, isAdmin: user.isAdmin };
}

/** No-op — kept for compatibility with app.ts wildcard route. */
export async function delegateToBetterAuth(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  reply.code(404).send({ error: 'Not found' });
}
