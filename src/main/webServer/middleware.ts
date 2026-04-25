import * as http from 'node:http';
import * as bcrypt from 'bcryptjs';
import type { LibraryDatabase } from '../libraryDatabase';
import type { QueryOptions } from '../../shared/types';
export const GUEST_ACCESS_KEY = 'guest_access';
const INITIAL_ADMIN_PASSWORD_ENV = 'CB8_INITIAL_ADMIN_PASSWORD';

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
  const v = db.getAppMeta(GUEST_ACCESS_KEY);
  return v !== 'false';
}

function getInitialAdminPassword(): string {
  const password = process.env[INITIAL_ADMIN_PASSWORD_ENV]?.trim();
  if (!password) {
    throw new Error(`Missing ${INITIAL_ADMIN_PASSWORD_ENV} for admin bootstrap`);
  }
  return password;
}

export async function ensureInitialAdmin(db: LibraryDatabase): Promise<void> {
  const existing = db.getUserByUsername('admin');
  if (!existing && db.countUsers() === 0) {
    const hash = await bcrypt.hash(getInitialAdminPassword(), 10);
    db.createUser('admin', hash, true);
    console.log('[CB8] Created initial admin user from CB8_INITIAL_ADMIN_PASSWORD.');
    return;
  }
  // Repair: ensure the built-in admin account always has a usable credential.
  if (existing && (!existing.passwordHash || existing.passwordHash.length === 0)) {
    const hash = await bcrypt.hash(getInitialAdminPassword(), 10);
    db.setUserPasswordHash(existing.id, hash);
    console.log('[CB8] Restored bootstrap password on existing admin account from CB8_INITIAL_ADMIN_PASSWORD.');
  }
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
