import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import type { LibraryDatabase } from '../libraryDatabase';
import type { QueryOptions } from '../../shared/types';

export const GUEST_ACCESS_KEY = 'guest_access';

/**
 * 18 bytes → 24 url-safe base64 chars. Enough entropy that the password is
 * useful as the only credential on first boot, short enough to retype.
 */
function generateInitialAdminPassword(): string {
  return crypto.randomBytes(18).toString('base64url');
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

export function isGuestAccessEnabled(db: LibraryDatabase): boolean {
  // Default: guests can read. Only disabled if an admin explicitly sets 'false'.
  const v = db.appMeta.getAppMeta(GUEST_ACCESS_KEY);
  return v !== 'false';
}

export function ensureInitialAdmin(db: LibraryDatabase): void {
  if (db.users.countUsers() === 0) {
    _createInitialAdmin(db);
    return;
  }
  // Migration: admin exists but initial_password was never stored (created
  // before this feature). Reset the admin password so the client can auto-login.
  const stored = db.appMeta.getAppMeta('initial_password');
  if (stored === null) {
    _resetInitialPassword(db);
  }
}

function _createInitialAdmin(db: LibraryDatabase): void {
  const password = generateInitialAdminPassword();
  const hash = bcrypt.hashSync(password, 10);
  const user = db.users.createUser('admin', hash, true);
  // better-auth's username plugin validates the returned user shape on
  // sign-in and rejects rows where email / display_username / name are null.
  // Populate them up front so /api/auth/sign-in/username succeeds without
  // further surgery.
  db.raw.prepare(
    `UPDATE users
        SET email = 'admin@localhost',
            email_verified = 1,
            display_username = 'admin',
            name = 'admin',
            updated_at = datetime('now')
      WHERE id = ?`
  ).run(user.id);
  db.users.upsertCredentialAccount(user.id, 'admin', hash);
  db.appMeta.setAppMeta('initial_password', password);
  _printPasswordBanner(password, 'Initial admin account created.');
}

function _resetInitialPassword(db: LibraryDatabase): void {
  const admin = db.users.getUserByUsername('admin');
  if (!admin) return;
  const password = generateInitialAdminPassword();
  const hash = bcrypt.hashSync(password, 10);
  db.raw.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(hash, admin.id);
  db.users.upsertCredentialAccount(admin.id, 'admin', hash);
  db.appMeta.setAppMeta('initial_password', password);
  _printPasswordBanner(password, 'Admin password reset (initial_password not set).');
}

function _printPasswordBanner(password: string, headline: string): void {
  const banner = '='.repeat(60);
  console.log(`\n${banner}`);
  console.log(`[CB8] ${headline}`);
  console.log('      username: admin');
  console.log(`      password: ${password}`);
  console.log('      Sign in and change this password immediately.');
  console.log(`${banner}\n`);
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

const DEFAULT_BODY_LIMIT = 1_048_576; // 1 MiB

export class BodyTooLargeError extends Error {
  readonly statusCode = 413;
  constructor(limit: number) {
    super(`Request body exceeds ${limit} bytes`);
    this.name = 'BodyTooLargeError';
  }
}

export async function readBody(req: http.IncomingMessage, maxBytes = DEFAULT_BODY_LIMIT): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) {
        req.destroy();
        reject(new BodyTooLargeError(maxBytes));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
